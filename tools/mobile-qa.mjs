/**
 * Mobile regression check for Plate Studio.
 *
 * Uses the installed playwright-core package with the locally installed Chrome,
 * opens the app in an isolated iPhone-sized browser context and saves visual
 * evidence plus a JSON result. The isolated context intentionally does not
 * use the operator's storage or submit any form, so it is safe to run as a
 * read-only UI audit.
 *
 * Run: npm run qa:mobile
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const appFile = join(root, 'plate-studio.html');
const outputDir = join(root, 'qa-results', 'mobile');
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find(path => existsSync(path));
const routes = ['dashboard', 'models', 'orders', 'plates', 'batches', 'fulfillment', 'sales', 'inventory'];

if (!existsSync(appFile)) throw new Error(`Không tìm thấy ứng dụng: ${appFile}`);
if (!executablePath) throw new Error('Không tìm thấy Chrome hoặc Edge. Đặt CHROME_PATH rồi chạy lại.');
mkdirSync(outputDir, { recursive: true });

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
});

const report = { createdAt: now.toISOString(), mode: 'isolated visual audit (không đăng nhập, không ghi dữ liệu)', viewport: 'iPhone 390×844', executablePath, routes: [], summary: { passed: 0, warnings: 0, failed: 0 } };
/* A regression guard for a frequent class of defects: a control styled for the
   dark sheet accidentally survives when the user switches to light mode.
   Keep the probes in the real form scope so we test the cascade, not a copy of it. */
async function auditQuantityControlThemes(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const oldTheme = root.getAttribute('data-theme');
    const form = document.querySelector('#ov-order-form') || document.body;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;pointer-events:none';
    probe.innerHTML = `
      <div class="of-p-stepper"><button class="of-minus">−</button><span class="of-qv">1</span><button>+</button></div>
      <div class="of-cr-stepper"><button>−</button><span class="of-cr-qv">1</span><button>+</button></div>`;
    form.append(probe);
    const luminance = color => {
      const isModernSrgb = /^color\(srgb\s/i.test(color);
      const values = (color.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
      if (values.length !== 3) return null;
      const linear = values.map(value => {
        const channel = isModernSrgb ? value : value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    const read = selector => {
      const style = getComputedStyle(probe.querySelector(selector));
      return { background: style.backgroundColor, color: style.color, luminance: luminance(style.backgroundColor) };
    };
    root.setAttribute('data-theme', 'light');
    const light = {
      catalog: read('.of-p-stepper'),
      cart: read('.of-cr-stepper'),
      catalogValue: read('.of-p-stepper .of-qv'),
      cartValue: read('.of-cr-stepper .of-cr-qv'),
    };
    root.removeAttribute('data-theme');
    const dark = { catalog: read('.of-p-stepper'), cart: read('.of-cr-stepper') };
    if (oldTheme !== null) root.setAttribute('data-theme', oldTheme);
    probe.remove();
    const failures = Object.entries(light)
      .filter(([, item]) => item.luminance === null || item.luminance < .38)
      .map(([name, item]) => `${name} vẫn có nền quá tối ở light mode (${item.background})`);
    return { light, dark, failures };
  });
}
for (const route of routes) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
  });
  const url = `${pathToFileURL(appFile).href}#ps_page=${route}`;
  let loadError = '';
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    /* App normally requires a cloud session. The QA context is deliberately
       isolated and has no credentials, so only in this temporary browser we
       hide the sign-in layer and exercise the read-only route renderer. */
    await page.waitForFunction(() => typeof window.goPage === 'function', { timeout: 8000 });
    await page.evaluate((targetRoute) => {
      const style = document.createElement('style');
      style.textContent = '#auth-ov{display:none!important;pointer-events:none!important}';
      document.head.append(style);
      window.goPage(targetRoute, { historyMode: 'none' });
    }, route);
    await page.waitForSelector(`#page-${route}.active`, { timeout: 8000 });
    await page.waitForTimeout(500);
  } catch (error) {
    loadError = error.message;
  }
  const checks = await page.evaluate((expectedRoute) => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) return false;
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const active = document.querySelector('.page.active');
    const clickable = [...document.querySelectorAll('button,a,input,select,textarea')].filter(visible);
    const clipped = clickable.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.top < innerHeight && (rect.left < -2 || rect.right > innerWidth + 2);
    }).slice(0, 12).map(element => ({ label: (element.getAttribute('aria-label') || element.textContent || element.placeholder || element.id).trim().slice(0, 80), left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) }));
    const blocked = clickable.filter(element => {
      const rect = element.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth) return false;
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return top && top !== element && !element.contains(top) && !top.contains(element);
    }).slice(0, 12).map(element => ({ label: (element.getAttribute('aria-label') || element.textContent || element.placeholder || element.id).trim().slice(0, 80), blocker: (document.elementFromPoint(element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2, element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2)?.className || '').toString().slice(0, 100) }));
    const tinyTargets = clickable.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width < 32 && rect.height < 32;
    }).slice(0, 12).map(element => ({ label: (element.getAttribute('aria-label') || element.textContent || element.placeholder || element.id).trim().slice(0, 80), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
    return {
      title: document.title,
      ready: document.readyState,
      expectedActive: `page-${expectedRoute}`,
      actualActive: active?.id || '',
      activeHasContent: Boolean(active?.innerText?.trim()),
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      clipped,
      blocked,
      tinyTargets,
    };
  }, route).catch(error => ({ evaluationError: error.message }));
  if (route === routes[0]) {
    report.themeAudit = await auditQuantityControlThemes(page).catch(error => ({ failures: [`Không kiểm tra theme control: ${error.message}`] }));
  }
  const screenshot = join(outputDir, `${stamp}-${route}.png`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  const errors = [
    ...(loadError ? [`Không mở được trang: ${loadError}`] : []),
    ...(checks.evaluationError ? [`Không kiểm tra được DOM: ${checks.evaluationError}`] : []),
    ...(checks.actualActive !== `page-${route}` ? [`Sai trang đang mở: ${checks.actualActive || 'không có trang active'}`] : []),
    ...(!checks.activeHasContent ? ['Trang active không có nội dung hiển thị'] : []),
    ...(checks.horizontalOverflow > 2 ? [`Tràn ngang ${checks.horizontalOverflow}px`] : []),
    ...(route === routes[0] ? (report.themeAudit?.failures || []) : []),
    ...checks.blocked.map(item => `Nút bị che: ${item.label || '(không tên)'} · lớp che: ${item.blocker || '(không rõ)'}`),
    ...consoleErrors.filter(message => !/failed to fetch|net::err|favicon|chưa tải được thư viện kết nối/i.test(message)),
  ];
  const warnings = checks.tinyTargets?.map(item => `Vùng bấm nhỏ: ${item.label || '(không tên)'} (${item.width}×${item.height})`) || [];
  const row = { route, url, screenshot: `qa-results/mobile/${stamp}-${route}.png`, checks, errors, warnings };
  report.routes.push(row);
  if (errors.length) report.summary.failed++; else if (warnings.length) report.summary.warnings++; else report.summary.passed++;
  await page.close();
}
await browser.close();
const reportFile = join(outputDir, `report-${stamp}.json`);
const latestFile = join(outputDir, 'latest.json');
writeFileSync(reportFile, JSON.stringify(report, null, 2));
writeFileSync(latestFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: `qa-results/mobile/report-${stamp}.json`, latest: 'qa-results/mobile/latest.json', summary: report.summary, failures: report.routes.filter(row => row.errors.length).map(row => ({ route: row.route, errors: row.errors })) }, null, 2));
