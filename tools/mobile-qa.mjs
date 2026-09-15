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
const routes = ['dashboard', 'models', 'orders', 'plates', 'batches', 'fulfillment', 'sales', 'inventory', 'delivery-builder'];

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
/* The More sheet is shared mobile navigation. Light mode must stay calm and
   legible, while dark mode deliberately keeps its expressive aurora treatment. */
async function auditMoreSheetThemes(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const oldTheme = root.getAttribute('data-theme');
    const read = () => {
      const item = document.querySelector('.more-group .more-item');
      const title = document.querySelector('.more-group-title');
      const style = item && getComputedStyle(item);
      return {
        itemBackground: style?.backgroundImage || '', itemBackgroundColor: style?.backgroundColor || '', itemColor: style?.color || '',
        borderWidth: style?.borderTopWidth || '', animation: style?.animationName || '',
        titleColor: title ? getComputedStyle(title).color : '',
      };
    };
    root.setAttribute('data-theme', 'light');
    const light = read();
    root.removeAttribute('data-theme');
    const dark = read();
    if (oldTheme !== null) root.setAttribute('data-theme', oldTheme);
    const luminance = color => {
      const values = (color.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
      if (values.length !== 3) return null;
      const channels = values.map(value => value / 255);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const failures = [];
    if (light.itemBackground !== 'none') failures.push(`More menu light vẫn dùng nền gradient (${light.itemBackground})`);
    if (light.borderWidth !== '0px') failures.push(`Nút More menu light vẫn còn viền (${light.borderWidth})`);
    if (luminance(light.itemBackgroundColor) === null || luminance(light.itemBackgroundColor) < .82) failures.push(`Nền More menu light chưa đủ sáng và trung tính (${light.itemBackgroundColor})`);
    if (light.animation !== 'none') failures.push(`More menu light vẫn chạy animation (${light.animation})`);
    if (luminance(light.itemColor) === null || luminance(light.itemColor) < .12) failures.push(`Chữ More menu light thiếu tương phản (${light.itemColor})`);
    if (dark.itemBackground === 'none' || dark.animation === 'none') failures.push('Dark mode đã mất style aurora riêng của menu');
    return { light, dark, failures };
  });
}
async function auditProcessRail(page) {
  const failures = [];
  for (const width of [360, 390, 640, 1024]) {
    await page.setViewportSize({width, height:844});
    for (const theme of ['light', 'dark']) {
      const result = await page.evaluate(({width, theme}) => {
        document.documentElement.setAttribute('data-theme', theme);
        selectFulfillmentProcessTab('part-qc');
        const list=document.querySelector('.fulfillment-process-tablist');
        const tabs=[...list.querySelectorAll('button')];
        const failures=[];
        if(width<=640){
          for(const tab of tabs){
            const label=tab.querySelector('span'),badge=tab.querySelector('b');
            badge.textContent='999';
            const rect=tab.getBoundingClientRect(),a=label.getBoundingClientRect(),b=badge.getBoundingClientRect();
            if(a.left<rect.left || a.right>rect.right || a.top<rect.top || a.bottom>b.top || b.right>rect.right || b.bottom>rect.bottom)failures.push(`Nhãn/số bị che: ${label.textContent}`);
          }
          list.scrollTop=list.scrollHeight;
          const before=list.scrollTop;
          tabs.at(-1).focus({preventScroll:true});
          tabs.at(-1).click();
          const next=document.querySelector('.fulfillment-process-tablist');
          if(Math.abs(next.scrollTop-before)>1 || document.activeElement!==next.querySelector('.is-active'))failures.push('Chọn tab cuối mất vị trí cuộn/focus');
        }else if(getComputedStyle(tabs[0].querySelector('span')).writingMode!=='horizontal-tb')failures.push('Chữ desktop bị xoay');
        const panel=document.querySelector('.fulfillment-process-panel');
        // Representative populated layouts: both workshop queues and ready shelf
        // must fit the space left by the rail, including long names and actions.
        for(const className of ['fulfillment-workshop-grid','fulfillment-ready-shelf']){
          const grid=document.createElement('div');grid.className=className;
          grid.innerHTML=Array.from({length:2},()=>'<article class="card workshop-item"><div class="workshop-item-img"></div><div><b class="workshop-item-title">Sản phẩm kiểm tra tên dài nhiều phiên bản</b><div class="workshop-item-meta">Phiên bản mẫu · 999 sản phẩm</div></div><div class="workshop-item-actions"><button class="btn btn-ghost">Báo lỗi</button><button class="btn btn-ac">QC part</button></div></article>').join('');
          panel.append(grid);
          const bounds=panel.getBoundingClientRect();
          if([...grid.querySelectorAll('article,button')].some(el=>{const r=el.getBoundingClientRect();return r.left<bounds.left || r.right>bounds.right;}))failures.push(`${className} tràn cạnh nội dung`);
          grid.remove();
        }
        return failures;
      },{width,theme});
      failures.push(...result.map(error=>`${width}px/${theme}: ${error}`));
      if(width===390){
        await page.locator('.fulfillment-process-tabs').screenshot({path:join(outputDir,`${stamp}-process-rail-${theme}.png`)});
      }
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');selectFulfillmentProcessTab('part-qc');});
  return { failures };
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
      /* Kiểm tra sales bằng fixture nhiều tháng để mobile audit phủ đúng control
         lọc nhanh, thay vì chỉ thấy màn hình chưa có dữ liệu. */
      if (targetRoute === 'sales') {
        kiotViet = { ...kiotViet, salesImports: [5, 6, 7, 8].map(month => ({
          id: `qa-mobile-month-${month}`, importedAt: `2026-${String(month).padStart(2, '0')}-12T09:00:00.000Z`, source: 'dated-file',
          period: { from: `2026-${String(month).padStart(2, '0')}-12`, to: `2026-${String(month).padStart(2, '0')}-12` },
          sales: [{ sku: `QA-MOBILE-${month}`, name: `QA tháng ${month}`, category: 'QA', qty: month, revenue: month * 10000 }],
        })) };
        salesPageReportId = ''; salesPageMonthFilter = 'all';
      }
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
      if (!top || top === element || element.contains(top) || top.contains(element)) return false;
      /* Thanh điều hướng nổi che phần ở đáy tại vị trí cuộn hiện tại là bình
         thường, miễn nút vẫn có thể được cuộn lên vùng thao tác. Chỉ báo lỗi
         khi nó bị che cố định cả sau khi đưa chính nút vào trung tâm viewport. */
      if (top.closest?.('.mnav')) {
        const scrollParent = (() => {
          for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
          }
          return null;
        })();
        const previousTop = scrollParent?.scrollTop || 0;
        const previousScrollBehavior = scrollParent?.style.scrollBehavior || '';
        if (scrollParent) {
          scrollParent.style.scrollBehavior = 'auto';
          const parentRect = scrollParent.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          scrollParent.scrollTop += elementRect.top - parentRect.top - parentRect.height / 2 + elementRect.height / 2;
        }
        const moved = element.getBoundingClientRect();
        const movedTop = document.elementFromPoint(moved.left + moved.width / 2, moved.top + moved.height / 2);
        if (scrollParent) {
          scrollParent.scrollTop = previousTop;
          scrollParent.style.scrollBehavior = previousScrollBehavior;
        }
        if (movedTop === element || element.contains(movedTop) || movedTop?.contains(element)) return false;
      }
      return true;
    }).slice(0, 12).map(element => ({ label: (element.getAttribute('aria-label') || element.textContent || element.placeholder || element.id).trim().slice(0, 80), blocker: (document.elementFromPoint(element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2, element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2)?.className || '').toString().slice(0, 100) }));
    const tinyTargets = clickable.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width < 32 && rect.height < 32;
    }).slice(0, 12).map(element => ({ label: (element.getAttribute('aria-label') || element.textContent || element.placeholder || element.id).trim().slice(0, 80), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
    const wizard = expectedRoute === 'delivery-builder' ? (() => {
      const hero = document.querySelector('.delivery-wizard-hero');
      const stage = document.querySelector('.delivery-wizard-stage');
      const toolbar = document.querySelector('.delivery-product-toolbar');
      return { heroText: hero?.innerText?.trim() || '', stageTop: Math.round(stage?.getBoundingClientRect().top || 0), toolbar: Boolean(toolbar) };
    })() : null;
    const salesMonthFilter = expectedRoute === 'sales' ? (() => {
      const chips = [...document.querySelectorAll('#sales-page .sales-month-chip')];
      const strip = document.querySelector('#sales-page .sales-month-chips');
      const labels = chips.map(chip => chip.textContent.trim());
      const rect = strip?.getBoundingClientRect();
      return {
        labels,
        hasAllMonths: ['Tháng 5 · 2026', 'Tháng 6 · 2026', 'Tháng 7 · 2026', 'Tháng 8 · 2026'].every(label => labels.includes(label)),
        controlHeight: Math.round(chips[0]?.getBoundingClientRect().height || 0),
        stripWithinPage: Boolean(rect && rect.left >= -1 && rect.right <= innerWidth + 1),
      };
    })() : null;
    /* Công đoạn xưởng là một họ control riêng: trên điện thoại tab phải là
       rail dọc nằm cạnh panel nội dung, đủ rộng để chạm chính xác và không
       được tràn ngang. Kiểm tra từ DOM/CSS để bảo vệ mọi trạng thái,
       thay vì chỉ nhìn ảnh của một tab đang mở. */
    const fulfillmentProcessTabs = expectedRoute === 'fulfillment' ? (() => {
      const tablist = document.querySelector('#fulfillment-page .fulfillment-process-tablist');
      const tabs = [...(tablist?.querySelectorAll('.fulfillment-process-tab') || [])];
      const activeTab = tablist?.querySelector('.fulfillment-process-tab.is-active');
      const panel = document.querySelector('#fulfillment-page .fulfillment-process-panel');
      const tabHeights = tabs.map(tab => tab.getBoundingClientRect().height);
      const activeBefore = activeTab ? getComputedStyle(activeTab, '::before').display : '';
      const activeAfter = activeTab ? getComputedStyle(activeTab, '::after').display : '';
      const tablistStyle = tablist ? getComputedStyle(tablist) : null;
      const tablistRect = tablist?.getBoundingClientRect();
      const tabRects = tabs.map(tab => tab.getBoundingClientRect());
      const panelRect = panel?.getBoundingClientRect();
      const sideRail = Boolean(tablistStyle?.flexDirection === 'column' && tablistRect && panelRect && tabRects.length && tablistRect.left < panelRect.left && Math.abs(tablistRect.top - panelRect.top) <= 2 && tabRects.every(rect => rect.width >= tablistRect.width - 4) && tabRects.slice(1).every((rect, index) => rect.top >= tabRects[index].bottom - 1));
      const compactTabs = Boolean(tablistRect && tablistRect.width <= 48 && tabRects.every(rect => rect.width >= 44 && rect.height >= 44));
      const labelsFit = tabs.every(tab => {
        const label=tab.querySelector('span'),badge=tab.querySelector('b');
        const box=tab.getBoundingClientRect(),a=label.getBoundingClientRect(),b=badge.getBoundingClientRect();
        return getComputedStyle(label).writingMode==='vertical-rl' && a.left>=box.left && a.right<=box.right && a.top>=box.top && a.bottom<=b.top && b.bottom<=box.bottom && label.scrollHeight<=label.clientHeight+1;
      });
      const panelFits = Boolean(panel && panel.scrollWidth <= panel.clientWidth + 2);
      const alternateTab = tabs.find(tab => !tab.classList.contains('is-active'));
      const alternateStage = alternateTab?.dataset.stage || '';
      /* Selection must remain a direct tap target after the compact mobile
         treatment, not merely look like one. */
      alternateTab?.click();
      const selectionWorks = Boolean(alternateStage && document.querySelector(`#fulfillment-page .fulfillment-process-tab.is-active[data-stage="${alternateStage}"]`) && document.querySelector(`#fulfillment-page .fulfillment-process-panel[data-stage="${alternateStage}"]`));
      return {
        tabCount: tabs.length,
        activeCount: tabs.filter(tab => tab.classList.contains('is-active')).length,
        sideRail,
        maxTabHeight: tabHeights.length ? Math.round(Math.max(...tabHeights)) : 0,
        compactTabs: compactTabs && labelsFit,
        noDesktopFolderTail: activeBefore === 'none' && activeAfter === 'none',
        panelFits,
        selectionWorks,
      };
    })() : null;
    const fulfillmentFlowRail = expectedRoute === 'fulfillment' ? (() => {
      const guide = document.getElementById('fulfillment-flow-guide');
      const rail = document.getElementById('fulfillment-flow-float');
      const host = document.querySelector('.pg-content') || document.scrollingElement;
      const previousTop = host?.scrollTop || 0;
      if (guide && host) host.scrollTop += Math.max(0, guide.getBoundingClientRect().bottom - 6);
      window.syncFulfillmentFlowFloat?.();
      /* Vị trí rail cần đúng ngay cả lúc animation vừa bật; ép trạng thái mở
         ở probe để kiểm tra geometry độc lập với timing của scroll event. */
      const wasVisible = rail?.classList.contains('is-visible');
      const previousTransition = rail?.style.transition || '';
      if (rail) rail.style.transition = 'none';
      rail?.classList.add('is-visible');
      void rail?.offsetWidth;
      const rect = rail?.getBoundingClientRect();
      const buttons = [...(rail?.querySelectorAll('button') || [])].map(button => button.getBoundingClientRect());
      const rotatedLabels = [...(rail?.querySelectorAll('button span') || [])].every(label => getComputedStyle(label).transform !== 'none');
      const style = rail ? getComputedStyle(rail) : null;
      const sideRail = Boolean(rail?.classList.contains('is-visible') && rect && style?.left !== 'auto' && rect.left >= -1 && rect.left < 20 && rect.width <= 52 && buttons.length === 5 && rotatedLabels && buttons.slice(1).every((button, index) => button.top >= buttons[index].bottom - 1));
      if (host) host.scrollTop = previousTop;
      window.syncFulfillmentFlowFloat?.();
      if (wasVisible) rail?.classList.add('is-visible'); else rail?.classList.remove('is-visible');
      if (rail) rail.style.transition = previousTransition;
      return { sideRail, rotatedLabels, rect: rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), right: Math.round(rect.right) } : null, buttonCount: buttons.length, buttonTops: buttons.map(button => Math.round(button.top)) };
    })() : null;
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
      wizard,
      salesMonthFilter,
      fulfillmentProcessTabs,
      fulfillmentFlowRail,
    };
  }, route).catch(error => ({ evaluationError: error.message }));
  if (route === routes[0]) {
    report.themeAudit = await auditQuantityControlThemes(page).catch(error => ({ failures: [`Không kiểm tra theme control: ${error.message}`] }));
    report.moreSheetThemeAudit = await auditMoreSheetThemes(page).catch(error => ({ failures: [`Không kiểm tra được More menu: ${error.message}`] }));
  }
  if (route === 'fulfillment') report.processRailAudit = await auditProcessRail(page);
  const screenshot = join(outputDir, `${stamp}-${route}.png`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  const errors = [
    ...(route === 'fulfillment' ? report.processRailAudit?.failures || [] : []),
    ...(loadError ? [`Không mở được trang: ${loadError}`] : []),
    ...(checks.evaluationError ? [`Không kiểm tra được DOM: ${checks.evaluationError}`] : []),
    ...(checks.actualActive !== `page-${route}` ? [`Sai trang đang mở: ${checks.actualActive || 'không có trang active'}`] : []),
    ...(!checks.activeHasContent ? ['Trang active không có nội dung hiển thị'] : []),
    ...(checks.horizontalOverflow > 2 ? [`Tràn ngang ${checks.horizontalOverflow}px`] : []),
    ...(route === routes[0] ? (report.themeAudit?.failures || []) : []),
    ...(route === routes[0] ? (report.moreSheetThemeAudit?.failures || []) : []),
    ...(route === 'delivery-builder' && (!checks.wizard?.toolbar || /ĐỢT GIAO CỬA HÀNG/i.test(checks.wizard?.heroText || '') || checks.wizard.stageTop > 250) ? [`Đầu trang tạo đợt giao còn chiếm quá nhiều chỗ (${checks.wizard?.stageTop || 0}px)`] : []),
    ...(route === 'sales' && (!checks.salesMonthFilter?.hasAllMonths || checks.salesMonthFilter?.controlHeight < 28 || !checks.salesMonthFilter?.stripWithinPage) ? [`Bộ lọc tháng báo cáo thiếu hoặc lệch layout (${JSON.stringify(checks.salesMonthFilter)})`] : []),
    ...(route === 'fulfillment' && (!checks.fulfillmentProcessTabs?.tabCount || checks.fulfillmentProcessTabs.activeCount !== 1 || !checks.fulfillmentProcessTabs.sideRail || !checks.fulfillmentProcessTabs.compactTabs || !checks.fulfillmentProcessTabs.noDesktopFolderTail || !checks.fulfillmentProcessTabs.panelFits || !checks.fulfillmentProcessTabs.selectionWorks) ? [`Rail công đoạn mobile chưa gọn hoặc còn tràn (${JSON.stringify(checks.fulfillmentProcessTabs)})`] : []),
    ...(route === 'fulfillment' && !checks.fulfillmentFlowRail?.sideRail ? [`Thanh chọn bước nổi chưa bám dọc cạnh màn hình (${JSON.stringify(checks.fulfillmentFlowRail)})`] : []),
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
if (report.summary.failed) process.exitCode = 1;
