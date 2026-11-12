import { createClient } from 'npm:@supabase/supabase-js@2.117.0'
import { albumPageCursor, photoCaptureTime, publicImageId } from './album-order.ts'

const origin = 'https://anh-xuong.betweenus57btuxuong.chatgpt.site'
const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, serviceKey)
const pageCursor = albumPageCursor(serviceKey)
const bucket = 'photo-album'
const maxBytes = 12 * 1024 * 1024
const pageSize = 24
const legacyImageId = /^[1-9]\d{0,14}$/
const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'x-album-key, content-type',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers })
}

async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function readPhoto(req: Request) {
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

function photoType(bytes: Uint8Array) {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  const tag = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length))
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (tag(0, 4) === 'RIFF' && tag(8, 4) === 'WEBP') return 'image/webp'
  if (['GIF87a', 'GIF89a'].includes(tag(0, 6))) return 'image/gif'
  return null
}

function batchMediaPath(value: unknown) {
  if (typeof value !== 'string') return null
  const prefix = `${url}/storage/v1/object/public/plate-media/`
  if (!value.startsWith(prefix)) return null
  const path = value.slice(prefix.length).split(/[?#]/, 1)[0]
  return /^[a-z0-9_-]+(?:\/[a-z0-9_.-]+)+$/i.test(path) && !path.split('/').some(part => part === '..' || part === '.')
    ? path : null
}

async function servePhoto(workspace: string, id: string, full: boolean) {
  const { data: item, error } = await admin.from('photo_album_images')
    .select('upload_hash,report_user_id,report_id,report_image,report_thumb').eq('workspace_id', workspace)
    .eq(legacyImageId.test(id) ? 'id' : 'public_id', id).maybeSingle()
  if (error) throw error
  if (!item) return json({ error: 'Ảnh không còn trong album.' }, 404)

  let storageBucket = bucket
  let paths: (string | null)[] = [`${workspace}/${item.upload_hash}`]
  if (item.report_id) {
    const { data: report, error: reportError } = await admin.from('batch_reports')
      .select('id').eq('workspace_id', workspace).eq('user_id', item.report_user_id)
      .eq('id', item.report_id).maybeSingle()
    if (reportError) throw reportError
    if (!report) return json({ error: 'Ảnh không còn trong album.' }, 404)
    storageBucket = 'plate-media'
    paths = full ? [batchMediaPath(item.report_image)] : [batchMediaPath(item.report_thumb), batchMediaPath(item.report_image)]
  }
  for (const path of new Set(paths)) {
    if (!path) continue
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    const photo = await fetch(`${url}/storage/v1/object/authenticated/${storageBucket}/${encoded}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }, redirect: 'error',
    })
    const type = photo.headers.get('content-type')?.split(';', 1)[0] ?? ''
    if (photo.ok && photoTypes.has(type)) {
      return new Response(photo.body, { headers: { ...headers, 'Content-Type': type } })
    }
    await photo.body?.cancel()
  }
  return json({ error: 'Không tải được ảnh này.' }, 404)
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Thao tác không hợp lệ.' }, 405)
  const key = req.headers.get('x-album-key') ?? ''
  if (!/^[a-f0-9]{64}$/.test(key)) return json({ error: 'Link ảnh không hợp lệ hoặc đã bị tắt.' }, 401)

  try {
    const { data: album, error: albumError } = await admin.from('photo_albums').select('workspace_id')
      .eq('key_hash', await sha256(new TextEncoder().encode(key))).maybeSingle()
    if (albumError) throw albumError
    if (!album) return json({ error: 'Link ảnh không hợp lệ hoặc đã bị tắt.' }, 401)
    const workspace = album.workspace_id
    const params = new URL(req.url).searchParams
    const id = params.get('id')
    const before = params.get('before')

    if (req.method === 'GET') {
      if (id && !publicImageId.test(id) && !legacyImageId.test(id)) return json({ error: 'Mã ảnh không hợp lệ.' }, 400)
      if (id) return await servePhoto(workspace, id, params.get('full') === '1')
      if (before && legacyImageId.test(before)) return json({ images: [], next: null })
      const anchor = before ? await pageCursor.decode(before, workspace) : null
      if (before && !anchor) return json({ error: 'Mốc xem ảnh không hợp lệ.' }, 400)
      const { data, error } = await admin.rpc('photo_album_capture_page', {
        p_workspace_id: workspace,
        p_before_at: anchor?.sort_at ?? null,
        p_before_id: anchor?.public_id ?? null,
      })
      if (error) throw error
      const page = data.slice(0, pageSize)
      return json({
        images: page.map((item: { public_id: string }) => item.public_id),
        next: data.length > pageSize ? await pageCursor.encode(page.at(-1), workspace) : null,
      })
    }

    if (Number(req.headers.get('content-length')) > maxBytes) return json({ error: 'Ảnh tối đa 12 MB.' }, 413)
    const bytes = await readPhoto(req)
    if (!bytes) return json({ error: 'Ảnh tối đa 12 MB.' }, 413)
    const contentType = photoType(bytes)
    if (!contentType) return json({ error: 'Chọn ảnh JPG, PNG, WebP hoặc GIF.' }, 415)
    const hash = await sha256(bytes)
    const { data: existing, error: existingError } = await admin.from('photo_album_images')
      .select('id').eq('workspace_id', workspace).eq('upload_hash', hash).maybeSingle()
    if (existingError) throw existingError
    if (existing) return json({ ok: true })

    const { error: uploadError } = await admin.storage.from(bucket).upload(`${workspace}/${hash}`, bytes, {
      contentType, upsert: true, cacheControl: '0',
    })
    if (uploadError) throw uploadError
    const { error: saveError } = await admin.from('photo_album_images').upsert({
      workspace_id: workspace, upload_hash: hash, sort_at: photoCaptureTime(bytes) ?? '-infinity',
    }, { onConflict: 'workspace_id,upload_hash', ignoreDuplicates: true })
    if (saveError) throw saveError
    return json({ ok: true }, 201)
  } catch {
    return json({ error: 'Chưa kết nối được album. Vui lòng thử lại.' }, 503)
  }
})
