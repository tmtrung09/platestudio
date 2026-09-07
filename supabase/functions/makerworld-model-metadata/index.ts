const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

function profilesFromDesign(design: any, requestedInstanceId = '') {
  const now = new Date().toISOString()
  const profiles = (Array.isArray(design?.instances) ? design.instances : []).map((instance: any, index: number) => {
    const prediction = Math.max(0, Number(instance?.prediction) || 0)
    const directWeight = Math.max(0, Number(instance?.weight) || 0)
    const filamentWeight = (Array.isArray(instance?.instanceFilaments) ? instance.instanceFilaments : []).reduce((sum: number, filament: any) => sum + Math.max(0, Number(filament?.usedG) || 0), 0)
    return {
      profileName: String(instance?.title || `Profile ${index + 1}`).slice(0, 160),
      durationMinutes: prediction ? Math.max(1, Math.round(prediction / 60)) : 0,
      filamentGrams: Math.round((directWeight || filamentWeight) * 10) / 10,
      sourceProfileId: String(instance?.id || instance?.profileId || ''),
      source: 'makerworld',
      updatedAt: now,
    }
  }).filter((profile: any) => profile.durationMinutes || profile.filamentGrams)
  const primary = profiles.find((profile: any) => profile.sourceProfileId === requestedInstanceId)
    || profiles.find((profile: any) => profile.sourceProfileId === String(design?.defaultInstanceId || ''))
    || profiles[0]
  return { profiles, primary }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await req.json()
    const url = new URL(String(body?.url || '').trim())
    if (!/(^|\.)makerworld\.com$/i.test(url.hostname) || !/^\/(?:[a-z]{2}\/)?models\/\d+/i.test(url.pathname)) return json({ error: 'Link MakerWorld không hợp lệ' }, 400)
    const designId = url.pathname.match(/\/models\/(\d+)/i)?.[1] || ''
    const requestedInstanceId = url.hash.match(/profileId-(\d+)/i)?.[1] || ''
    url.search = ''; url.hash = ''
    const response = await fetch(`https://api.bambulab.com/v1/design-service/design/${encodeURIComponent(designId)}`, { headers: { 'Accept': 'application/json', 'User-Agent': 'PlateStudio/1.0' } })
    if (!response.ok) return json({ error: `Bambu Lab API trả về HTTP ${response.status}` }, 502)
    const design = await response.json()
    const { profiles, primary } = profilesFromDesign(design, requestedInstanceId)
    if (!primary) return json({ error: 'Model này chưa có profile in công khai trên MakerWorld.' }, 404)
    return json({ modelName: String(design?.title || ''), profiles, primary })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Không thể đọc MakerWorld' }, 500)
  }
})
