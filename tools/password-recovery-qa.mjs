import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('.');
const base = 'https://password-recovery.test/platestudio/';
const clientScript = readFileSync(resolve(root, 'assets/custom-orders/supabase.js'));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const employee = { id: '6bc781d1-1ae0-4d08-ba6a-f873887e1a00', email: 'employee@example.com', aud: 'authenticated', role: 'authenticated' };
const owner = { ...employee, id: '26963e2d-d197-4c54-bfb3-e3fb343bab6b', email: 'owner@example.com' };
const sessionKey = 'sb-mapmfngikmumvghapqcu-auth-token';
function sessionFor(user) {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expires_at })}.c2ln`;
  return { access_token, refresh_token: `qa-refresh-${user.id}`, expires_at, expires_in: 3600, token_type: 'bearer', user };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function openPage(viewport, { verifyStatus = 200, user = employee, rejectFirstUpdate = true } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  const calls = [];
  const recovery = sessionFor(user);
  let rejectUpdate = rejectFirstUpdate;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@supabase/supabase-js')) {
      return route.fulfill({ body: clientScript, contentType: mime['.js'] });
    }
    if (url.hostname.endsWith('.supabase.co')) {
      calls.push({ path: url.pathname + url.search, method: request.method(), auth: request.headers().authorization, data: request.postDataJSON() });
      const headers = { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' };
      if (url.pathname === '/auth/v1/recover') return route.fulfill({ json: {} });
      if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
        if (verifyStatus !== 200) return route.fulfill({ status: verifyStatus, headers, json: { code: 'bad_jwt', message: 'Invalid link' } });
        return route.fulfill({ json: user });
      }
      if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
        if (rejectUpdate) {
          rejectUpdate = false;
          return route.fulfill({ status: 422, headers, json: { code: 'same_password', error_code: 'same_password', message: 'Use a different password' } });
        }
        return route.fulfill({ json: user });
      }
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
      return route.fulfill({ status: 404, json: {} });
    }
    if (!url.href.startsWith(base)) return route.abort();
    const relative = url.pathname.slice(new URL(base).pathname.length);
    const file = resolve(root, relative || 'index.html');
    if (!file.startsWith(root + sep)) return route.abort();
    try { return route.fulfill({ body: readFileSync(file), contentType: mime[extname(file)] || 'application/octet-stream' }); }
    catch { return route.abort(); }
  });
  const fragment = new URLSearchParams({ type: 'recovery', access_token: recovery.access_token, refresh_token: recovery.refresh_token });
  return { context, page, calls, recovery, fragment };
}

try {
  const desktop = { width: 1366, height: 900 };
  const mobile = { width: 320, height: 640 };
  const { context, page, calls, recovery, fragment } = await openPage(mobile);
  const existing = JSON.stringify(sessionFor(owner));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: sessionKey, value: existing });
  await page.goto(`${base}#${fragment}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Đặt lại mật khẩu' }).waitFor();
  const recoveryForm = page.locator('#la-recovery-form');
  const password = recoveryForm.getByLabel('Mật khẩu mới', { exact: true });
  const confirm = recoveryForm.getByLabel('Xác nhận mật khẩu mới');
  const save = recoveryForm.getByRole('button', { name: 'Lưu mật khẩu mới' });
  await password.waitFor();
  await page.waitForFunction(() => document.activeElement.id === 'la-recovery-password');
  assert.equal(await page.locator('#la-auth-form').isVisible(), false);
  assert.equal(await page.locator('.la-segmented').isVisible(), false);
  assert.equal(page.url(), `${base}plate-studio.html?password-recovery=1`);
  assert.equal(await page.evaluate(() => sb), null, 'Recovery does not bootstrap the normal cloud session');
  assert.equal(await page.locator('#auth-ov').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  assert.ok((await save.boundingBox()).height >= 44);

  await password.fill('qa-new-password');
  await confirm.fill('qa-different');
  await confirm.press('Enter');
  await page.getByText('Hai mật khẩu chưa khớp.').waitFor();
  assert.equal(calls.length, 1);
  await confirm.fill('qa-new-password');
  await save.click();
  await page.getByText('Hãy chọn mật khẩu khác mật khẩu hiện tại.').waitFor();
  assert.equal(await password.inputValue(), 'qa-new-password');
  assert.equal(await confirm.inputValue(), 'qa-new-password');
  const logout = page.waitForResponse((response) => response.url().includes('/auth/v1/logout'));
  await save.click();
  await page.getByText('Đã đổi mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.').waitFor();
  assert.equal(await password.isVisible(), false);
  assert.equal(await password.inputValue(), '');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), sessionKey), existing);
  assert.equal(await page.evaluate(() => localStorage.getItem('ps-password-recovery')), null);
  await logout;
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    'GET /auth/v1/user', 'PUT /auth/v1/user', 'PUT /auth/v1/user', 'POST /auth/v1/logout?scope=local'
  ]);
  assert.ok(calls.every(({ auth }) => auth === `Bearer ${recovery.access_token}`));
  assert.equal(calls[2].data.password, 'qa-new-password');
  await context.close();

  const ownerPage = await openPage(desktop, { user: owner, rejectFirstUpdate: false });
  await ownerPage.page.goto(`${base}plate-studio.html#${ownerPage.fragment}`);
  const ownerForm = ownerPage.page.locator('#la-recovery-form');
  await ownerForm.getByLabel('Mật khẩu mới', { exact: true }).fill('qa-owner-password');
  await ownerForm.getByLabel('Xác nhận mật khẩu mới').fill('qa-owner-password');
  await ownerForm.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await ownerPage.page.getByText('Đã đổi mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.').waitFor();
  assert.equal(ownerPage.calls[1].auth, `Bearer ${ownerPage.recovery.access_token}`);
  await ownerPage.context.close();

  const expired = await openPage(desktop);
  await expired.page.goto(`${base}#error=access_denied&error_code=otp_expired&error_description=Link+expired`);
  await expired.page.getByText('Liên kết xác thực đã hết hạn hoặc không còn hiệu lực. Hãy quay lại và yêu cầu email mới.').waitFor();
  assert.equal(await expired.page.locator('#la-recovery-password').isVisible(), false);
  assert.equal(expired.calls.length, 0);
  await expired.page.getByRole('link', { name: 'Về Plate Studio' }).click();
  await expired.page.getByRole('link', { name: 'Quên mật khẩu?' }).waitFor();
  await expired.page.getByLabel('Email').fill(employee.email);
  await expired.page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
  await expired.page.getByText('Đã gửi email đặt lại mật khẩu. Kiểm tra hộp thư của bạn.').waitFor();
  assert.equal(expired.calls[0].method, 'POST');
  assert.equal(new URLSearchParams(expired.calls[0].path.split('?')[1]).get('redirect_to'), base);
  assert.equal(expired.calls[0].data.email, employee.email);
  await expired.context.close();

  const invalid = await openPage(desktop, { verifyStatus: 401 });
  await invalid.page.goto(`${base}plate-studio.html#${invalid.fragment}`);
  await invalid.page.getByText(/Liên kết xác thực đã hết hạn/).waitFor();
  assert.equal(await invalid.page.getByRole('button', { name: 'Lưu mật khẩu mới' }).isVisible(), false);
  assert.equal(invalid.calls.length, 1);
  await invalid.page.reload();
  await invalid.page.getByText(/Liên kết xác thực đã hết hạn/).waitFor();
  assert.equal(invalid.calls.length, 1);
  await invalid.context.close();
  console.log('PASS password recovery: email request, root redirect, scoped session, mobile form, save retry, expired and invalid links');
} finally {
  await browser.close();
}
