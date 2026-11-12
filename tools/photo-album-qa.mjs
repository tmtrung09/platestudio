import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { chromium } from 'playwright-core';
import { waitForAppReady } from './app-ready-qa.mjs';

const origin = 'https://anh-xuong.betweenus57btuxuong.chatgpt.site';
const media = 'https://mapmfngikmumvghapqcu.supabase.co/storage/v1/object/public/plate-media';
const key = 'a'.repeat(64);
const replacement = 'b'.repeat(64);
const owner = randomUUID();
const outsider = randomUUID();
const workspace = randomUUID();
const otherWorkspace = randomUUID();
const db = new PGlite();
try {
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table workspaces (id uuid primary key, owner_user_id uuid);
    create table batch_reports (user_id uuid, id text, workspace_id uuid, data jsonb, primary key (user_id,id));
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create function auth.uid() returns uuid language sql as $$select current_setting('qa.uid')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('qa.jwt')::jsonb$$;
    create function is_workspace_owner(w uuid) returns boolean language sql security definer
      as $$select exists (select 1 from public.workspaces where id = w and owner_user_id = auth.uid())$$;
    insert into workspaces values ('${workspace}', '${owner}'), ('${otherWorkspace}', '${outsider}');
  `);
  await db.exec(readFileSync('supabase/migrations/202611120001_photo_album.sql', 'utf8'));
  const insert = (id, user, space, data) => db.query('insert into batch_reports values ($1,$2,$3,$4)', [user, id, space, JSON.stringify(data)]);
  await insert('chosen', owner, workspace, { image: `${media}/owner/batch/one.jpg`, note: 'Private report metadata' });
  await insert('unselected', owner, workspace, { image: `${media}/owner/batch/two.jpg` });
  await insert('different-workspace', outsider, otherWorkspace, { image: `${media}/other/three.jpg` });
  await insert('external', owner, workspace, { image: 'https://external.test/storage/v1/object/public/plate-media/owner/four.jpg' });
  await insert('duplicate-id', owner, workspace, { image: `${media}/owner/five.jpg` });
  await insert('duplicate-id', outsider, workspace, { image: `${media}/other/six.jpg` });
  const runAs = async (user, role = 'authenticated', isAnonymous = false) => {
    await db.exec('reset role');
    await db.query("select set_config('qa.uid',$1,false), set_config('qa.jwt',$2,false)", [user, JSON.stringify({ is_anonymous: isAnonymous })]);
    await db.exec(`set role ${role}`);
  };
  const rpc = async (action, ids = [], hash = null) => (await db.query(
    'select manage_photo_album($1,$2,$3,$4) as result', [workspace, action, ids, hash],
  )).rows[0].result;
  for (const [user, role, anonymous] of [[outsider, 'authenticated', false], [owner, 'authenticated', true], [owner, 'anon', false]]) {
    await runAs(user, role, anonymous);
    await assert.rejects(() => rpc('rotate', [], key), error => error.code === '42501');
  }
  await runAs(owner);
  await assert.rejects(() => db.query('select key_hash from photo_albums'), error => error.code === '42501');
  assert.deepEqual(await rpc('status'), { active: false, affected: 0 });
  const ids = ['chosen', 'different-workspace', 'external', 'duplicate-id'];
  assert.deepEqual(await rpc('share', ids), { active: false, affected: 1 });
  assert.deepEqual(await rpc('share', ids), { active: false, affected: 0 });
  assert.deepEqual(await rpc('rotate', [], key), { active: true, affected: 0 });
  assert.deepEqual(await rpc('rotate', [], replacement), { active: true, affected: 0 });
  await db.exec('reset role');
  assert.equal((await db.query('select key_hash from photo_albums')).rows[0].key_hash, replacement);
  assert.equal((await db.query("select public from storage.buckets where id='photo-album'")).rows[0].public, false);
  assert.deepEqual((await db.query('select report_id, report_image from photo_album_images')).rows, [
    { report_id: 'chosen', report_image: `${media}/owner/batch/one.jpg` },
  ]);
  await db.query('update batch_reports set data=$1 where id=$2', [JSON.stringify({ image: `${media}/owner/changed.jpg` }), 'chosen']);
  assert.equal((await db.query('select report_image from photo_album_images')).rows[0].report_image, `${media}/owner/batch/one.jpg`);
  await runAs(owner);
  assert.deepEqual(await rpc('unshare', ['chosen']), { active: true, affected: 1 });
  assert.deepEqual(await rpc('revoke'), { active: false, affected: 0 });
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from batch_reports')).rows[0].n, 6);
  console.log('PASS photo album SQL: owner scope, exact shares, private storage, link rotation and revocation');
} finally {
  await db.close();
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const output = resolve('qa-results/photo-album');
mkdirSync(output, { recursive: true });
try {
  for (const [width, colorScheme] of [[360, 'light'], [1280, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme });
    await context.route('**/*', route => route.abort());
    await context.route(`${origin}/**`, route => {
      const path = new URL(route.request().url()).pathname;
      const file = { '/': ['index.html', 'text/html; charset=utf-8'], '/album.css': ['album.css', 'text/css'], '/album.js': ['album.js', 'text/javascript'] }[path];
      return file ? route.fulfill({ path: `photo-album-site/dist/${file[0]}`, contentType: file[1] }) : route.abort();
    });
    let available = true;
    let fail = true;
    let images = ['8', '7'];
    await context.route('https://*.supabase.co/functions/v1/photo-album**', route => {
      const request = route.request();
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'x-album-key,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      assert.equal(request.headers()['x-album-key'], key);
      assert.ok(!request.url().includes(key));
      if (!available) return route.fulfill({ status: 401, headers, json: { error: 'Revoked' } });
      if (request.method() === 'POST') {
        if (fail) return route.fulfill({ status: 503, headers, json: {} });
        assert.deepEqual(request.postDataBuffer(), png);
        images = ['9', ...images];
        return route.fulfill({ status: 201, headers, json: { ok: true } });
      }
      if (new URL(request.url()).searchParams.has('id')) return route.fulfill({ headers, body: png, contentType: 'image/png' });
      return route.fulfill({ headers, json: { images, next: null } });
    });
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await page.getByText('Link ảnh không hợp lệ').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Tải ảnh lên' }).count(), 0);
    await page.goto(`${origin}/#album=${key}`);
    await page.getByRole('button', { name: 'Xem ảnh 2' }).waitFor();
    assert.equal(await page.locator('[capture], a[href], video, select').count(), 0);
    assert.equal(await page.locator('.photos').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length), width <= 720 ? 2 : 4);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Tải ảnh lên' }).click()]);
    await chooser.setFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
    await page.getByText('1 ảnh tải thất bại.').waitFor();
    fail = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await page.getByText('Đã nhận 1/1 ảnh.').waitFor();
    await page.getByRole('button', { name: 'Xem ảnh 3' }).waitFor();
    await page.reload();
    const first = page.getByRole('button', { name: 'Xem ảnh 1' });
    await first.click();
    await page.getByRole('img', { name: 'Ảnh trong album' }).waitFor();
    await page.getByRole('button', { name: 'Đóng ảnh' }).click();
    await page.locator('#viewer:not([open])').waitFor({ state: 'attached' });
    assert.equal(await first.evaluate(button => button === document.activeElement), true);
    await page.screenshot({ path: resolve(output, `album-${width}-${colorScheme}.png`) });
    available = false;
    await page.reload();
    await page.getByText('Link ảnh không hợp lệ').waitFor();
    assert.equal(await page.locator('.photo').count(), 0);
    await context.close();
  }
  console.log('PASS photo album browser: mobile and desktop, file chooser, retry, reload, image viewer and revoked access');

  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true });
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href);
  await waitForAppReady(page);
  await page.evaluate(({ workspace, owner, media }) => {
    document.getElementById('auth-ov').style.display = 'none';
    currentUser = { id: owner, email: 'owner@example.test' };
    activeWorkspace = { workspace_id: workspace, owner_user_id: owner };
    canAccess = canEditBatchReports = canDescribeBatchReports = () => true;
    sb = { rpc: async (name, args) => {
      window.albumWrites.push({ name, ...args });
      return { data: { active: args.p_action === 'rotate', affected: args.p_report_ids?.length || 0 } };
    } };
    window.albumWrites = [];
    batchCloudServerPaged = false;
    batchReports = ['one', 'two'].map((id, index) => ({
      id, image: `${media}/owner/${id}.jpg`, status: 'pending', createdAt: new Date(Date.UTC(2026, 0, 2 - index)).toISOString(),
    }));
    document.getElementById('page-batches').style.display = 'block';
    renderBatchReportPage();
  }, { workspace, owner, media });
  await page.locator('#btn-batch-multi-select').click();
  await page.locator('[data-batch-report-id="one"] .batch-report-select-box').click();
  await page.getByRole('button', { name: 'Chia sẻ ảnh', exact: true }).click();
  await page.getByRole('button', { name: 'Chia sẻ 1 ảnh đã chọn' }).click();
  await page.getByText('Đã thêm 1 ảnh vào album.').waitFor();
  await page.getByRole('button', { name: 'Tạo link' }).click();
  await page.getByLabel('Link gửi người xem').waitFor();
  const link = await page.getByLabel('Link gửi người xem').inputValue();
  const calls = await page.evaluate(() => window.albumWrites);
  assert.deepEqual(calls.find(call => call.p_action === 'share').p_report_ids, ['one']);
  assert.equal(new URL(link).origin, origin);
  assert.match(new URL(link).hash, /^#album=[a-f0-9]{64}$/);
  assert.ok(!link.includes(calls.find(call => call.p_action === 'rotate').p_key_hash));
  await context.close();
  console.log('PASS owner browser: mobile selection sends the selected report only and creates a separate link');
} finally {
  await browser.close();
}
