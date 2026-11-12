import ExifReader from 'npm:exifreader@4.54.0'

export const publicImageId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/

export function photoCaptureTime(bytes: Uint8Array, now = Date.now()) {
  try {
    const { exif } = ExifReader.load(bytes, {
      expanded: true,
      includeTags: { exif: ['DateTimeOriginal', 'OffsetTimeOriginal', 'SubSecTimeOriginal'] },
    })
    const raw = exif?.DateTimeOriginal?.description?.trim() ?? ''
    const date = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
    if (!date) return null
    const [, year, month, day, hour, minute, second] = date
    const local = `${year}-${month}-${day}T${hour}:${minute}:${second}`
    const check = new Date(`${local}Z`)
    if (Number(year) < 1900 || !Number.isFinite(check.getTime()) || !check.toISOString().startsWith(local)) return null
    const offset = exif?.OffsetTimeOriginal?.description?.trim() || '+07:00'
    const fraction = exif?.SubSecTimeOriginal?.description?.trim() ?? ''
    const milliseconds = /^\d+$/.test(fraction) ? fraction.slice(0, 3).padEnd(3, '0') : '000'
    if (!/^[+-](?:0\d|1[0-3]):[0-5]\d$|^[+-]14:00$/.test(offset)) return null
    const takenAt = new Date(`${local}.${milliseconds}${offset}`)
    return Number.isFinite(takenAt.getTime()) && takenAt.getTime() <= now + 86_400_000 ? takenAt.toISOString() : null
  } catch {
    return null
  }
}

type PageAnchor = { sort_at: string; public_id: string }
const encoder = new TextEncoder()

// A cursor carries the sort position even if its image is removed between requests.
// Keep report timestamps private and bind the cursor to its own album.
export function albumPageCursor(secret: string) {
  const key = crypto.subtle.digest('SHA-256', encoder.encode(`photo-album-page:${secret}`))
    .then(digest => crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']))
  return {
    async encode(anchor: PageAnchor, workspace: string) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const payload = encoder.encode(JSON.stringify([anchor.sort_at, anchor.public_id]))
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(workspace) }, await key, payload)
      const bytes = new Uint8Array(iv.length + encrypted.byteLength)
      bytes.set(iv)
      bytes.set(new Uint8Array(encrypted), iv.length)
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    },
    async decode(value: string, workspace: string): Promise<PageAnchor | null> {
      if (!/^[A-Za-z0-9_-]{40,200}$/.test(value)) return null
      try {
        const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
        const payload = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(workspace) }, await key, bytes.slice(12))
        const [sort_at, public_id] = JSON.parse(new TextDecoder().decode(payload))
        return typeof sort_at === 'string' && publicImageId.test(public_id) ? { sort_at, public_id } : null
      } catch {
        return null
      }
    },
  }
}
