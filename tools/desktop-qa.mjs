/**
 * Desktop regression check for Plate Studio.
 *
 * Opens representative pages in an isolated 1440×900 Chrome window. It never
 * uses a saved session or submits data; it only checks the rendered UI and
 * stores screenshots plus a JSON report for review.
 *
 * Run: npm run qa:desktop
 */
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const appFile = join(root, 'plate-studio.html');
const outputDir = join(root, 'qa-results', 'desktop');
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find(path => existsSync(path));
const routes = ['dashboard', 'models', 'orders', 'plates', 'batches', 'print-plans', 'fulfillment', 'packaging', 'sales', 'inventory', 'kiotviet', 'delivery-receive'];
const profiles = [
  { id: 'wide', label: 'Desktop rộng 1440×900', width: 1440, height: 900 },
  { id: 'laptop', label: 'Laptop 1024×768', width: 1024, height: 768 },
];
/* Laptop checks the routes with the densest layouts. The wide profile still
   checks every primary page, so the audit stays rigorous without becoming too
   slow for a local pre-deploy run. */
const laptopRoutes = new Set(['dashboard', 'models', 'orders', 'batches', 'print-plans', 'fulfillment', 'sales', 'inventory', 'kiotviet']);
const axeSampleRoutes = new Set(['models', 'orders', 'batches', 'fulfillment', 'sales', 'inventory', 'kiotviet']);
const requestedRoutes = new Set((process.env.QA_ROUTES || '').split(',').map(value => value.trim()).filter(Boolean));

if (!existsSync(appFile)) throw new Error(`Không tìm thấy ứng dụng: ${appFile}`);
if (!executablePath) throw new Error('Không tìm thấy Chrome hoặc Edge. Đặt CHROME_PATH rồi chạy lại.');
mkdirSync(outputDir, { recursive: true });

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const browser = await chromium.launch({ executablePath, headless: true });
const report = {
  createdAt: now.toISOString(),
  mode: 'isolated UI/UX audit (không đăng nhập, không ghi dữ liệu)',
  profiles, executablePath, routes: [],
  summary: { passed: 0, warnings: 0, failed: 0 },
};

for (const profile of profiles) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
  });
