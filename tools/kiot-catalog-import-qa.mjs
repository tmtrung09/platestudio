import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { waitForAppReady } from './app-ready-qa.mjs';

// Drive the production file input with fixture workbooks and intercept every cloud write.
const source = pathToFileURL(resolve(process.env.KIOT_QA_FILE || 'plate-studio.html')).href;
const out = resolve('qa-results/kiot-catalog-import');
mkdirSync(out, { recursive: true });
const catalog = [
  ['Danh mục và tồn kho'],
  ['Mã hàng hóa', 'Tên hàng hóa', 'Nhóm hàng', 'Tồn kho', 'Giá bán'],
  ['QA001', 'Tên cũ', 'Trang trí', 2, 10000],
  ['QA002', 'Lót ly', 'Phụ kiện', 1, 15000],
  ['QA001', 'Bình hoa', 'Trang trí', 7, 12000],
];
const wrongFile = [['Tên hàng hóa', 'Tồn kho'], ['Bình hoa thiếu mã', 7]];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

async function seed(page, theme) {
  await page.evaluate(theme => {
    document.documentElement.dataset.theme = theme;
    document.head.insertAdjacentHTML('beforeend', '<style>#auth-ov{display:none!important}</style>');
    cloudReady = false;
    canAccess = () => true;
    isWorkspaceOwner = () => true;
    refreshKiotDailySchedule = async () => {};
    kiotSalesArchiveLoaded = true;
    kiotInventoryLedger = { ...kiotInventoryLedger, loaded: true, movements: [] };

    const fixture = () => ({
      catalog: [{ sku: 'PREVIOUS', name: 'Danh mục đang có', stock: 3 }],
      snapshots: [], mappings: [], sales: [], salesImports: [], skippedSkus: [], aiInsights: [],
    });
    const qa = window.catalogQa = {
      fixture,
      reset() {
        this.workspace = 'qa-catalog-workspace';
        this.online = true;
        this.calls = [];
        this.events = [];
        this.refreshes = 0;
        this.reads = 0;
        this.aborts = 0;
        this.reader = Promise.withResolvers();
        this.rpc = Promise.withResolvers();
        currentUser = { id: 'qa-catalog-user' };
        kiotViet = fixture();
        kiotInventoryLedgerAvailable = true;
        localStorage.removeItem(K.kiotViet);
      },
      workbook: {
        read(bytes) {
          qa.reads++;
          const matrix = JSON.parse(new TextDecoder().decode(bytes));
          return { SheetNames: ['QA'], Sheets: { QA: matrix } };
        },
        utils: { sheet_to_json: matrix => matrix },
      },
      stored() {
        return JSON.parse(localStorage.getItem(K.kiotViet) || 'null');
      },
    };
    qa.reset();
    cloudWorkspaceId = () => qa.workspace;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => qa.online });
    ensureXlsxLibrary = () => qa.reader.promise;
    loadKiotInventoryLedger = async ({ force } = {}) => {
      if (force) qa.refreshes++;
      kiotInventoryLedger.loaded = true;
    };
    sb = {
      rpc(name, args) {
        if (name !== 'replace_kiot_inventory_snapshot') return Promise.resolve({ data: [] });
        qa.calls.push({ name, args });
        return {
          abortSignal(signal) {
            signal.addEventListener('abort', () => { qa.aborts++; }, { once: true });
            return qa.rpc.promise;
          },
        };
      },
    };
    const animation = window.PlateKiotCatalogImport;
    window.PlateKiotCatalogImport = Object.fromEntries(Object.entries(animation).map(([name, handler]) => [
      name, (...args) => {
        qa.events.push(name === 'stage' || name === 'fail' ? [name, args[0]] : [name]);
        return handler(...args);
      },
    ]));
    goPage('kiotviet', { historyMode: 'none' });
  }, theme);
}

async function selectFile(page, matrix = catalog, name = 'Danh-muc-san-pham.xlsx') {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#kiot-catalog-import-button').click(),
  ]);
  await chooser.setFiles({
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(JSON.stringify(matrix)),
  });
}

