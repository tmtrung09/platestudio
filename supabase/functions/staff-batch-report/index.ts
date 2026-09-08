// Nhận ảnh từ nhân viên đã vào bằng link QR + anonymous session.
// Service-role chỉ tồn tại trong Edge Function, tuyệt đối không đưa vào HTML/Netlify.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})
const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const form = await req.formData()
    const token = String(form.get('token') || '')
    const action = String(form.get('action') || 'create')
    const file = form.get('image')
    const thumbnail = form.get('thumbnail')
    const imageHash = String(form.get('imageHash') || '').toLowerCase()
    const requestedPhotoTakenAt = String(form.get('photoTakenAt') || '')
    if (!/^[a-f0-9]{48}$/i.test(token)) return json({ error: 'Liên kết nhân viên không hợp lệ' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)
    const tokenHash = await sha256(token)
    const { data: access, error: tokenError } = await admin
      .from('staff_access_tokens')
      .select('id, owner_user_id, label')
      .eq('token_hash', tokenHash).eq('active', true).gt('expires_at', new Date().toISOString()).maybeSingle()
    if (tokenError || !access) return json({ error: 'Liên kết đã hết hạn hoặc đã bị thu hồi' }, 401)
    /* Link nhân viên được tạo từ chủ xưởng, còn ứng dụng hiện đọc dữ liệu theo
       workspace dùng chung. Trước đây function chỉ ghi user_id nên ảnh upload
       thành công nhưng bị giao diện workspace bỏ qua. */
    const { data: workspace, error: workspaceError } = await admin.from('workspaces')
      .select('id').eq('owner_user_id', access.owner_user_id).maybeSingle()
    if (workspaceError) throw workspaceError
    if (!workspace?.id) return json({ error: 'Workspace của xưởng chưa sẵn sàng. Hãy mở Plate Studio bằng tài khoản chủ xưởng một lần rồi thử lại.' }, 409)
    const workspaceId = workspace.id

    /* Ảnh vừa bấm chụp được tải nền. Nếu nhân viên bỏ ảnh sau khi upload xong,
       cùng token này được phép dọn đúng bản ghi/ảnh của xưởng đó. */
    if (action === 'delete') {
      const reportId = String(form.get('reportId') || '')
      if (!/^[a-f0-9-]{20,}$/i.test(reportId)) return json({ error: 'Mã báo cáo không hợp lệ' }, 400)
      const { data: row, error: rowError } = await admin.from('batch_reports')
        .select('data').eq('workspace_id', workspaceId).eq('id', reportId).maybeSingle()
      if (rowError) throw rowError
      const report = (row?.data || {}) as Record<string, unknown>
      if (report.source !== 'staff-link') return json({ error: 'Chỉ được xoá ảnh vừa gửi từ liên kết nhân viên' }, 403)
      const { data: files, error: listError } = await admin.storage.from('plate-media')
        .list(`${access.owner_user_id}/staff-batch-reports`, { limit: 20, search: reportId })
      if (listError) throw listError
      const paths = (files || []).filter((x) => x.name.includes(reportId))
        .map((x) => `${access.owner_user_id}/staff-batch-reports/${x.name}`)
      if (paths.length) {
        const { error: removeError } = await admin.storage.from('plate-media').remove(paths)
        if (removeError) throw removeError
      }
      const { error: deleteError } = await admin.from('batch_reports')
        .delete().eq('workspace_id', workspaceId).eq('id', reportId)
      if (deleteError) throw deleteError
      return json({ ok: true, deleted: reportId })
    }

    if (!(file instanceof File) || !file.type.startsWith('image/')) return json({ error: 'Cần một ảnh hợp lệ' }, 400)
    if (file.size > 12 * 1024 * 1024) return json({ error: 'Ảnh tối đa 12 MB' }, 413)
    if (imageHash && !/^[a-f0-9]{64}$/.test(imageHash)) return json({ error: 'Mã nhận diện ảnh không hợp lệ' }, 400)

    if (imageHash) {
      const { data: existing, error: duplicateError } = await admin.from('batch_reports')
        .select('data').eq('workspace_id', workspaceId).contains('data', { imageHash }).limit(1).maybeSingle()
      if (duplicateError) throw duplicateError
      if (existing?.data) return json({ ok: true, duplicate: true, report: existing.data })
    }

    let actor: Record<string, unknown> = {}
    try { actor = JSON.parse(String(form.get('actor') || '{}')) } catch (_) {}
    const clean = (v: unknown, max = 80) => String(v || '').trim().slice(0, max)
    const deviceId = clean(actor.deviceId, 120)
    if (deviceId) {
      const { data: device } = await admin.from('device_registry')
        .select('status').eq('user_id', access.owner_user_id).eq('device_id', deviceId).maybeSingle()
      if (device?.status === 'blocked') return json({ error: 'Thiết bị này đã bị quản lý xưởng chặn' }, 403)
      const now = new Date().toISOString()
      await admin.from('device_registry').upsert({
        user_id: access.owner_user_id, device_id: deviceId,
        label: clean(actor.deviceLabel) || 'Thiết bị nhân viên',
        operator_name: clean(actor.name) || 'Nhân viên', device_kind: clean(actor.deviceKind, 40),
        last_seen_at: now, source: 'staff-link'
      }, { onConflict: 'user_id,device_id' })
    }
    const reportId = crypto.randomUUID()
    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
    const path = `${access.owner_user_id}/staff-batch-reports/${reportId}.${ext}`
    const { error: uploadError } = await admin.storage.from('plate-media').upload(path, file, {
      contentType: file.type, upsert: false,
    })
    if (uploadError) throw uploadError
    const { data: publicUrl } = admin.storage.from('plate-media').getPublicUrl(path)
    let thumbUrl: string | null = null
    if (thumbnail instanceof File && thumbnail.type.startsWith('image/')) {
      const thumbPath = `${access.owner_user_id}/staff-batch-reports/${reportId}-thumb.jpg`
      const { error: thumbError } = await admin.storage.from('plate-media').upload(thumbPath, thumbnail, {
        contentType: 'image/jpeg', upsert: false,
      })
      /* Ảnh gốc đã an toàn trên Storage. Thumbnail chỉ để tải nhanh ở thư viện,
         không được khiến cả báo cáo biến mất nếu lần upload phụ này chập chờn. */
      if (thumbError) console.warn('Thumbnail báo cáo chưa tải được, dùng ảnh gốc', thumbError)
      else thumbUrl = admin.storage.from('plate-media').getPublicUrl(thumbPath).data.publicUrl
    }
    const now = new Date().toISOString()
    /* Client đọc EXIF của file gốc trước khi nén. Chỉ nhận mốc hợp lệ để
       không cho một client gửi ngày vô lý làm rối timeline báo cáo. */
    const photoTime = Date.parse(requestedPhotoTakenAt)
    const photoTakenAt = Number.isFinite(photoTime)
      && photoTime >= Date.UTC(2000, 0, 1)
      && photoTime <= Date.now() + 24 * 60 * 60 * 1000
      ? new Date(photoTime).toISOString()
      : null
    const capturedBy = {
      name: clean(actor.name) || 'Nhân viên',
      deviceId,
      deviceLabel: clean(actor.deviceLabel),
      deviceKind: clean(actor.deviceKind, 40),
      accessLabel: access.label,
      source: 'staff-link',
    }
    const report = { id: reportId, image: publicUrl.publicUrl, thumb: thumbUrl || publicUrl.publicUrl, imageHash: imageHash || null,
      imageHashAlg: imageHash ? 'SHA-256' : null, imageSize: file.size, filamentId: null, createdAt: photoTakenAt || now,
      capturedAt: photoTakenAt || now, photoTakenAt, photoTakenAtSource: photoTakenAt ? 'exif' : 'upload', capturedBy, status: 'pending', appliedItems: [], source: 'staff-link' }
    const { error: insertError } = await admin.from('batch_reports').insert({
      id: reportId, user_id: access.owner_user_id, workspace_id: workspaceId, data: report, updated_at: now,
    })
    if (insertError) {
      /* Một thiết bị khác có thể vừa gửi đúng ảnh này trong lúc upload.
         Dọn file vừa tạo rồi trả bản ghi đã có, không để Storage phình thêm. */
      if (insertError.code === '23505' && imageHash) {
        await admin.storage.from('plate-media').remove([
          path,
          `${access.owner_user_id}/staff-batch-reports/${reportId}-thumb.jpg`,
        ])
        const { data: existing } = await admin.from('batch_reports')
          .select('data').eq('workspace_id', workspaceId).contains('data', { imageHash }).limit(1).maybeSingle()
        return json({ ok: true, duplicate: true, report: existing?.data || null })
      }
      throw insertError
    }
    await admin.from('staff_access_tokens').update({ last_used_at: now }).eq('id', access.id)
    return json({ ok: true, report })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Không thể gửi báo cáo' }, 500)
  }
})