for (const route of routes.filter(route => (profile.id !== 'laptop' || laptopRoutes.has(route)) && (!requestedRoutes.size || requestedRoutes.has(route)))) {
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
    await page.waitForFunction(() => typeof window.goPage === 'function', { timeout: 8000 });
    await page.evaluate(targetRoute => {
      const style = document.createElement('style');
      style.textContent = '#auth-ov{display:none!important;pointer-events:none!important}';
      document.head.append(style);
      window.goPage(targetRoute, { historyMode: 'none' });
    }, route);
    await page.waitForSelector(`#page-${route}.active`, { timeout: 8000 });
    await page.waitForTimeout(350);
  } catch (error) {
    loadError = error.message;
  }
  const checks = await page.evaluate(expectedRoute => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) return false;
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        if (node !== element && /(hidden|auto|scroll|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) {
          const clip = node.getBoundingClientRect();
          const visibleWidth = Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left);
          const visibleHeight = Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top);
          if (visibleWidth < Math.min(24, rect.width * .6) || visibleHeight < Math.min(24, rect.height * .6)) return false;
        }
      }
      return true;
    };
    const labelOf = element => (element.getAttribute('aria-label') || element.textContent || element.placeholder || element.id || '(không tên)').trim().replace(/\s+/g, ' ').slice(0, 90);
    const active = document.querySelector('.page.active');
    const clickable = [...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')]
      .filter(element => !element.closest('#auth-ov'))
      .filter(visible);
    const clipped = clickable.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.top < innerHeight && (rect.left < -2 || rect.right > innerWidth + 2);
    }).slice(0, 12).map(element => {
      const rect = element.getBoundingClientRect();
      return { label: labelOf(element), left: Math.round(rect.left), right: Math.round(rect.right) };
    });
    const blocked = clickable.filter(element => {
      const rect = element.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth) return false;
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return top && top !== element && !element.contains(top) && !top.contains(element);
    }).slice(0, 12).map(element => {
      const rect = element.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { label: labelOf(element), blocker: (top?.className || top?.tagName || '').toString().slice(0, 100), blockerId: top?.id || '', rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } };
    });
    const denseCopy = [...document.querySelectorAll('.page.active p,.page.active small,.page.active .kv-note')]
      .filter(visible)
      .map(element => ({ text: element.textContent.trim().replace(/\s+/g, ' '), height: Math.round(element.getBoundingClientRect().height) }))
      .filter(item => item.text.length > 160 || item.height > 54)
      .slice(0, 8);
    const undersizedTargets = clickable.filter(element => {
      const rect = element.getBoundingClientRect();
      const isInline = getComputedStyle(element).display === 'inline' && rect.height <= parseFloat(getComputedStyle(element).lineHeight || '0');
      return !isInline && (rect.width < 24 || rect.height < 24);
    }).slice(0, 12).map(element => {
      const rect = element.getBoundingClientRect();
      return { label: labelOf(element), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    const compactTargets = clickable.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 24 && rect.height >= 24 && (rect.width < 32 || rect.height < 32);
    }).slice(0, 12).map(element => {
      const rect = element.getBoundingClientRect();
      return { label: labelOf(element), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    const typography = [...document.querySelectorAll('.page.active p,.page.active small,.page.active li,.page.active label')]
      .filter(visible)
      .map(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        const fontSize = parseFloat(style.fontSize), lineHeight = parseFloat(style.lineHeight);
        return { text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 100), fontSize, lineHeight, width: Math.round(rect.width) };
      })
      .filter(item => item.text.length > 18 && ((item.fontSize < 11) || (item.text.length > 54 && Number.isFinite(item.lineHeight) && item.lineHeight / item.fontSize < 1.25)))
      .slice(0, 12);
    const longLines = [...document.querySelectorAll('.page.active p,.page.active .kv-note,.page.active .access-note')]
      .filter(visible)
      .map(element => ({ text: element.textContent.trim().replace(/\s+/g, ' '), width: Math.round(element.getBoundingClientRect().width) }))
      .filter(item => item.text.length > 110 && item.width > 820)
      .slice(0, 8);
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(element => Number(element.tagName.slice(1)));
    const rectOf = element => element ? (() => { const rect = element.getBoundingClientRect(); return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) }; })() : null;
    return {
      title: document.title,
      ready: document.readyState,
      expectedActive: `page-${expectedRoute}`,
      actualActive: active?.id || '',
      activeHasContent: Boolean(active?.innerText?.trim()),
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      clipped,
      blocked,
      denseCopy,
      undersizedTargets,
      compactTargets,
      typography,
      longLines,
      headingLevels: headings,
      sidebar: { scroll: rectOf(document.querySelector('.sb-scroll')), bottom: rectOf(document.querySelector('.sb-bottom')), notifications: rectOf(document.querySelector('#system-notification-button')), system: rectOf([...document.querySelectorAll('.sb-nav-group-toggle')].find(element => element.textContent.trim() === 'Hệ thống')) },
    };
  }, route).catch(error => ({ evaluationError: error.message }));
  let axe = { violations: [], incomplete: [] };
  if (profile.id === 'wide' && axeSampleRoutes.has(route)) {
    try {
      const results = await new AxeBuilder({ page })
        .include(`#page-${route}`)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      axe = {
        violations: results.violations.map(issue => ({ id: issue.id, impact: issue.impact || 'unknown', help: issue.help, nodes: issue.nodes.length, samples: issue.nodes.slice(0, 4).map(node => ({ target: node.target, failure: node.failureSummary })) })),
        incomplete: results.incomplete.map(issue => ({ id: issue.id, help: issue.help, nodes: issue.nodes.length })),
      };
    } catch (error) {
      axe = { auditError: error.message, violations: [], incomplete: [] };
    }
  }
  const screenshot = join(outputDir, `${stamp}-${profile.id}-${route}.png`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  const errors = [
    ...(loadError ? [`Không mở được trang: ${loadError}`] : []),
    ...(checks.evaluationError ? [`Không kiểm tra được DOM: ${checks.evaluationError}`] : []),
    ...(checks.actualActive !== `page-${route}` ? [`Sai trang đang mở: ${checks.actualActive || 'không có trang active'}`] : []),
    ...(!checks.activeHasContent ? ['Trang active không có nội dung hiển thị'] : []),
    ...(checks.horizontalOverflow > 2 ? [`Tràn ngang ${checks.horizontalOverflow}px`] : []),
    ...checks.clipped.map(item => `Nút bị cắt: ${item.label} (${item.left}→${item.right})`),
    ...checks.blocked.map(item => `Nút bị che: ${item.label} · lớp che: ${item.blocker || '(không rõ)'}${item.blockerId ? `#${item.blockerId}` : ''}`),
    ...checks.undersizedTargets.map(item => `Vùng bấm dưới chuẩn WCAG 24px: ${item.label} (${item.width}×${item.height})`),
    ...axe.violations.filter(issue => ['critical', 'serious'].includes(issue.impact)).map(issue => `axe/${issue.id} (${issue.impact}): ${issue.help} · ${issue.nodes} vị trí`),
    ...consoleErrors.filter(message => !/failed to fetch|net::err|favicon|chưa tải được thư viện kết nối/i.test(message)),
  ];
  const warnings = [
    ...(checks.denseCopy?.map(item => `Đoạn mô tả dài cần rà: ${item.text.slice(0, 110)}${item.text.length > 110 ? '…' : ''}`) || []),
    ...(checks.compactTargets?.map(item => `Vùng bấm nhỏ hơn khuyến nghị 32px: ${item.label} (${item.width}×${item.height})`) || []),
    ...(checks.typography?.map(item => `Chữ/giãn dòng cần rà: ${item.fontSize.toFixed(1)}px · ${item.text}`) || []),
    ...(checks.longLines?.map(item => `Dòng diễn giải quá rộng (${item.width}px): ${item.text.slice(0, 110)}${item.text.length > 110 ? '…' : ''}`) || []),
    ...axe.violations.filter(issue => !['critical', 'serious'].includes(issue.impact)).map(issue => `axe/${issue.id} (${issue.impact}): ${issue.help} · ${issue.nodes} vị trí`),
    ...axe.incomplete.map(issue => `axe cần rà thủ công/${issue.id}: ${issue.help} · ${issue.nodes} vị trí`),
    ...(axe.auditError ? [`Không chạy được axe: ${axe.auditError}`] : []),
  ];
  const row = { profile: profile.id, viewport: `${profile.width}×${profile.height}`, route, url, screenshot: `qa-results/desktop/${stamp}-${profile.id}-${route}.png`, checks, axe, errors, warnings };
  report.routes.push(row);
  if (errors.length) report.summary.failed++; else if (warnings.length) report.summary.warnings++; else report.summary.passed++;
  await page.close();
}
  await context.close();
}
await browser.close();
const reportFile = join(outputDir, `report-${stamp}.json`);
writeFileSync(reportFile, JSON.stringify(report, null, 2));
writeFileSync(join(outputDir, 'latest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: `qa-results/desktop/report-${stamp}.json`, latest: 'qa-results/desktop/latest.json', summary: report.summary, failures: report.routes.filter(row => row.errors.length).map(row => ({ route: row.route, errors: row.errors })), warnings: report.routes.filter(row => row.warnings.length).map(row => ({ route: row.route, warnings: row.warnings })) }, null, 2));
