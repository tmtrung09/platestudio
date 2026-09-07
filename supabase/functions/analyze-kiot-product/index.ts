// Gemini analysis for one KiotViet-mapped model. The browser sends only
// already-aggregated business metrics; the Gemini API key never reaches it.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

function parseJson(value: string) {
  return JSON.parse(value.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''))
}
function geminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (Array.isArray(parts)) return parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('')
  return String(payload?.output_text || payload?.outputText || '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const keyFromDictionary = (name: string) => {
      try { return JSON.parse(Deno.env.get(name) || '{}').default || null } catch (_) { return null }
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || keyFromDictionary('SUPABASE_PUBLISHABLE_KEYS')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!supabaseUrl || !anonKey) throw new Error('Supabase Edge Function chưa được cấu hình đầy đủ')
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY chưa được cấu hình cho Edge Function' }, 503)

    const authorization = req.headers.get('Authorization') || ''
    if (!authorization) return json({ error: 'Cần đăng nhập để dùng AI' }, 401)
    const auth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: authData, error: authError } = await auth.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Phiên đăng nhập không hợp lệ' }, 401)

    const body = await req.json()
    const model = body?.model || {}
    const metrics = body?.metrics || {}
    if (!String(model.id || '').trim() || !String(model.name || '').trim()) return json({ error: 'Thiếu thông tin model' }, 400)
    const compact = {
      model: { name: String(model.name).slice(0, 180), categories: Array.isArray(model.categories) ? model.categories.slice(0, 12) : [] },
      metrics: {
        skus: Array.isArray(metrics.skus) ? metrics.skus.slice(0, 20) : [],
        sold: Math.max(0, Number(metrics.sold) || 0),
        revenue: Math.max(0, Number(metrics.revenue) || 0),
        shopStock: Math.max(0, Number(metrics.shopStock) || 0),
        minStock: Math.max(0, Number(metrics.minStock) || 0),
        finished: Math.max(0, Number(metrics.finished) || 0),
        delivered: Math.max(0, Number(metrics.delivered) || 0),
        skuCreatedAt: metrics.skuCreatedAt || null,
        salesReportAt: metrics.salesReportAt || null,
        catalogImportedAt: metrics.catalogImportedAt || null,
      },
    }
    const instruction = `Bạn là trợ lý phân tích vận hành cho xưởng in 3D và cửa hàng. Chỉ phân tích dữ liệu đã cho, không bịa thêm doanh số/thời gian, không khẳng định tồn kho chính xác hơn file KiotViet. "shopStock" là tồn hiện tại ở cửa hàng từ file Kiot; "finished" là thành phẩm xưởng ghi nhận gia công xong; "delivered" là số có biên bản giao vào cửa hàng. Các số này có thể khác nhau do thời điểm import và lịch sử chưa đủ.
Trả lời BẰNG JSON thuần, không markdown:
{
  "summary":"tóm tắt tiếng Việt, 1-2 câu, nêu rõ đây là gợi ý",
  "badges":[{"label":"nhãn ngắn tối đa 50 ký tự","tone":"good" hoặc "warn" hoặc "info"}],
  "recommendations":["gợi ý hành động ngắn, tối đa 4 mục"]
}
Không tự đề xuất sản xuất nếu dữ liệu bán chưa có. Nếu tồn kho bằng/thấp hơn minStock, có thể cảnh báo kiểm tra kế hoạch; nếu không có ngưỡng tồn, không tự gọi là thiếu hàng.
DATA:\n${JSON.stringify(compact)}`
    const modelName = Deno.env.get('GEMINI_MODEL') || 'gemini-3.7-flash'
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instruction }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000, responseMimeType: 'application/json' },
      }),
    })
    const payload = await response.json()
    if (!response.ok) return json({ error: String(payload?.error?.message || 'Gemini không thể xử lý dữ liệu') }, 502)
    const text = geminiText(payload)
    if (!text) return json({ error: 'Gemini không trả về kết quả' }, 502)
    let analysis: any
    try { analysis = parseJson(text) } catch (_) { return json({ error: 'Gemini trả về dữ liệu không đúng định dạng' }, 502) }
    const allowedTones = new Set(['good', 'warn', 'info'])
    return json({ analysis: {
      summary: String(analysis?.summary || 'Gemini đã phân tích dữ liệu bán. Hãy kiểm tra trước khi quyết định.').slice(0, 900),
      badges: Array.isArray(analysis?.badges) ? analysis.badges.slice(0, 5).map((x: any) => ({
        label: String(x?.label || 'Gợi ý').slice(0, 60), tone: allowedTones.has(x?.tone) ? x.tone : 'info',
      })) : [],
      recommendations: Array.isArray(analysis?.recommendations) ? analysis.recommendations.slice(0, 5).map((x: any) => String(x).slice(0, 220)) : [],
    } })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Không thể phân tích dữ liệu bán' }, 500)
  }
})
