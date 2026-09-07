// Gemini suggestion layer for KiotViet inventory. It never creates an order or a plate.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})
const parseJson = (value: string) => JSON.parse(value.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''))
function geminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts
  return Array.isArray(parts) ? parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('') : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const readKey = (name: string) => { try { return JSON.parse(Deno.env.get(name) || '{}').default || null } catch (_) { return null } }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || readKey('SUPABASE_PUBLISHABLE_KEYS')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!supabaseUrl || !anonKey) throw new Error('Supabase Edge Function chưa được cấu hình đầy đủ')
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY chưa được cấu hình cho Edge Function' }, 503)

    const authorization = req.headers.get('Authorization') || ''
    if (!authorization) return json({ error: 'Cần đăng nhập để dùng AI' }, 401)
    const auth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data, error } = await auth.auth.getUser()
    if (error || !data.user) return json({ error: 'Phiên đăng nhập không hợp lệ' }, 401)

    const body = await req.json()
    const rawItems = Array.isArray(body?.items) ? body.items.slice(0, 30) : []
    if (!rawItems.length) return json({ error: 'Không có sản phẩm tồn kho cần phân tích' }, 400)
    const items = rawItems.map((item: any) => ({
      sku: String(item?.sku || '').slice(0, 100),
      name: String(item?.name || '').slice(0, 180),
      category: String(item?.category || '').slice(0, 160),
      stock: Math.max(0, Number(item?.stock) || 0),
      minStock: Math.max(0, Number(item?.minStock) || 0),
      sold: Math.max(0, Number(item?.sold) || 0),
      revenue: Math.max(0, Number(item?.revenue) || 0),
      mappedModel: String(item?.mappedModel || '').slice(0, 180),
      hasParts: Boolean(item?.hasParts),
      baseSuggestedQty: Math.max(1, Math.min(999, Math.round(Number(item?.baseSuggestedQty) || 1))),
    })).filter((item: any) => item.sku && item.name)
    if (!items.length) return json({ error: 'Dữ liệu tồn kho không hợp lệ' }, 400)

    const instruction = `Bạn là trợ lý phân tích tồn kho cho xưởng in 3D và cửa hàng. Chỉ đưa ra GỢI Ý để người quản lý duyệt; tuyệt đối không tạo Order hoặc Plate. Dữ liệu doanh số có thể là tổng lịch sử (không có khoảng thời gian), vì vậy không suy diễn tốc độ bán theo ngày. Chỉ đánh giá từ dữ liệu mỗi SKU: tồn KiotViet hiện tại, ngưỡng tồn tối thiểu (nếu có), tổng đã bán và doanh thu. Nếu SKU chưa ghép model hoặc model chưa có part, vẫn nêu vấn đề nhưng không khuyến nghị tạo kế hoạch in cho SKU đó. Mọi suggestedQty là số nguyên 1-999 và chỉ dành cho SKU được cung cấp.
Trả lời JSON thuần, không markdown:
{
  "summary":"tóm tắt tiếng Việt tối đa 320 ký tự, luôn nói đây là gợi ý",
  "recommendations":[{"sku":"SKU trong DATA","suggestedQty":1,"priority":"high hoặc normal","reason":"lý do ngắn tiếng Việt"}]
}
DATA: ${JSON.stringify(items)}`
    const modelName = Deno.env.get('GEMINI_MODEL') || 'gemini-3.7-flash'
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instruction }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 1800, responseMimeType: 'application/json' },
      }),
    })
    const payload = await response.json()
    if (!response.ok) return json({ error: String(payload?.error?.message || 'Gemini không thể xử lý dữ liệu') }, 502)
    const text = geminiText(payload)
    if (!text) return json({ error: 'Gemini không trả về kết quả' }, 502)
    let analysis: any
    try { analysis = parseJson(text) } catch (_) { return json({ error: 'Gemini trả về dữ liệu không đúng định dạng' }, 502) }
    const allowed = new Set(items.map((item: any) => item.sku))
    const recommendations = Array.isArray(analysis?.recommendations) ? analysis.recommendations.slice(0, items.length).map((row: any) => ({
      sku: String(row?.sku || ''),
      suggestedQty: Math.max(1, Math.min(999, Math.round(Number(row?.suggestedQty) || 1))),
      priority: row?.priority === 'high' ? 'high' : 'normal',
      reason: String(row?.reason || 'Gemini đề xuất kiểm tra lại tồn kho trước khi lập kế hoạch.').slice(0, 280),
    })).filter((row: any) => allowed.has(row.sku)) : []
    return json({ analysis: {
      summary: String(analysis?.summary || 'Gemini đã phân tích danh sách tồn kho. Hãy kiểm tra trước khi lập kế hoạch in.').slice(0, 420),
      recommendations,
    } })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Không thể phân tích tồn kho' }, 500)
  }
})
