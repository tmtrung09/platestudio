import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0'

const workspaceClaim = 'staff_password_workspace_id'
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store',
}

export async function handleStaffPassword(req: Request, admin: SupabaseClient): Promise<Response> {
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return fail('method_not_allowed', 405)

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '')?.[1]
  if (!token) return fail('invalid_session', 401)

  try {
    const { data: { user: actor }, error: authError } = await admin.auth.getUser(token)
    if (authError || !actor || actor.is_anonymous) return fail('invalid_session', 401)

    const payload = await req.json().catch(() => null)
    const { workspaceId, targetUserId, password } = payload ?? {}
    if (typeof workspaceId !== 'string' || !uuid.test(workspaceId) ||
        typeof targetUserId !== 'string' || !uuid.test(targetUserId)) return fail('invalid_account', 400)
    const workspace = workspaceId.toLowerCase()
    const targetId = targetUserId.toLowerCase()
    // Ordinary users can create workspaces and add existing accounts. Ownership
    // and membership alone cannot authorize a project-wide credential change.
    if (actor.app_metadata?.[workspaceClaim] !== workspace || actor.id === targetId) return fail('forbidden', 403)
    if (typeof password !== 'string' || password.length < 6) return fail('invalid_password', 422)

    const { data: membership, error: lookupError } = await admin.from('workspaces')
      .select('owner_user_id, workspace_members!inner(user_id)')
      .eq('id', workspace)
      .eq('workspace_members.user_id', targetId)
      .maybeSingle()
    if (lookupError) return fail('unavailable', 503)
    if (membership?.owner_user_id !== actor.id) return fail('forbidden', 403)

    const { data: { user: target }, error: targetError } = await admin.auth.admin.getUserById(targetId)
    if (targetError && targetError.status !== 404) return fail('unavailable', 503)
    if (!target?.email || target.is_anonymous || target.app_metadata?.[workspaceClaim]) return fail('forbidden', 403)

    const { error: updateError } = await admin.auth.admin.updateUserById(targetId, { password })
    if (updateError?.code === 'same_password') return fail('same_password', 422)
    if (updateError?.status === 422 || updateError?.code === 'weak_password') return fail('invalid_password', 422)
    if (updateError?.status === 429) return fail('retry_later', 429)
    if (updateError) return fail('unavailable', 503)

    return Response.json({ saved: true }, { headers })
  } catch {
    return fail('unavailable', 503)
  }
}