async function waitForOutcome(dialog, outcome) {
  await dialog.locator('xpath=self::*[@data-outcome="' + outcome + '"]').waitFor({ state: 'visible' });
}

async function checkLayout(page, dialog, reduced) {
  const alarm = dialog.locator('.scene-alarm');
  await alarm.waitFor({ state: 'visible' });
  const layout = await dialog.evaluate(root => {
    const rect = root.getBoundingClientRect();
    const scene = root.querySelector('.import-scene').getBoundingClientRect();
    const alarm = root.querySelector('.scene-alarm');
    const box = alarm.getBoundingClientRect();
    return {
      noOverflow: rect.left >= 0 && rect.right <= innerWidth + 1 && root.scrollWidth <= root.clientWidth + 1,
      centerX: box.left + box.width / 2 - scene.left - scene.width / 2,
      centerY: box.top + box.height / 2 - scene.top - scene.height / 2,
      animation: getComputedStyle(alarm).animationName,
      closeHeight: root.querySelector('footer button').getBoundingClientRect().height,
    };
  });
  assert.ok(layout.noOverflow && Math.abs(layout.centerX) < 1 && Math.abs(layout.centerY) < 1, JSON.stringify(layout));
  assert.ok(layout.closeHeight >= 44);
  assert.equal(layout.animation === 'none', reduced);
  assert.equal(await alarm.locator('.alarm-tag').textContent(), 'Xử lý thất bại');
}

async function closeDialog(page, dialog, byEscape = false) {
  if (byEscape) await page.keyboard.press('Escape');
  else await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'kiot-catalog-import-button');
  await page.evaluate(() => catalogQa.reset());
}

