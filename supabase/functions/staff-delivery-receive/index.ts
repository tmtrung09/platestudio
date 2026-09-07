// Cổng kiểm hàng tối giản cho nhân viên cửa hàng. Token chỉ được dùng để xem
// đúng các phiếu giao đang chờ và ghi số thực nhận, không đọc toàn bộ workspace.
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
const activeStatus = ['in_transit', 'partial_received', 'discrepancy']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const form = await req.formData()
    const token = String(form.get('token') || '')
    if (!/^[a-f0-9]{48}$/i.test(token)) return json({ error: 'Liên kết nhân viên không hợp lệ' }, 401)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: access, error: tokenError } = await admin.from('staff_access_tokens')
      .select('id, owner_user_id').eq('token_hash', await sha256(token)).eq('active', true)
      .gt('expires_at', new Date().toISOString()).maybeSingle()
    if (tokenError || !access) return json({ error: 'Liên kết đã hết hạn hoặc đã bị thu hồi' }, 401)

    const { data: settingsRow, error: settingsError } = await admin.from('settings')
      .select('data').eq('user_id', access.owner_user_id).eq('id', 'operations').maybeSingle()
    if (settingsError) throw settingsError
    const envelope = (settingsRow?.data || { id: 'operations', values: {} }) as Record<string, any>
    const operations = (envelope.values || {}) as Record<string, any>
    const deliveryBatches = Array.isArray(operations.deliveryBatches) ? operations.deliveryBatches : []
    const action = String(form.get('action') || 'list')

    if (action === 'list') {
      const batches = deliveryBatches.filter((batch: any) => activeStatus.includes(String(batch?.status || '')))
      const modelIds = [...new Set(batches.flatMap((batch: any) => (batch.items || []).map((item: any) => String(item.modelId || '')).filter(Boolean)))]
      let models: any[] = []
      if (modelIds.length) {
        const { data, error } = await admin.from('models').select('data').eq('user_id', access.owner_user_id).in('id', modelIds)
        if (error) throw error
        models = (data || []).map(row => row.data)
      }
      await admin.from('staff_access_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', access.id)
      return json({ ok: true, batches, models })
    }

    if (action !== 'confirm') return json({ error: 'Thao tác không hợp lệ' }, 400)
    const batchId = String(form.get('batchId') || '').trim()
    const receivedBy = String(form.get('receivedBy') || '').trim().slice(0, 120)
    const receivedAt = String(form.get('receivedAt') || '').slice(0, 10)
    const note = String(form.get('note') || '').trim().slice(0, 2000)
    if (!batchId || batchId.length > 160 || !receivedBy) return json({ error: 'Thiếu phiếu giao hoặc tên người kiểm hàng' }, 400)
    const batch = deliveryBatches.find((row: any) => row?.id === batchId)
    if (!batch || !activeStatus.includes(String(batch.status || ''))) return json({ error: 'Phiếu này không còn chờ kiểm hàng' }, 409)
    let quantities: unknown[] = []
    try { quantities = JSON.parse(String(form.get('quantities') || '[]')) } catch (_) { return json({ error: 'Số lượng nhận không hợp lệ' }, 400) }
    if (!Array.isArray(quantities) || quantities.length !== (batch.items || []).length) return json({ error: 'Thiếu số lượng thực nhận' }, 400)

    let exact = true
    batch.items = (batch.items || []).map((item: any, index: number) => {
      const sent = Math.max(0, Number(item.sentQty ?? item.qty) || 0)
      const received = Math.max(0, Math.min(sent, Number(quantities[index]) || 0))
      if (received !== sent) exact = false
      return { ...item, receivedQty: received }
    })
    const images = form.getAll('images').filter((value): value is File => value instanceof File)
    if (images.length > 6) return json({ error: 'Tối đa 6 ảnh xác nhận' }, 413)
    const receivedImages: string[] = []
    for (const [index, image] of images.entries()) {
      if (!image.type.startsWith('image/')) return json({ error: 'Chỉ nhận ảnh xác nhận' }, 400)
      if (image.size > 12 * 1024 * 1024) return json({ error: 'Mỗi ảnh tối đa 12 MB' }, 413)
      const ext = (image.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
      const path = `${access.owner_user_id}/delivery-receipts/${batchId}-${Date.now()}-${index}.${ext}`
      const { error } = await admin.storage.from('plate-media').upload(path, image, { contentType: image.type, upsert: false })
      if (error) throw error
      receivedImages.push(admin.storage.from('plate-media').getPublicUrl(path).data.publicUrl)
    }
    const now = new Date().toISOString()
    batch.receivedBy = receivedBy
    batch.receivedAt = /^\d{4}-\d{2}-\d{2}$/.test(receivedAt) ? `${receivedAt}T12:00:00` : now
    batch.receiveNote = note
    batch.status = exact ? 'received' : 'partial_received'
    batch.kiotImportReadyAt = now
    if (receivedImages.length) batch.receiveImages = receivedImages
    const events = Array.isArray(operations.events) ? operations.events : []
    events.unshift({
      id: crypto.randomUUID(), type: 'delivery_received', actor: receivedBy,
      title: `${receivedBy} đã kiểm hàng`,
      detail: `${batch.code || 'Phiếu giao hàng'} · ${exact ? 'đã nhận đủ, sẵn tạo file KiotViet' : 'có chênh lệch cần xử lý'}`,
      // Chỉ gửi người có bước việc tiếp theo: Kiot/điều phối khi đủ, QC khi lệch.
      permissions: exact ? ['kiot.import', 'delivery.create'] : ['assembly.qc', 'delivery.create'],
      recipients: [], metadata: { batchId, exact }, createdAt: now, readBy: [],
    })
    operations.events = events.slice(0, 120)
    operations.deliveryBatches = deliveryBatches
    envelope.values = operations
    const { error: updateError } = await admin.from('settings').upsert({
      user_id: access.owner_user_id, id: 'operations', data: envelope, updated_at: now,
    }, { onConflict: 'user_id,id' })
    if (updateError) throw updateError
    await admin.from('staff_access_tokens').update({ last_used_at: now }).eq('id', access.id)
    return json({ ok: true, exact, batch })
  } catch (error) {
    console.error(error)
    const message = error instanceof Error
      ? error.message
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as { message?: unknown }).message || 'Không thể lưu xác nhận nhận hàng')
        : 'Không thể lưu xác nhận nhận hàng'
    return json({ error: message }, 500)
  }
})
