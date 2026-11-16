import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const base = 'https://staff-password.test/';
const root = resolve('.');
const workspaceId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const staffId = '33333333-3333-4333-8333-333333333333';
const inviteId = '44444444-4444-4444-8444-444444444444';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' };
const rows = [
  { user_id: ownerId, name: 'Chủ xưởng', email: 'admin@example.com', status: 'member', role: 'owner', is_owner: true },
  { user_id: staffId, name: 'Linh', email: 'linh@example.com', status: 'member', is_owner: false },
  { user_id: inviteId, name: 'Đang mời', email: 'invite@example.com', status: 'invited', is_owner: false },
];

try {
  for (const viewport of [{ width: 320, height: 640 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      const file = resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + sep)) return route.abort();
      try { return route.fulfill({ body: readFileSync(file), contentType: types[extname(file)] || 'application/octet-stream' }); }
      catch { return route.abort(); }
    });
    await page.goto(`${base}plate-studio.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PlatedioStartup?.state === 'ready' && document.querySelector('#auth-ov').style.display === 'flex');
    await page.evaluate(async ({ workspaceId, ownerId, rows }) => {
      window.qaPasswordCalls = [];
      sb = {
        rpc: async () => ({ data: rows }),
        functions: { invoke: async (name, data) => {
          qaPasswordCalls.push([name, data]);
          if (qaPasswordCalls.length === 1) return { error: { context: Response.json({ error: 'same_password' }, { status: 422 }) } };
          return { data: { saved: true } };
        } },
      };
      currentUser = { id: ownerId, app_metadata: {} };
      activeWorkspace = { workspace_id: workspaceId, owner_user_id: ownerId };
      cloudReady = true;
      document.getElementById('auth-ov').style.display = 'none';
      await loadWorkspaceAccessRows();
      goPage('access');
    }, { workspaceId, ownerId, rows });
    assert.equal(await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).count(), 0, 'Owner needs the server-assigned grant');
    await page.evaluate(id => {
      currentUser.app_metadata.staff_password_workspace_id = id;
      renderAccessPage();
    }, workspaceId);
    const action = page.getByRole('button', { name: 'Đặt mật khẩu mới' });
    assert.equal(await action.count(), 1, 'Only a staff member can be selected');
    await page.locator(`#access-email-cloud-${staffId}`).fill('unsaved-edit@example.com');
    await action.click();
    const dialog = page.getByRole('dialog', { name: 'Đặt mật khẩu mới cho nhân viên' });
    const password = dialog.getByLabel('Mật khẩu mới', { exact: true });
    const confirmation = dialog.getByLabel('Xác nhận mật khẩu mới');
    const save = dialog.getByRole('button', { name: 'Lưu mật khẩu mới' });
    await dialog.getByText('Linh (linh@example.com)').waitFor();
    await page.waitForFunction(() => document.activeElement.id === 'staff-new-password');
    const buttonSize = await save.evaluate(el => ({ actual: el.getBoundingClientRect().height, minimum: getComputedStyle(el).minHeight }));
    assert.ok(buttonSize.actual >= 44, `Save touch target: ${JSON.stringify(buttonSize)}`);
    assert.ok((await dialog.boundingBox()).width < viewport.width);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await action.evaluate(element => element === document.activeElement), true);

    await action.click();
    await password.fill('qa-staff-password');
    await confirmation.fill('qa-different-password');
    await confirmation.press('Enter');
    await dialog.getByText('Hai mật khẩu chưa khớp.').waitFor();
    assert.equal(await page.evaluate(() => qaPasswordCalls.length), 0);
    await confirmation.fill('qa-staff-password');
    await save.click();
    await dialog.getByText('Hãy chọn mật khẩu khác mật khẩu hiện tại.').waitFor();
    assert.equal(await password.inputValue(), 'qa-staff-password');
    await save.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('Đã đặt mật khẩu mới cho tài khoản nhân viên.').waitFor();
    assert.equal(await page.locator('#staff-new-password').inputValue(), '');
    assert.deepEqual(await page.evaluate(() => qaPasswordCalls), Array.from({ length: 2 }, () => [
      'staff-password-admin', { body: { workspaceId, targetUserId: staffId, password: 'qa-staff-password' } },
    ]));
    await context.close();
  }
  console.log('PASS staff password UI: directory scope, canonical identity, validation, retry and close on mobile and desktop');
} finally {
  await browser.close();
}
