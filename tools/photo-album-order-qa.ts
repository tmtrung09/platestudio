import assert from 'node:assert/strict'
import { albumPageCursor, photoCaptureTime } from '../supabase/functions/photo-album/album-order.ts'

function jpeg(date: string, offset: string, fraction: string) {
  const fields = [[0x9003, date], [0x9011, offset], [0x9291, fraction]] as const
  const bytes = new Uint8Array(160)
  const view = new DataView(bytes.buffer)
  bytes.set([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0])
  const tiff = 12
  const u16 = (position: number, value: number) => view.setUint16(tiff + position, value, true)
  const u32 = (position: number, value: number) => view.setUint32(tiff + position, value, true)
  u16(0, 0x4949)
  u16(2, 42)
  u32(4, 8)
  u16(8, 1)
  u16(10, 0x8769)
  u16(12, 4)
  u32(14, 1)
  u32(18, 26)
  u16(26, fields.length)
  let end = 28 + fields.length * 12 + 4
  fields.forEach(([tag, value], index) => {
    const entry = 28 + index * 12
    const encoded = new TextEncoder().encode(value + '\0')
    u16(entry, tag)
    u16(entry + 2, 2)
    u32(entry + 4, encoded.length)
    if (encoded.length <= 4) bytes.set(encoded, tiff + entry + 8)
    else {
      u32(entry + 8, end)
      bytes.set(encoded, tiff + end)
      end += encoded.length
    }
  })
  const eoi = tiff + end
  view.setUint16(4, eoi - 4)
  bytes.set([0xff, 0xd9], eoi)
  return bytes.slice(0, eoi + 2)
}

Deno.test('capture date uses camera time and offset, with no upload-time fallback', () => {
  const now = Date.parse('2026-11-12T00:00:00Z')
  assert.equal(photoCaptureTime(jpeg('2026:10:04 00:01:02', '+09:00', '12'), now), '2026-10-03T15:01:02.120Z')
  assert.equal(photoCaptureTime(jpeg('2026:10:04 00:01:02', '', ''), now), '2026-10-03T17:01:02.000Z')
  assert.equal(photoCaptureTime(jpeg('2026:02:30 08:00:00', '', ''), now), null)
  assert.equal(photoCaptureTime(jpeg('2026:12:31 08:00:00', '', ''), now), null)
  assert.equal(photoCaptureTime(new Uint8Array(), now), null)
})

Deno.test('page cursors preserve the timestamp without exposing it and stay scoped to the album', async () => {
  const cursor = albumPageCursor('qa-secret')
  const anchor = { sort_at: '2026-10-03 15:01:02.12+00', public_id: crypto.randomUUID() }
  const value = await cursor.encode(anchor, 'album-a')
  assert.match(value, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(await cursor.decode(value, 'album-a'), anchor)
  assert.equal(await cursor.decode(value, 'album-b'), null)
  assert.equal(await cursor.decode(`${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`, 'album-a'), null)
  assert.equal(await cursor.decode('invalid', 'album-a'), null)
})
