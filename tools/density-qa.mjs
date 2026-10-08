/* Shared density: real routes, both themes and input modes, isolated from cloud. */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const baseline = process.env.QA_DENSITY_BASELINE === '1';
const out = resolve('qa-results/density');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 600, isMobile: width < 600, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.goto(pathToFileURL(resolve('plate-studio.html')).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof goPage === 'function');
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      const style = document.createElement('style');
      style.textContent = '#auth-ov{display:none!important;pointer-events:none!important}';
      document.head.append(style);
      models = Array.from({length:240}, (_, i) => ({id:`density-${i}`,name:`Model ${i} — Hộp khăn giấy và phụ kiện trang trí tên dài`,images:i%3===0?['https://qa.invalid/missing.jpg']:[],parts:[],variants:i%2?[{id:'small',name:'Cỡ nhỏ'}]:[],cats:['QA']}));
      FILTERS.models={...FILTERS.models,cat:'all',search:'',sort:'created_desc'};
      kiotViet={...kiotViet,salesImports:[{id:'density-sales',importedAt:'2026-10-08T09:00:00Z',period:{from:'2026-10-08',to:'2026-10-08'},sales:Array.from({length:12},(_,i)=>({sku:`QA-${i}`,name:`Model bán hàng ${i} — Tên sản phẩm dài để kiểm tra`,qty:i+1,revenue:(i+1)*50000}))}]};
      salesPageReportId='density-sales';salesPageDatePreset='all';
    }, theme);
    for (const route of ['dashboard', 'models', 'orders', 'plates', 'batches', 'print-plans', 'fulfillment', 'packaging', 'sales', 'inventory', 'kiotviet', 'delivery-receive']) {
      await page.evaluate(route => goPage(route, { historyMode: 'none' }), route);
      await page.waitForTimeout(400);
      const metrics = await page.evaluate(() => {
        const host = document.querySelector('.page.active');
        const heading = host.querySelector('.page-heading');
        const h1 = heading?.querySelector('h1');
        const css = el => getComputedStyle(el);
        return {
          title: h1 ? parseFloat(css(h1).fontSize) : null,
          headingHeight: heading?.getBoundingClientRect().height,
          headingGap: heading ? parseFloat(css(heading).marginBottom) : null,
          pagePadding: parseFloat(css(host).paddingTop),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          clippedHero: [...host.querySelectorAll('.dashboard-role-hero h2,.dashboard-role-hero p')].some(el => el.scrollWidth > el.clientWidth + 1),
          clippedSurface: [...host.querySelectorAll('.sales-page>.sales-hero,.sales-page>.sales-panel,.dashboard-role-hero')].some(el => el.getBoundingClientRect().right > innerWidth + 1),
          clippedButton: [...host.querySelectorAll('.sales-hero-actions .btn')].some(el => el.scrollWidth > el.clientWidth + 1),
        };
      });
      results.push({ width, theme, route, ...metrics });
      if (!baseline) {
        assert.ok(metrics.title === null || metrics.title <= (width < 600 ? 24 : 30), `${route}: oversized heading ${metrics.title}`);
        assert.ok(metrics.headingGap === null || metrics.headingGap <= 16, `${route}: oversized heading gap`);
        assert.ok(metrics.pagePadding <= 20, `${route}: oversized page padding`);
        assert.equal(metrics.overflow, false, `${route}: horizontal overflow`);
        assert.equal(metrics.clippedHero, false, `${route}: clipped hero text`);
        assert.equal(metrics.clippedSurface, false, `${route}: surface wider than viewport`);
        assert.equal(metrics.clippedButton, false, `${route}: clipped button label`);
      }
      if (['dashboard', 'models', 'sales'].includes(route)) await page.screenshot({ path: `${out}/${baseline ? 'before' : 'after'}-${width}-${theme}-${route}.png` });
    }
    if (!baseline) {
      // Exercise the shared primitives independently of empty account data.
      await page.evaluate(() => {
        const fixture = document.createElement('div');
        fixture.id = 'density-fixture';
        fixture.innerHTML = '<div class="card"><button class="btn btn-ac">Lưu thay đổi</button><button class="btn btn-sm">Hủy chọn</button><input type="text" aria-label="Tên model" value="Tên đang nhập"></div>';
        document.querySelector('.page.active').prepend(fixture);
      });
      for (const button of await page.locator('#density-fixture button').all()) {
        const rect = await button.boundingBox();
        const primary = await button.evaluate(el => el.classList.contains('btn-ac'));
        assert.ok(rect.height >= (width < 600 || primary ? 43.99 : 29.99) && rect.width >= 43.99, 'Primary/touch buttons retain 44px targets');
        await button.focus();
        assert.ok(await button.evaluate(el => el === document.activeElement), 'Keyboard focus retained');
      }
      const input = page.locator('#density-fixture input');
      await input.fill('Tên model không bị mất');
      if (width < 600) assert.ok(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), 'Prevent iOS input auto-zoom');
      assert.equal(await input.inputValue(), 'Tên model không bị mất');
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/${baseline ? 'before' : 'after'}.json`, JSON.stringify(results, null, 2));
}
console.log(`Density ${baseline ? 'baseline' : 'QA PASS'}: ${results.length} route/profile/theme checks`);
