import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const db = new PGlite(), workspace = randomUUID(), user = randomUUID(), out = resolve('qa-results/kiot-mapping');
mkdirSync(out, { recursive: true });
await db.exec(`create role authenticated;create role anon;create schema auth;
create table auth.users(id uuid primary key);create table public.workspaces(id uuid primary key,owner_user_id uuid);
insert into auth.users values('${user}');insert into workspaces values('${workspace}','${user}');
create function auth.uid() returns uuid language sql as $$select '${user}'::uuid$$;
create function public.is_workspace_member(id uuid) returns boolean language sql as $$select id='${workspace}'::uuid$$;
create table settings(id text,user_id uuid,workspace_id uuid,data jsonb,updated_at timestamptz,primary key(user_id,id));`);
await db.exec(readFileSync(new URL('../supabase/migrations/202610150001_kiot_mapping_commit.sql', import.meta.url), 'utf8'));
const read = async () => (await db.query("select data from settings where id='kiotviet'")).rows[0]?.data || { id: 'kiotviet', values: { catalog: [], mappings: [], skippedSkus: [] } };
const rpc = async ({ name, args }) => {
  try {
    if (name === 'commit_kiot_mapping') {
      const p = args;
      const result = await db.query('select commit_kiot_mapping($1,$2,$3,$4,$5,$6,$7) value', [p.p_workspace_id, p.p_sku, p.p_request_id, p.p_expected_revision, JSON.stringify(p.p_expected_state), p.p_mapping && JSON.stringify(p.p_mapping), p.p_skipped && JSON.stringify(p.p_skipped)]);
      return { data: result.rows[0].value };
    }
    if (name === 'merge_kiot_settings') { await db.query('select merge_kiot_settings($1,$2)', [args.p_workspace_id, JSON.stringify(args.p_values)]); return { data: null }; }
    throw new Error('Unexpected isolated RPC: ' + name);
  } catch (error) { return { error: { code: error.code, message: error.message } }; }
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function prepare(page, sku, width = 1280, theme = 'light') {
  await page.evaluate(({ sku, workspace, user, theme, remote }) => {
    document.documentElement.dataset.theme = theme;
    document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
    currentUser = { id: user }; activeWorkspace = { workspace_id: workspace, owner_user_id: user };
    cloudReady = false; loadingCloud = false; cloudSyncing = false; cloudOutbox = []; canAccess = () => true;
    window.qaOffline = false; window.qaLoseAck = false; window.qaToasts = []; window.qaRequests = [];
    toast = message => qaToasts.push(message);
    sb = { async rpc(name, args) {
      qaRequests.push({ name, args });
      if (qaOffline) return { error: { code: 'NETWORK', message: 'Isolated offline' } };
      const result = await qaRpc({ name, args });
      if (qaLoseAck && !result.error) { qaLoseAck = false; return { error: { code: 'NETWORK', message: 'Lost ACK' } }; }
      return result;
    }, from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { data: await qaRead() } }; }, async upsert() { return {}; } }; } };
    models = [{ id: 'model-a', name: 'Model kiểm tra tên dài có biến thể', images: [], parts: [], variants: [{ id: 'blue', name: 'Xanh' }] }, { id: 'model-b', name: 'Model B', images: [], parts: [], variants: [] }];
    fils = []; projects = []; orders = []; plates = []; pitems = []; brands = []; batchReports = []; trashItems = [];
    operations = { products: [], deliveries: [], deliveryBatches: [], qualityIssues: [] }; normalizeOperations();
    kiotViet = { snapshots: [], sales: [], salesImports: [], aiInsights: [], ...remote.values, catalog: [{ sku, name: 'Sản phẩm KiotViet kiểm tra có tên dài', stock: 2 }] };
    kiotSalesArchiveReadyForSettings = true; kiotSalesArchiveLoaded = true; kiotInventoryLedger.loaded = true;
    refreshKiotDailySchedule = async () => {}; checkKiotDailyScheduleOnOpen = () => {};
    goPage = name => { curPage = name; document.querySelectorAll('.page').forEach(node => node.classList.remove('active')); document.getElementById('page-' + name)?.classList.add('active'); if (name === 'kiotviet-map') renderKiotMappingWorkspace(); if (name === 'kiotviet') renderKiotVietPage(); };
    initKiotMappingSync(); openKiotMappingDialog(encodeURIComponent(sku));
    window.qaSelect = () => { pickKiotMapping('model-a::blue'); addKiotMappingComponent('required'); };
    window.qaSave = () => saveKiotMapping(encodeURIComponent(sku));
  }, { sku, workspace, user, theme, remote: await read() });
  await page.setViewportSize({ width, height: 900 });
}
async function contextPage() {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('qaRpc', rpc); await page.exposeFunction('qaRead', read);
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href, { waitUntil: 'load' });
  return { context, page, errors };
}
try {
  for (const width of [320, 390, 1280]) for (const theme of ['light', 'dark']) {
    const { context, page, errors } = await contextPage(), sku = 'UI-' + width + '-' + theme;
    try {
      await prepare(page, sku, width, theme);
      await page.locator('[data-kv-map-model="model-a"]').click();
      await page.getByRole('button', { name: 'Xanh', exact: true }).click();
      await page.evaluate(() => { window.qaGrid = document.getElementById('kv-map-grid'); window.qaSearch = document.getElementById('kv-map-search'); });
      await page.getByRole('button', { name: '+ Thành phần bắt buộc', exact: true }).click();
      await page.getByRole('spinbutton', { name: 'Số lượng', exact: true }).fill('3');
      await page.evaluate(() => { window.qaQuantity = document.querySelector('.kv-bom-row input'); qaQuantity.dispatchEvent(new Event('change', { bubbles: true })); });
      assert.deepEqual(await page.evaluate(() => [qaGrid === document.getElementById('kv-map-grid'), qaSearch === document.getElementById('kv-map-search'), qaQuantity === document.querySelector('.kv-bom-row input')]), [true, true, true], 'Formula edits preserve library, search and quantity controls');
      await page.evaluate(() => { qaSearch.value = 'kiem'; kiotMappingDraft.query = 'kiem'; qaSearch.focus(); qaSearch.setSelectionRange(2, 2); renderKiotMappingWorkspace(); });
      assert.deepEqual(await page.evaluate(() => [qaSearch === document.activeElement, qaSearch === document.getElementById('kv-map-search'), qaSearch.selectionStart]), [true, true, 2], 'Background ACK/render preserves the active mapping draft and caret');
      const geometry = await page.evaluate(() => ({ fallback: [...document.querySelectorAll('.kv-map-image-empty svg')].map(svg => ({ width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height, fill: getComputedStyle(svg).fill })), controls: [...document.querySelectorAll('.kv-bom-row input,.kv-bom-row select')].map(control => ({ height: control.getBoundingClientRect().height, font: parseFloat(getComputedStyle(control).fontSize) })) }));
      assert.ok(geometry.fallback.every(svg => svg.width >= 16 && svg.width <= 40 && svg.height <= 40 && svg.fill === 'none'), 'Fallback uses bounded line SVGs');
      assert.ok(geometry.controls.every(control => control.height >= 44 && (width > 860 || control.font >= 16)), 'Formula controls keep 44px targets and mobile 16px input text');
      if ([390, 1280].includes(width)) await page.screenshot({ path: resolve(out, width + '-' + theme + '-formula.png') });
      await page.evaluate(() => { window.qaNativeSet = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new DOMException('Isolated quota', 'QuotaExceededError'); }; });
      await page.getByRole('button', { name: '✓ Lưu công thức SKU', exact: true }).click();
      await page.waitForFunction(() => window.KiotMappingSync.status().pending.length === 1);
      assert.equal(await page.evaluate(() => kiotViet.mappings.find(row => row.sku === kiotViet.catalog[0].sku)?.variantId), 'blue');
      assert.ok((await page.locator('#kv-mapping-sync-status').textContent()).includes('lưu trên máy'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Pending state must not overflow');
      await page.screenshot({ path: resolve(out, width + '-' + theme + '-pending.png') });
      await page.reload({ waitUntil: 'load' }); await prepare(page, sku, width, theme);
      await page.evaluate(() => window.KiotMappingSync.restore());
      assert.equal(await page.evaluate(() => kiotViet.mappings.find(row => row.sku === kiotViet.catalog[0].sku)?.variantId), 'blue', 'IDB survives real reload despite localStorage quota');
      await page.evaluate(async () => { cloudReady = true; await window.KiotMappingSync.retry(); });
      assert.equal(await page.evaluate(() => window.KiotMappingSync.status().pending.length), 0);
      assert.equal((await read()).values.mappings.find(row => row.sku === sku).variantId, 'blue');
      assert.equal((await read()).values.mappings.find(row => row.sku === sku).components[0].qty, 3);
      const toasts = await page.evaluate(() => qaToasts);
      assert.ok(toasts.some(message => message.includes('Đã lưu cloud:')));
      await page.evaluate(async () => {
        cloudReady = false; qaOffline = true; kiotViet.mappings = []; kiotViet.mappingRevisions = {};
        await window.KiotMappingSync.restore();
      });
      assert.equal(await page.evaluate(() => kiotViet.mappings.find(row => row.sku === kiotViet.catalog[0].sku)?.variantId), 'blue', 'Acknowledged payload survives a stale/missing aggregate cache while offline');
      assert.deepEqual(errors, []);
      console.log(`PASS mapping ${width}/${theme}: real clicks, variant/quantity, quota, durable reload, pre-ready queue, server ACK`);
    } finally { await context.close(); }
  }
  const { context, page, errors } = await contextPage();
  try {
    await prepare(page, 'IDB-FAIL');
    await page.evaluate(async () => {
      qaSelect(); const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function() { throw new DOMException('Isolated database quota', 'QuotaExceededError'); };
      try { await qaSave(); } finally { IDBDatabase.prototype.transaction = original; }
    });
    assert.equal(await page.evaluate(() => kiotViet.mappings.some(row => row.sku === 'IDB-FAIL')), false);
    assert.equal(await page.evaluate(() => kvDraftComponents().length), 1);
    assert.equal(await page.evaluate(() => curPage), 'kiotviet-map');
    assert.ok((await page.evaluate(() => qaToasts)).some(message => message.includes('Chưa lưu được')));
    console.log('PASS mapping: database failure keeps unsaved draft, no success or navigation');

    await prepare(page, 'DELIVERY');
    await page.evaluate(async () => {
      operations.deliveryBatches = [{ id: 'delivery', deliveredAt: '2026-10-15', items: [{ modelId: 'model-a', modelName: 'Model kiểm tra', variantId: 'blue', qty: 2 }] }];
      openKiotDeliverySkuPicker('delivery', 0); document.getElementById('kv-delivery-sku').value = 'DELIVERY';
      await saveKiotDeliverySku('delivery', 0);
    });
    assert.equal(await page.evaluate(() => window.KiotMappingSync.status().pending[0]?.sku), 'DELIVERY');
    await page.evaluate(async () => { cloudReady = true; await window.KiotMappingSync.retry(); });
    assert.equal((await read()).values.mappings.find(row => row.sku === 'DELIVERY').components[0].variantId, 'blue');
    assert.equal(await page.evaluate(() => operations.deliveryBatches[0].items[0].qty), 2, 'Mapping must not mutate delivery quantity or inventory');
    console.log('PASS mapping: delivery picker shares durable, revision-checked save without mutating delivery');

    await prepare(page, 'PENDING-EDIT');
    await page.evaluate(async () => { qaSelect(); await qaSave(); openKiotMappingDialog('PENDING-EDIT'); setKiotMappingComponentQty(0, 8); await qaSave(); });
    assert.equal(await page.evaluate(() => window.KiotMappingSync.status().pending.filter(row => row.sku === 'PENDING-EDIT').length), 1);
    assert.equal(await page.evaluate(() => kvDraftComponents()[0].qty), 8, 'Rejected second save keeps its draft');
    assert.equal(await page.evaluate(() => kiotViet.mappings.find(row => row.sku === 'PENDING-EDIT').components[0].qty), 1, 'Pending request payload remains immutable');
    await page.evaluate(async () => { cloudReady = true; await window.KiotMappingSync.retry(); });
    console.log('PASS mapping: repeated offline edit cannot mutate a request that may already be committed');

    await prepare(page, 'ACK-LOST');
    await page.evaluate(async () => { qaSelect(); await qaSave(); qaLoseAck = true; cloudReady = true; await window.KiotMappingSync.retry(); });
    const firstRequest = await page.evaluate(() => window.KiotMappingSync.status().pending[0]?.requestId);
    assert.ok(firstRequest);
    await page.evaluate(() => window.KiotMappingSync.retry());
    assert.equal(await page.evaluate(() => window.KiotMappingSync.status().pending.length), 0);
    const requests = await page.evaluate(() => qaRequests.filter(row => row.name === 'commit_kiot_mapping').map(row => row.args.p_request_id));
    assert.deepEqual(requests, [firstRequest, firstRequest]);
    console.log('PASS mapping: lost server ACK retries same request without duplicate/resurrection');

    await prepare(page, 'CONFLICT');
    await page.evaluate(() => qaSelect());
    const external = { sku: 'CONFLICT', modelId: 'model-b', id: 'external', components: [{ modelId: 'model-b', qty: 1, mode: 'required' }] };
    assert.equal((await rpc({ name: 'commit_kiot_mapping', args: { p_workspace_id: workspace, p_sku: 'CONFLICT', p_request_id: randomUUID(), p_expected_revision: null, p_expected_state: { mapping: null, skipped: null }, p_mapping: external, p_skipped: null } })).error, undefined);
    await page.evaluate(async () => { await qaSave(); cloudReady = true; await window.KiotMappingSync.retry(); });
    assert.equal(await page.evaluate(() => window.KiotMappingSync.status().pending[0].conflict), true);
    assert.equal((await read()).values.mappings.find(row => row.sku === 'CONFLICT').modelId, 'model-b');
    await page.locator('#kv-mapping-sync-status summary').click();
    await page.locator('#kv-mapping-sync-status').getByRole('button', { name: 'Lưu bản này thay cloud', exact: true }).click();
    await page.waitForFunction(() => window.KiotMappingSync.status().pending.length === 0);
    assert.equal((await read()).values.mappings.find(row => row.sku === 'CONFLICT').modelId, 'model-a');
    console.log('PASS mapping: concurrent same-SKU edit preserves draft and requires explicit conflict resolution');

    await prepare(page, 'CLOUD-CHOICE'); await page.evaluate(() => qaSelect());
    await rpc({ name: 'commit_kiot_mapping', args: { p_workspace_id: workspace, p_sku: 'CLOUD-CHOICE', p_request_id: randomUUID(), p_expected_revision: null, p_expected_state: { mapping: null, skipped: null }, p_mapping: { ...external, sku: 'CLOUD-CHOICE' }, p_skipped: null } });
    await page.evaluate(async () => { await qaSave(); cloudReady = true; await window.KiotMappingSync.retry(); });
    await page.locator('#kv-mapping-sync-status summary').click();
    await page.locator('#kv-mapping-sync-status').getByRole('button', { name: 'Dùng bản cloud', exact: true }).click();
    await page.waitForFunction(() => window.KiotMappingSync.status().pending.length === 0);
    assert.equal(await page.evaluate(() => kiotViet.mappings.find(row => row.sku === 'CLOUD-CHOICE').modelId), 'model-b');
    console.log('PASS mapping: explicit use-cloud resolution discards only the conflicting local operation');

    await prepare(page, 'DELETE');
    await page.evaluate(async () => { qaSelect(); await qaSave(); cloudReady = true; await window.KiotMappingSync.retry(); });
    await page.evaluate(async () => { openKiotMappingDialog('DELETE'); await removeKiotMapping('DELETE'); await window.KiotMappingSync.retry(); });
    assert.equal((await read()).values.mappings.some(row => row.sku === 'DELETE'), false);
    assert.ok((await read()).values.mappingRevisions.DELETE);
    console.log('PASS mapping: removal uses durable queue and retains server tombstone');

    await prepare(page, 'LEGACY');
    await page.evaluate(async () => {
      markCloudCacheScope();
      const legacy = { sku: 'LEGACY', id: 'legacy', modelId: 'model-a', components: [{ modelId: 'model-a', qty: 1, mode: 'required' }] };
      kiotViet.mappings.push(legacy);
      cloudSyncedSnapshot = null;
      await writeCloudSnapshot(cloudSnapshot());
    });
    assert.equal(await page.evaluate(() => window.KiotMappingSync.status().pending.some(row => row.sku === 'LEGACY')), true, 'Legacy metadata-only outbox is upgraded to a durable operation');
    await page.evaluate(async () => { cloudReady = true; await window.KiotMappingSync.retry(); });
    assert.equal((await read()).values.mappings.find(row => row.sku === 'LEGACY').modelId, 'model-a');
    console.log('PASS mapping: legacy queued links are rescued before generic settings ACK');

    await page.evaluate(() => {
      const stale = structuredClone(kiotViet);
      stale.mappings = stale.mappings.filter(row => !['CONFLICT', 'DELETE'].includes(row.sku));
      for (const sku of ['CONFLICT', 'DELETE']) { stale.mappings.push({ sku, modelId: 'model-b' }); stale.mappingRevisions[sku] = '1'; }
      applyLocalWorkspaceCacheValue(K.kiotViet, JSON.stringify(stale));
    });
    assert.equal(await page.evaluate(() => kiotViet.mappings.find(row => row.sku === 'CONFLICT').modelId), 'model-a');
    assert.equal(await page.evaluate(() => kiotViet.mappings.some(row => row.sku === 'DELETE')), false);
    console.log('PASS mapping: stale sibling-tab cache cannot downgrade an acknowledged revision or resurrect a tombstone');

    await page.evaluate(() => {
      window.qaOriginalSb = sb;
      sb = { from() { return { select() { return this; }, eq() { return this; }, order() { return new Promise(resolve => { window.qaReleaseRead = resolve; }); } }; } };
      remoteRefreshTables.clear(); remoteRefreshTables.add('settings'); remoteDataRefreshPending = true;
      cloudReady = true; cloudOutbox = []; window.qaReading = applyRemoteDataRefresh();
    });
    await page.waitForFunction(() => !!window.qaReleaseRead);
    await page.evaluate(async () => {
      applyKiotMappingState('CONFLICT', kiotMappingState('CONFLICT'), kiotViet.mappingRevisions.CONFLICT);
      qaReleaseRead({ data: [{ data: { id: 'kiotviet', values: { mappings: [], skippedSkus: [], catalog: [] } } }] });
      await qaReading; clearTimeout(remoteRefreshWatchTimer); remoteRefreshTables.clear(); remoteDataRefreshPending = false; sb = qaOriginalSb;
    });
    assert.equal(await page.evaluate(() => kiotViet.mappings.find(row => row.sku === 'CONFLICT').modelId), 'model-a');
    console.log('PASS mapping: background read begun before a local ACK cannot replace the new mapping');

    await prepare(page, 'SCOPE');
    await page.evaluate(async () => {
      qaSelect(); await qaSave(); const original = sb.rpc;
      sb.rpc = async (name, args) => { const result = await original(name, args); await new Promise(resolve => { window.qaReleaseAck = resolve; }); return result; };
      cloudReady = true; window.qaSending = window.KiotMappingSync.retry();
    });
    await page.waitForFunction(() => !!window.qaReleaseAck);
    await page.evaluate(async otherWorkspace => {
      activeWorkspace = { workspace_id: otherWorkspace, owner_user_id: currentUser.id }; cloudReady = false;
      kiotViet = { catalog: [], mappings: [], skippedSkus: [], mappingRevisions: {}, salesImports: [] };
      qaReleaseAck(); await qaSending;
    }, randomUUID());
    assert.equal(await page.evaluate(() => kiotViet.mappings.length), 0, 'Old workspace ACK cannot modify new workspace state');
    await page.evaluate(async workspace => { activeWorkspace = { workspace_id: workspace, owner_user_id: currentUser.id }; await window.KiotMappingSync.restore(); }, workspace);
    assert.equal(await page.evaluate(() => kiotViet.mappings.find(row => row.sku === 'SCOPE').modelId), 'model-a');
    console.log('PASS mapping: account/workspace switch preserves ownership of in-flight operation and durable ACK');

    await prepare(page, 'LATE-INIT');
    await page.evaluate(async () => { qaSelect(); await qaSave(); cloudReady = true; delete window.KiotMappingSync; });
    await page.addScriptTag({ content: readFileSync(new URL('../kiot-mapping-sync.js', import.meta.url), 'utf8') });
    await page.waitForFunction(() => !!kiotViet.mappingRevisions?.['LATE-INIT'] && window.KiotMappingSync.status().pending.length === 0);
    assert.equal((await read()).values.mappings.find(row => row.sku === 'LATE-INIT').modelId, 'model-a');
    console.log('PASS mapping: a module loaded after cloud readiness resumes its durable outbox automatically');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
} finally { await browser.close(); await db.close(); }
