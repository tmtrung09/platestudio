// Gemini stays server-side.  Do not put GEMINI_API_KEY in plate-studio.html
// or any Netlify environment exposed to the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

type Catalog = {
  filaments?: Array<{ id: string; name: string; brand: string; hex: string }>
  planned?: Array<{ id: string; modelId: string; modelName: string; partId?: string | null; partName: string; filamentId?: string | null; remaining: number }>
  models?: Array<{ id: string; name: string; categories?: string[]; parts?: Array<{ id: string; name: string; colors?: string[] }> }>
}

function parseModelJson(value: string) {
  const clean = value.trim().replace(/^```json\s*/i, '').replace(/```$/i, '')
  return JSON.parse(clean)
}

function textFromGeminiPayload(payload: any): string {
  const fromParts = (parts: any) => Array.isArray(parts)
    ? parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('')
    : ''
  // generateContent (stable/v1beta) and the newer interaction-shaped results
  // are both accepted here. This prevents a model-version response change from
  // looking like a blank answer to the user.
  const candidateText = fromParts(payload?.candidates?.[0]?.content?.parts)
  const outputText = fromParts(payload?.outputs?.[0]?.content?.parts)
    || fromParts(payload?.outputs?.[0]?.content)
  return candidateText || outputText || payload?.output_text || payload?.outputText || ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    // Supabase now exposes the key dictionaries by default; older projects
    // still expose ANON_KEY / SERVICE_ROLE_KEY. Support both safely.
    const keyFromDictionary = (name: string) => {
      try { return JSON.parse(Deno.env.get(name) || '{}').default || null } catch (_) { return null }
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || keyFromDictionary('SUPABASE_PUBLISHABLE_KEYS')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || keyFromDictionary('SUPABASE_SECRET_KEYS')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Supabase Edge Function chưa được cấu hình đầy đủ')
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY chưa được cấu hình cho Edge Function' }, 503)

    const authorization = req.headers.get('Authorization') || ''
    if (!authorization) return json({ error: 'Cần đăng nhập để dùng AI' }, 401)
    const auth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: authData, error: authError } = await auth.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Phiên đăng nhập không hợp lệ' }, 401)

    const body = await req.json()
    const reportId = String(body?.reportId || '')
    const catalog = (body?.catalog || {}) as Catalog
    if (!/^[a-z0-9-]{12,}$/i.test(reportId)) return json({ error: 'Mã báo cáo không hợp lệ' }, 400)

    // Read the image from the owned report rather than trusting an arbitrary URL
    // supplied by the browser (prevents this endpoint becoming an image proxy).
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: row, error: rowError } = await admin.from('batch_reports')
      .select('data').eq('id', reportId).eq('user_id', authData.user.id).maybeSingle()
    if (rowError) throw rowError
    const report = (row?.data || {}) as Record<string, unknown>
    const imageUrl = String(report.image || '')
    if (!imageUrl) return json({ error: 'Báo cáo này chưa có ảnh để phân tích' }, 400)
    const parsedImageUrl = new URL(imageUrl)
    if (parsedImageUrl.hostname !== new URL(supabaseUrl).hostname) {
      return json({ error: 'Ảnh báo cáo không thuộc kho lưu trữ của xưởng' }, 400)
    }
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) throw new Error('Không tải được ảnh báo cáo từ kho lưu trữ')
    const bytes = new Uint8Array(await imageResponse.arrayBuffer())
    if (bytes.byteLength > 12 * 1024 * 1024) return json({ error: 'Ảnh quá lớn để phân tích (tối đa 12 MB)' }, 413)
    const mimeType = (imageResponse.headers.get('content-type') || 'image/jpeg').split(';')[0]
    if (!mimeType.startsWith('image/')) return json({ error: 'Tệp báo cáo không phải ảnh hợp lệ' }, 400)
    const imageBase64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))

    // Keep IDs only; Gemini must never invent an ID.  The client validates again
    // before applying any suggestion, so the user is always in control.
    const compactCatalog = {
      filaments: (catalog.filaments || []).slice(0, 80),
      planned: (catalog.planned || []).slice(0, 180),
      models: (catalog.models || []).slice(0, 360),
    }
    const instruction = `Bạn là trợ lý đối chiếu mẻ in 3D. Phân tích một ảnh báo cáo mẻ in.
Trả lời BẰNG JSON thuần, không markdown, theo chính xác cấu trúc:
{
  "summary":"mô tả ngắn bằng tiếng Việt, nêu rõ đây chỉ là gợi ý",
  "colorCandidates":[{"filamentId":"id có trong catalog.filaments","confidence":0-100,"reason":"lý do ngắn"}],
  "matches":[{"kind":"planned" hoặc "library","plannedItemId":"id hoặc null","modelId":"id hoặc null","partId":"id hoặc null","filamentId":"id hoặc null","qty":số hoặc null,"confidence":0-100,"reason":"lý do ngắn"}],
  "issues":[{"severity":"info" hoặc "warning","message":"..."}],
  "needsReview":true
}
Quy tắc quan trọng: chỉ dùng ID có thật trong catalog. Nếu không chắc model/part, để matches là []. Không suy diễn số lượng khi ảnh không cho thấy rõ. Không bao giờ tự xác nhận tiến độ order.
CATALOG:\n${JSON.stringify(compactCatalog)}`
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruction }, { inlineData: { mimeType, data: imageBase64 } }] }],
          // Vision models can spend tokens reasoning about the image before
          // emitting JSON. Leave enough output budget for both steps.
          generationConfig: { temperature: 0.15, maxOutputTokens: 4096, responseMimeType: 'application/json' },
        }),
      },
    )
    const geminiPayload = await geminiResponse.json()
    if (!geminiResponse.ok) {
      console.error('Gemini error', geminiPayload)
      return json({ error: String(geminiPayload?.error?.message || 'Gemini không thể xử lý ảnh') }, 502)
    }
    const text = textFromGeminiPayload(geminiPayload)
    if (!text) {
      const reason = geminiPayload?.candidates?.[0]?.finishReason || geminiPayload?.promptFeedback?.blockReason || 'không có nội dung trả về'
      console.error('Gemini empty result', geminiPayload)
      return json({ error: `Gemini không trả về kết quả (${reason})` }, 502)
    }
    let analysis: Record<string, unknown>
    try { analysis = parseModelJson(text) } catch (_) { return json({ error: 'Gemini trả về dữ liệu không đúng định dạng' }, 502) }

    const filamentIds = new Set(compactCatalog.filaments.map(x => x.id))
    const plannedById = new Map(compactCatalog.planned.map(x => [x.id, x]))
    const modelById = new Map(compactCatalog.models.map(x => [x.id, x]))
    const colors = Array.isArray(analysis.colorCandidates) ? analysis.colorCandidates
      .filter((x: any) => filamentIds.has(String(x?.filamentId || ''))).slice(0, 4) : []
    const matches = Array.isArray(analysis.matches) ? analysis.matches.filter((x: any) => {
      if (x?.kind === 'planned') return plannedById.has(String(x?.plannedItemId || ''))
      const model = modelById.get(String(x?.modelId || ''))
      return !!model && (!x?.partId || model.parts?.some(p => p.id === x.partId))
    }).slice(0, 8) : []
    return json({ analysis: {
      summary: String(analysis.summary || 'Gemini đã phân tích ảnh này. Vui lòng kiểm tra gợi ý trước khi áp dụng.').slice(0, 900),
      colorCandidates: colors,
      matches,
      issues: Array.isArray(analysis.issues) ? analysis.issues.slice(0, 5) : [],
      needsReview: true,
    } })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Không thể phân tích ảnh' }, 500)
  }
})
