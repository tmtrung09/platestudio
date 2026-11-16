import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { handleStaffPassword } from '../supabase/functions/staff-password-admin/api.ts';

const script = readFileSync(new URL('../assets/custom-orders/supabase.js', import.meta.url), 'utf8');
const { createClient } = runInThisContext(`(() => {\n${script}\nreturn supabase;\n})()`);
const workspace = '11111111-1111-4111-8111-111111111111';
const otherWorkspace = '22222222-2222-4222-8222-222222222222';
const ownerId = '33333333-3333-4333-8333-333333333333';
const staffId = '44444444-4444-4444-8444-444444444444';
const claim = 'staff_password_workspace_id';
const password = 'qa-only-password';
let owner = { id: ownerId, app_metadata: { [claim]: workspace } };
let target = { id: staffId, email: 'staff@example.com', app_metadata: {} };
let authorizedSession = true;
let workspaceOwner = ownerId;
let member = true;
let failureStatus = 0;
let calls = [];

const admin = createClient('https://qa.invalid', 'qa-server-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}`);
    const json = (body, status = 200) => Response.json(body, { status, headers: { 'x-supabase-api-version': '2024-01-01' } });
    if (url.pathname === '/auth/v1/user') {
      assert.equal(request.headers.get('authorization'), 'Bearer qa-jwt');
      return authorizedSession ? json(owner) : json({ message: 'Invalid token' }, 401);
    }
    if (url.pathname === '/rest/v1/workspaces') {
      assert.equal(url.searchParams.get('id'), `eq.${workspace}`);
      assert.equal(url.searchParams.get('workspace_members.user_id'), `eq.${staffId}`);
      assert.match(url.searchParams.get('select'), /workspace_members!inner\(user_id\)/);
      return json(member ? [{ owner_user_id: workspaceOwner, workspace_members: [{ user_id: staffId }] }] : []);
    }
    assert.equal(url.pathname, `/auth/v1/admin/users/${staffId}`);
    if (request.method === 'GET') return json(target);
    assert.equal(request.method, 'PUT');
    assert.deepEqual(await request.json(), { password });
    if (failureStatus) return json({ code: 'weak_password', message: `Never forward raw auth response: ${password}` }, failureStatus);
    return json(target);
  } },
});

async function call(expected, { patch, token = 'qa-jwt', method = 'POST', expectedError } = {}) {
  calls = [];
  const body = method === 'POST' ? JSON.stringify({ workspaceId: workspace, targetUserId: staffId, password, ...patch }) : undefined;
  const result = await handleStaffPassword(new Request('https://edge.invalid', {
    method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body,
  }), admin);
  assert.equal(result.status, expected);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const text = await result.text();
  assert.equal(text.includes(password) || text.includes('qa-server-key'), false);
  if (expectedError) assert.equal(JSON.parse(text).error, expectedError);
  return text && JSON.parse(text);
}

await call(204, { method: 'OPTIONS', token: '' });
await call(405, { method: 'GET' });
await call(401, { token: '' });
assert.equal(calls.length, 0);
authorizedSession = false;
await call(401);
assert.equal(calls.length, 1);
authorizedSession = true;

owner = { ...owner, app_metadata: {}, user_metadata: { [claim]: workspace } };
await call(403);
assert.equal(calls.length, 1, 'A personal workspace owner and user-editable metadata cannot authorize a change');
owner = { ...owner, app_metadata: { [claim]: workspace } };
await call(403, { patch: { workspaceId: otherWorkspace } });
await call(403, { patch: { targetUserId: ownerId } });
await call(400, { patch: { targetUserId: 'staff@example.com' } });
await call(422, { patch: { password: 'short' }, expectedError: 'invalid_password' });
assert.equal(calls.length, 1);

workspaceOwner = staffId;
await call(403);
assert.equal(calls.length, 2);
workspaceOwner = ownerId;
member = false;
await call(403);
assert.equal(calls.length, 2, 'Out-of-workspace or removed account is stopped before Auth admin lookup');
member = true;
target = { ...target, app_metadata: { [claim]: otherWorkspace } };
await call(403);
assert.equal(calls.length, 3, 'Another admin is protected');
target = { ...target, app_metadata: {} };

failureStatus = 422;
await call(422, { expectedError: 'invalid_password' });
assert.equal(calls.length, 4);
failureStatus = 0;
assert.deepEqual(await call(200), { saved: true });
assert.equal(calls.at(-1), `PUT /auth/v1/admin/users/${staffId}`);
console.log('PASS staff password API: server-verified scope, privileged and unrelated accounts protected, Auth update and safe errors');