try {
  for (const { width, theme, reduced } of [
    { width: 1440, theme: 'light', reduced: false },
    { width: 320, theme: 'dark', reduced: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    try {
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(source, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await page.waitForFunction(() => !!window.PlateKiotCatalogImport);
      await seed(page, theme);
      await page.clock.install();
      const dialog = page.locator('#kiot-catalog-import-dialog');
      const title = dialog.locator('.import-status strong');
      const alarm = dialog.locator('.scene-alarm');

      await selectFile(page, catalog, 'Danh-mục-sản-phẩm-và-tồn-kho-tại-thời-điểm-xuất-dữ-liệu.xlsx');
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await title.textContent(), 'Đang đọc file');
      assert.equal(await dialog.locator('h2').evaluate(heading => (
        document.activeElement === heading && getComputedStyle(heading).outlineStyle === 'none'
      )), true, 'Initial focus is on the static heading without a control outline');
      await page.keyboard.press('Escape');
      assert.ok(await dialog.isVisible(), 'Escape cannot close a pending write or read');
      assert.equal(await page.evaluate(() => catalogQa.calls.length), 0);
      await page.evaluate(() => catalogQa.reader.resolve(catalogQa.workbook));
      await page.waitForFunction(() => catalogQa.calls.length === 1);
      assert.equal(await title.textContent(), 'Đang lưu danh mục');
      assert.equal(await dialog.getByRole('button', { name: 'Đóng', exact: true }).isVisible(), false);
      const inFlight = await page.evaluate(() => ({
        args: catalogQa.calls[0],
        steps: catalogQa.events,
        stored: catalogQa.stored().snapshots[0],
      }));
      assert.equal(inFlight.args.name, 'replace_kiot_inventory_snapshot');
      assert.equal(inFlight.args.args.p_workspace_id, 'qa-catalog-workspace');
      assert.deepEqual(inFlight.args.args.p_lines.map(row => [row.sku, row.name, row.observed_stock]), [
        ['QA001', 'Bình hoa', 7], ['QA002', 'Lót ly', 1],
      ]);
      assert.deepEqual(inFlight.steps, [['begin'], ['stage', 'validate'], ['stage', 'save']]);
      assert.equal(inFlight.stored.cloudWriteUnconfirmed, true);
      assert.equal(inFlight.stored.cloudId, undefined);
      await page.clock.fastForward(4100);
      assert.equal(await title.textContent(), 'Đang chờ server xác nhận');
      assert.equal(await page.evaluate(() => catalogQa.refreshes), 0);
      await page.evaluate(() => catalogQa.rpc.resolve({ status: 200, data: [{ id: 'qa-cloud-snapshot' }] }));
      await waitForOutcome(dialog, 'done');
      assert.match(await dialog.locator('.import-status p').textContent(), /2 sản phẩm.+trên cloud/);
      const success = await page.evaluate(() => ({
        stored: catalogQa.stored().snapshots[0],
        steps: catalogQa.events,
        refreshes: catalogQa.refreshes,
      }));
      assert.deepEqual(success.steps, [['begin'], ['stage', 'validate'], ['stage', 'save'], ['stage', 'wait'], ['success']]);
      assert.equal(success.stored.cloudId, 'qa-cloud-snapshot');
      assert.equal(success.stored.cloudWriteUnconfirmed, undefined);
      assert.equal(success.refreshes, 1);
      assert.ok(await alarm.isHidden());
      await closeDialog(page, dialog, true);

      // Check that the animated version holds the fault scene before the centered text.
      await selectFile(page);
      await page.evaluate(() => catalogQa.reader.resolve(catalogQa.workbook));
      await page.waitForFunction(() => catalogQa.calls.length === 1);
      await page.evaluate(() => catalogQa.rpc.resolve({ status: 0, error: { message: 'Failed to fetch' } }));
      await waitForOutcome(dialog, 'error');
      if (!reduced) {
        assert.ok(await alarm.isHidden());
        await page.clock.fastForward(1800);
      }
      await checkLayout(page, dialog, reduced);
      assert.equal(await alarm.locator('strong').textContent(), 'Đứt đường truyền');
      await dialog.screenshot({ animations: 'disabled', path: resolve(out, `${width}-${theme}-network.png`) });
      assert.equal(await page.evaluate(() => catalogQa.stored().snapshots[0].cloudWriteUnconfirmed), true);
      assert.equal(await page.evaluate(() => migrateLegacyKiotInventorySnapshots()), false);
      assert.equal(await page.evaluate(() => catalogQa.calls.length), 1);
      await closeDialog(page, dialog);

      if (reduced) {
        await selectFile(page);
        await page.evaluate(() => catalogQa.reader.reject(new Error('QA CDN unavailable')));
        await waitForOutcome(dialog, 'error');
        assert.equal(await alarm.locator('strong').textContent(), 'Bộ đọc Excel chưa tải');
        assert.deepEqual(await page.evaluate(() => ({
          previous: kiotViet.catalog[0].sku, reads: catalogQa.reads, writes: catalogQa.calls.length,
        })), { previous: 'PREVIOUS', reads: 0, writes: 0 });
        await closeDialog(page, dialog);

        await selectFile(page, wrongFile);
        await page.evaluate(() => catalogQa.reader.resolve(catalogQa.workbook));
        await waitForOutcome(dialog, 'error');
        assert.equal(await alarm.locator('strong').textContent(), 'File không hợp lệ');
        assert.match(await dialog.locator('.import-status p').textContent(), /không tìm thấy mã hàng/i);
        assert.deepEqual(await page.evaluate(() => ({
          previous: kiotViet.catalog[0].sku, snapshots: kiotViet.snapshots.length, writes: catalogQa.calls.length,
        })), { previous: 'PREVIOUS', snapshots: 0, writes: 0 });
        await closeDialog(page, dialog);

        const cases = [
          { kind: 'session', status: 401, code: 'PGRST303', message: 'JWT expired' },
          { kind: 'permission', status: 400, code: 'P0001', message: 'Bạn không có quyền lưu snapshot tồn kho của workspace này' },
          { kind: 'unavailable', status: 404, code: 'PGRST202', message: 'QA missing RPC' },
          { kind: 'server', status: 500, code: '23502', message: 'QA database rollback' },
          { kind: 'unconfirmed', status: 200, uncertain: true },
        ];
        for (const scenario of cases) {
          await selectFile(page);
          await page.evaluate(() => catalogQa.reader.resolve(catalogQa.workbook));
          await page.waitForFunction(() => catalogQa.calls.length === 1);
          await page.evaluate(({ status, code, message }) => {
            catalogQa.rpc.resolve({ status, error: code ? { code, message } : null, data: [] });
          }, scenario);
          await waitForOutcome(dialog, 'error');
          const result = await page.evaluate(() => ({
            terminal: catalogQa.events.at(-1),
            stored: catalogQa.stored().snapshots[0],
            refreshes: catalogQa.refreshes,
          }));
          assert.deepEqual(result.terminal, ['fail', scenario.kind]);
          assert.equal(result.stored.cloudId, undefined);
          assert.equal(result.stored.cloudWriteUnconfirmed, scenario.uncertain);
          assert.equal(result.refreshes, 0);
          if (scenario.uncertain) {
            assert.match(await dialog.locator('.import-status p').textContent(), /chưa nhận được xác nhận lưu cloud/i);
            const replay = await page.evaluate(async () => {
              // Restore the persisted record as a new page load would, then run migration.
              kiotViet = catalogQa.stored();
              return await migrateLegacyKiotInventorySnapshots();
            });
            assert.equal(replay, false);
            assert.equal(await page.evaluate(() => catalogQa.calls.length), 1);
          }
          await closeDialog(page, dialog);
        }

        await selectFile(page);
        await page.evaluate(() => catalogQa.reader.resolve(catalogQa.workbook));
        await page.waitForFunction(() => catalogQa.calls.length === 1);
        await page.clock.fastForward(46000);
        await waitForOutcome(dialog, 'error');
        assert.equal(await alarm.locator('strong').textContent(), 'Server không phản hồi');
        assert.equal(await page.evaluate(() => catalogQa.aborts), 1);
        await page.evaluate(() => catalogQa.rpc.resolve({ data: [{ id: 'qa-late-receipt' }] }));
        assert.equal(await page.evaluate(() => catalogQa.stored().snapshots[0].cloudId), undefined);
        assert.equal(await page.evaluate(() => catalogQa.stored().snapshots[0].cloudWriteUnconfirmed), true);
        await closeDialog(page, dialog);

        await page.evaluate(() => { catalogQa.online = false; });
        await selectFile(page);
        await page.evaluate(() => catalogQa.reader.resolve(catalogQa.workbook));
        await waitForOutcome(dialog, 'error');
        assert.match(await dialog.locator('.import-status p').textContent(), /chưa gửi yêu cầu lưu cloud/i);
        assert.equal(await page.evaluate(() => catalogQa.calls.length), 0);
        await closeDialog(page, dialog);

        await selectFile(page);
        await page.evaluate(() => catalogQa.reader.resolve(catalogQa.workbook));
        await page.waitForFunction(() => catalogQa.calls.length === 1);
        await page.evaluate(() => {
          catalogQa.workspace = 'qa-other-workspace';
          currentUser = { id: 'qa-other-user' };
          kiotViet = catalogQa.fixture();
          catalogQa.rpc.resolve({ data: [{ id: 'qa-other-scope-receipt' }] });
        });
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(await page.evaluate(() => ({
          final: catalogQa.events.at(-1),
          catalog: kiotViet.catalog[0].sku,
          snapshots: kiotViet.snapshots.length,
          refreshes: catalogQa.refreshes,
        })), { final: ['close'], catalog: 'PREVIOUS', snapshots: 0, refreshes: 0 });
      }
      assert.deepEqual(errors, []);
      console.log(`PASS Kiot catalog import ${width}/${theme}: live input, real ACK, stages, isolated failures, layout and focus.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
