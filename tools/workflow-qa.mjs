/**
 * Production-flow regression check for Plate Studio.
 *
 * It runs only inside a fresh, non-persistent browser context. The fixture is
 * injected after boot and never connects to or writes the workshop workspace.
 * Covered path: handover → part QC → assembly → partial accepted output →
 * reprint queue → delivery-ready quantity, plus the external-batch quantity
 * rule that previously caused completed quantities to be overstated.
 *
 * Run: npm run qa:workflow
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const appFile = join(root, 'plate-studio.html');
const outputDir = join(root, 'qa-results', 'workflow');
const executablePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(path => existsSync(path));

if (!existsSync(appFile)) throw new Error(`Không tìm thấy ứng dụng: ${appFile}`);
if (!executablePath) throw new Error('Không tìm thấy Chrome hoặc Edge. Đặt CHROME_PATH rồi chạy lại.');
mkdirSync(outputDir, { recursive: true });

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`); });

await page.goto(pathToFileURL(appFile).href, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForFunction(() => typeof window.goPage === 'function', { timeout: 8000 });
const results = await page.evaluate(async () => {
  const rows = [];
  const check = (name, passed, detail = '') => rows.push({ name, passed: Boolean(passed), detail });
  const stamp = new Date().toISOString();
  /* Keep the colour-history regression deterministic even in a fresh browser
     profile where the workshop has not created a filament yet. */
  let qaFilament = fils[0];
  if (!qaFilament) {
    qaFilament = { id: 'qa-filament', brand: 'QA', name: 'Xanh kiểm thử', hex: '#2563eb' };
    fils = [...fils, qaFilament];
  }
  const style = document.createElement('style');
  style.textContent = '#auth-ov{display:none!important;pointer-events:none!important}';
  document.head.append(style);

  /* Fixture only exists in this ephemeral Playwright tab. */
  models = [{
    id: 'qa-model', name: 'QA · Mô hình kiểm thử', cats: ['QA'], images: ['data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" rx="12" fill="%232563eb"/%3E%3C/svg%3E'], variants: [{ id: 'qa-size-10', name: 'Size 10cm' }],
    parts: [
      { id: 'qa-body', name: 'Thân', qtyPerModel: 1, filamentIds: [] },
      { id: 'qa-base', name: 'Đế', qtyPerModel: 1, filamentIds: [] },
      { id: 'qa-locked', name: 'Chi tiết có màu quy định', qtyPerModel: 1, filamentIds: [fils[0]?.id].filter(Boolean) },
    ],
  }];
  orders = [{
    id: 'qa-order', note: 'QA · Đơn kiểm thử', status: 'processing', createdAt: stamp,
    items: [{ id: 'qa-item', modelId: 'qa-model', modelName: 'QA · Mô hình kiểm thử', variantId: 'qa-size-10', variantName: 'Size 10cm', qty: 4 }],
    assembly: { status: 'in_progress', items: {}, handovers: { 'qa-item': { handedAt: stamp, handedBy: 'QA', qcStatus: 'pending', batchReportId: 'qa-evidence-legacy' } }, },
  }];
  pitems = [
    { id: 'qa-pitem-body', orderId: 'qa-order', orderItemId: 'qa-item', modelId: 'qa-model', partId: 'qa-body', partName: 'Thân', qty: 4, qtyDone: 4, qtyRejected: 0 },
    { id: 'qa-pitem-base', orderId: 'qa-order', orderItemId: 'qa-item', modelId: 'qa-model', partId: 'qa-base', partName: 'Đế', qty: 4, qtyDone: 4, qtyRejected: 0 },
  ];
  plates = []; batchReports = [{
    id: 'qa-evidence-report', status: 'done', createdAt: stamp, completedAt: stamp, completedBy: 'QA', filamentId: qaFilament.id,
    image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="90"%3E%3Crect width="120" height="90" fill="%232563eb"/%3E%3C/svg%3E',
    appliedItems: [{ pitemId: 'qa-pitem-body', qty: 4 }], manualItems: [],
  }, {
    id: 'qa-evidence-legacy', status: 'done', createdAt: stamp, completedAt: stamp, completedBy: 'QA', filamentId: qaFilament.id,
    image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="90"%3E%3Crect width="120" height="90" fill="%2394a3b8"/%3E%3C/svg%3E',
    appliedItems: [], manualItems: [],
  }]; projects = [];
  operations = { qualityIssues: [], deliveries: [], deliveryBatches: [], events: [], externalWorkshopHandovers: {} };
  normalizeOperations();
  /* Checkbox trong biểu mẫu biến thể dùng chung primitive .field. Nó phải giữ
     kích thước control thay vì bị rule input 100% kéo ngang cả hàng trên mobile. */
  openEditModel('qa-model');
  openVariantEditor('qa-size-10');
  const variantPartChecks = [...document.querySelectorAll('#dlg-variant-editor input[id^="mv-part-enabled-"]')];
  const variantPartCheckRects = variantPartChecks.map(input => input.getBoundingClientRect());
  const firstVariantPartCheck = variantPartChecks[0];
  const checkedBeforeToggle = Boolean(firstVariantPartCheck?.checked);
  firstVariantPartCheck?.click();
  check('Mobile: checkbox chọn part của biến thể là control gọn, không kéo ngang hàng', Boolean(variantPartChecks.length >= 2 && variantPartCheckRects.every(rect => rect.width >= 16 && rect.width <= 28 && rect.height >= 16 && rect.height <= 28) && firstVariantPartCheck?.checked !== checkedBeforeToggle), variantPartCheckRects.map(rect => `${Math.round(rect.width)}×${Math.round(rect.height)}`).join(' · '));
  closeVariantEditor();
  closeDialog('dlg-model');
  goPage('batches', { historyMode: 'none' });
  renderBatchReportPage();
  const batchPreviewImage = document.querySelector('.batch-report-media > img');
  const batchPreviewStyle = batchPreviewImage ? getComputedStyle(batchPreviewImage) : null;
  check('Ảnh thẻ báo cáo mẻ dùng crop tập trung vào nội dung thay vì kéo lệch tự do', Boolean(batchPreviewStyle && batchPreviewStyle.objectFit === 'cover'), batchPreviewStyle ? `${batchPreviewStyle.objectFit} · ${batchPreviewStyle.objectPosition}` : 'không có ảnh');
  const focusHost = document.createElement('div');
  focusHost.className = 'batch-report-media'; focusHost.style.cssText = 'position:fixed;left:-1000px;top:0;width:240px;height:180px';
  const focusImage = document.createElement('img');
  focusImage.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="200"%3E%3Crect width="400" height="200" fill="%23111111"/%3E%3Crect x="22" y="35" width="115" height="130" fill="white"/%3E%3C/svg%3E';
  focusHost.append(focusImage); document.body.append(focusHost); await focusImage.decode();
  applyBatchReportSmartFocus(focusImage);
  check('Crop ảnh mẻ tự dồn chủ thể lệch tâm về giữa khung', Boolean(focusImage.style.objectPosition && focusImage.style.objectPosition !== '50% 50%'), focusImage.style.objectPosition || 'không có focus');
  focusHost.remove();
  goPage('fulfillment', { historyMode: 'none' });

  const fulfillmentHeader = document.querySelector('#page-fulfillment .fulfillment-command-bar');
  check('Thanh tìm kiếm gia công tách khỏi cụm giao hàng', Boolean(document.querySelector('.fulfillment-search-row .page-smart-search')) && !document.querySelector('.fulfillment-command'));
  const fulfillmentHeaderActions = ['refreshFulfillmentPage()', 'openReceivingHub()', 'openDeliveryBatchBuilder()'];
  check('Thao tác giao hàng nằm trong cụm lệnh riêng', fulfillmentHeaderActions.every(action => Boolean(fulfillmentHeader?.querySelector(`button[onclick="${action}"]`))));
  const fulfillmentCommandActions = fulfillmentHeader?.querySelector('.fulfillment-command-actions');
  const createDelivery = fulfillmentHeader?.querySelector('.fulfillment-create-delivery');
  check('Nút tạo đợt giao là hành động chính của cụm lệnh', Boolean(createDelivery && fulfillmentCommandActions?.contains(createDelivery)), createDelivery?.textContent.trim() || 'thiếu nút');
  check('Tiêu đề trang và cụm thao tác không lặp tên luồng', !/hoàn thiện\s*&\s*giao hàng/i.test(fulfillmentHeader?.querySelector('.fulfillment-command-title')?.textContent || ''), fulfillmentHeader?.querySelector('.fulfillment-command-title')?.textContent.trim() || 'thiếu tiêu đề');
  const refreshDelivery = fulfillmentHeader?.querySelector('button[onclick="refreshFulfillmentPage()"]');
  const receiveDelivery = fulfillmentHeader?.querySelector('button[onclick="openReceivingHub()"]');
  const createRect = createDelivery?.getBoundingClientRect(), refreshRect = refreshDelivery?.getBoundingClientRect(), receiveRect = receiveDelivery?.getBoundingClientRect();
  check('Mobile đặt tạo đợt giao lên hàng chính riêng', Boolean(createRect && refreshRect && receiveRect && createRect.top < refreshRect.top && createRect.bottom <= refreshRect.top + 1 && Math.abs(refreshRect.top - receiveRect.top) < 2), createRect && refreshRect ? `${Math.round(createRect.top)} → ${Math.round(refreshRect.top)}` : 'thiếu nút');
  const contextWorkshopCard = document.querySelector('#fulfillment-workshop-zone .workshop-item');
  let contextPrevented = false;
  openAppContextMenu({ target: contextWorkshopCard, clientX: 120, clientY: 120, preventDefault(){contextPrevented=true;} });
  const contextMenu = document.getElementById('app-context-menu');
  check('Chuột phải trên thẻ gia công mở menu theo ngữ cảnh', Boolean(contextPrevented && contextMenu?.classList.contains('show') && /Model gia công/.test(contextMenu.textContent)), contextMenu?.textContent.trim() || 'không mở menu');
  check('Menu thẻ gia công chỉ hiện thao tác của bước hiện tại', !/Tạo đợt giao|Chụp mẻ in/.test(contextMenu?.textContent || ''), contextMenu?.textContent.trim() || 'không mở menu');
  check('Menu chuột phải luôn có nhóm chức năng hệ thống độc lập với ngữ cảnh', Boolean(/Hệ thống/.test(contextMenu?.textContent || '') && /Tìm nhanh/.test(contextMenu?.textContent || '') && /Hướng dẫn/.test(contextMenu?.textContent || '') && /Giao diện/.test(contextMenu?.textContent || '')), contextMenu?.textContent.trim() || 'thiếu nhóm hệ thống');
  const quickStatusTrigger = contextMenu?.querySelector('.app-context-menu-submenu-trigger');
  quickStatusTrigger?.focus();
  const quickStatusPanel = contextMenu?.querySelector('.app-context-submenu-panel');
  check('Menu thẻ gia công có menu con cập nhật trạng thái nhanh', Boolean(quickStatusTrigger && /Cập nhật trạng thái nhanh/.test(quickStatusTrigger.textContent)), quickStatusTrigger?.textContent.trim() || 'thiếu menu con');
  check('Focus hoặc rê chuột vào trạng thái nhanh mở các lựa chọn hợp lệ', Boolean(quickStatusPanel && getComputedStyle(quickStatusPanel).display !== 'none' && /QC|Gia công|Chờ vật tư/.test(quickStatusPanel.textContent)), quickStatusPanel?.textContent.trim() || 'không hiện lựa chọn');
  closeAppContextMenu();
  const bulkItem = { ...orders[0].items[0], id: 'qa-bulk-item' };
  orders.push({ ...orders[0], id: 'qa-bulk-order', note: 'QA · Hàng loạt', items: [bulkItem], assembly: { status: 'in_progress', items: {}, handovers: {} } });
  pitems.push(
    { id: 'qa-bulk-body', orderId: 'qa-bulk-order', orderItemId: 'qa-bulk-item', modelId: 'qa-model', partId: 'qa-body', partName: 'Thân', qty: 4, qtyDone: 4, qtyRejected: 0 },
    { id: 'qa-bulk-base', orderId: 'qa-bulk-order', orderItemId: 'qa-bulk-item', modelId: 'qa-model', partId: 'qa-base', partName: 'Đế', qty: 4, qtyDone: 4, qtyRejected: 0 },
    { id: 'qa-bulk-locked', orderId: 'qa-bulk-order', orderItemId: 'qa-bulk-item', modelId: 'qa-model', partId: 'qa-locked', partName: 'Chi tiết có màu quy định', qty: 4, qtyDone: 4, qtyRejected: 0 }
  );
  normalizeOperations();
  renderFulfillmentPage();
  const bulkModeButton = document.querySelector('#fulfillment-workshop-zone .fulfillment-bulk-tools button[onclick="toggleFulfillmentBulkMode()"]');
  check('Có nút mở thao tác hàng loạt khi có model đủ điều kiện', Boolean(bulkModeButton), bulkModeButton?.textContent.trim() || 'thiếu nút');
  bulkModeButton?.click();
  const bulkChoice = document.querySelector('#fulfillment-workshop-zone .workshop-bulk-select input');
  check('Chế độ hàng loạt chỉ hiện lựa chọn trên model được phép giao xưởng', Boolean(bulkChoice) && !document.querySelector('.workshop-item.is-handed .workshop-bulk-select'), bulkChoice ? 'có lựa chọn hợp lệ' : 'thiếu lựa chọn');
  if(bulkChoice){bulkChoice.checked=true;bulkChoice.dispatchEvent(new Event('change',{bubbles:true}));}
  check('Chọn model hàng loạt hiển thị hành động giao xưởng theo số đã chọn', /Giao xưởng \(1\)/.test(document.querySelector('.fulfillment-bulk-tools')?.textContent || ''), document.querySelector('.fulfillment-bulk-tools')?.textContent.trim() || 'thiếu cụm lệnh');
  if(fulfillmentBulkMode)toggleFulfillmentBulkMode();
  orders=orders.filter(order=>order.id!=='qa-bulk-order');
  pitems=pitems.filter(item=>item.orderId!=='qa-bulk-order');
  normalizeOperations();
  renderFulfillmentPage();
  const fulfillmentRendererSource = renderFulfillmentPage.toString();
  const processTabs = [...document.querySelectorAll('.fulfillment-process-tab[role="tab"]')];
  const processTabIds = processTabs.map(tab => tab.dataset.stage);
  const expectedProcessTabs = ['reprint','missing-parts','handover','part-qc','ready-assembly','assembling','waiting','ready-delivery'];
  check('Gia công chia mọi trạng thái thành tab thư mục theo đúng luồng', expectedProcessTabs.every((id,index) => processTabIds[index] === id), processTabIds.join(' → '));
  const folderTabStyle = processTabs[0] ? getComputedStyle(processTabs[0], '::before') : null;
  check('Tab quy trình dùng primitive thư mục có trạng thái chọn rõ ràng', Boolean(document.querySelector('.fulfillment-process-tablist[role="tablist"]')) && processTabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length === 1 && fulfillmentProcessTabsHtml.toString().includes('fulfillment-process-panel') && folderTabStyle?.content !== 'none' && folderTabStyle?.height !== 'auto', `${processTabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length} tab đang chọn · tai ${folderTabStyle?.height || 'thiếu'}`);
  const processTabForQc = document.querySelector('.fulfillment-process-tab[data-stage="part-qc"]');
  processTabForQc?.click();
  check('Chọn tab chỉ mở đúng một trạng thái và giữ mốc điều hướng', document.querySelector('.fulfillment-process-tab[data-stage="part-qc"]')?.getAttribute('aria-selected') === 'true' && document.getElementById('fulfillment-stage-part-qc')?.classList.contains('fulfillment-process-panel') && document.querySelectorAll('.fulfillment-process-panel').length === 1, document.querySelector('.fulfillment-process-panel')?.id || 'thiếu panel');
  renderFulfillmentPage();
  const guide = document.getElementById('fulfillment-flow-guide');
  const flowFloat = document.getElementById('fulfillment-flow-float');
  const searchRow = document.querySelector('.fulfillment-search-row');
  const workshopZone = document.getElementById('fulfillment-workshop-zone');
  const fulfillmentScrollHost = document.querySelector('.pg-content') || document.scrollingElement;
  const follows = Node.DOCUMENT_POSITION_FOLLOWING;
  check('Thanh luồng xử lý nằm đầu trang trước tìm kiếm và các khối nghiệp vụ', Boolean(guide?.closest('.fulfillment-page-intro') && searchRow && workshopZone && (guide.compareDocumentPosition(searchRow) & follows) && (guide.compareDocumentPosition(workshopZone) & follows)), guide?.parentElement?.className || 'thiếu thanh');
  /* Page layout is a shared primitive. Only named business blocks may be
     customized; fixed guides, floating navigation and anonymous wrappers must
     never leak into the user's list, including from a stale saved preference. */
  const layoutItems = pageLayoutItems('fulfillment');
  const layoutLabels = layoutItems.map(item => item.label);
  const layoutSlots = layoutItems.map(item => item.slot);
  check('Bố cục chỉ hiện các khối nghiệp vụ có tên rõ ràng', layoutLabels.includes('Gia công') && layoutLabels.includes('Cần xử lý') && layoutLabels.every(label => !/^(Khối\s*\d+|.*(?:fulfillment|flow|zone|guide).*)$/i.test(label)), layoutLabels.join(' · '));
  check('Bố cục không nhận wrapper hoặc điều hướng nổi làm khối', !layoutItems.some(item => item.el.matches('.fulfillment-page-intro,#fulfillment-flow-guide,#fulfillment-flow-float,nav')), layoutItems.map(item => item.el.id || item.el.className).join(' · '));
  const layoutOwner = pageLayoutOwnerKey();
  const layoutPrefs = allPageLayoutPrefs();
  layoutPrefs[layoutOwner] = { ...(layoutPrefs[layoutOwner] || {}), fulfillment: { order: ['fulfillment-flow-guide-0', 'fulfillment-workshop-zone-0', ...layoutSlots], hidden: ['fulfillment-flow-float-0', 'fulfillment-flow-guide-0'] } };
  localStorage.setItem('ps_page_layout_prefs', JSON.stringify(layoutPrefs));
  applyPageLayout('fulfillment');
  const cleanedLayoutPrefs = pageLayoutPrefs('fulfillment');
  check('Cấu hình bố cục cũ tự loại ID kỹ thuật đã lưu', [...cleanedLayoutPrefs.order, ...cleanedLayoutPrefs.hidden].every(slot => !/(flow-guide|flow-float|workshop-zone)/.test(slot)), JSON.stringify(cleanedLayoutPrefs));
  check('Khối cố định vẫn hiển thị sau khi dọn cấu hình cũ', !document.querySelector('.fulfillment-page-intro')?.hidden && !document.getElementById('fulfillment-flow-float')?.hidden);
  const layoutSandbox = document.createElement('main');
  layoutSandbox.id = 'page-layout-qa';
  layoutSandbox.innerHTML = '<section data-layout-internal id="internal-flow"><h2>Luồng nội bộ</h2></section><nav id="floating-nav" aria-label="Đi nhanh">Đi nhanh</nav><section id="unnamed-technical"></section><section data-layout-block="business-card" data-layout-label="Khối nghiệp vụ"><h2>Không dùng tên này</h2></section><section><h2>Tiêu đề nghiệp vụ</h2></section>';
  document.body.append(layoutSandbox);
  PAGE_LAYOUT_ROOTS['layout-qa'] = '#page-layout-qa';
  const sandboxLabels = pageLayoutItems('layout-qa').map(item => item.label);
  check('Primitive Bố cục loại vùng kỹ thuật trên mọi trang', sandboxLabels.length === 2 && sandboxLabels.includes('Khối nghiệp vụ') && sandboxLabels.includes('Tiêu đề nghiệp vụ'), sandboxLabels.join(' · '));
  delete PAGE_LAYOUT_ROOTS['layout-qa'];
  layoutSandbox.remove();
  check('Thanh quy trình nổi có đủ 5 bước', Boolean(flowFloat && flowFloat.querySelectorAll('button[data-flow]').length === 5));
  const flowStyle = flowFloat ? getComputedStyle(flowFloat) : null;
  const scrollTopStyle = getComputedStyle(document.getElementById('global-scroll-top'));
  check('Thanh quy trình nổi ở phía trên trên mobile', Boolean(flowStyle && Number.parseFloat(flowStyle.top) <= 24), flowStyle ? `top ${flowStyle.top}` : 'không có thanh');
  check('Thanh quy trình nổi dàn ngang ở giữa', Boolean(flowStyle && flowStyle.flexDirection === 'row' && flowStyle.left !== 'auto'), flowStyle ? `${flowStyle.flexDirection} · trái ${flowStyle.left}` : 'không có thanh');
  check('Nút lên đầu trang chừa khoảng với điều hướng', Number.parseFloat(scrollTopStyle.bottom) >= 100, scrollTopStyle.bottom);
  /* jsdom-like file layouts may not allocate a scroll range in headless mode;
     simulate the post-scroll guide position and test the same visibility rule. */
  const originalGuideRect = guide?.getBoundingClientRect.bind(guide);
  if (guide) guide.getBoundingClientRect = () => ({ ...originalGuideRect(), bottom: -1 });
  syncFulfillmentFlowFloat();
  check('Cuộn qua hướng dẫn thì hiện thanh quy trình nổi', flowFloat?.classList.contains('is-visible'));
  if (guide) guide.getBoundingClientRect = originalGuideRect;
  /* Every navigation button must resolve to one precise business anchor, never
     the generic workshop wrapper. Add only missing anchors to this isolated
     fixture so the mapping is checked even when that queue happens to be empty. */
  const temporaryFlowTargets = [];
  const expectedFlowTargets = { print: 'fulfillment-missing-parts', workshop: 'fulfillment-stage-handover', qc: 'fulfillment-stage-part-qc', delivery: 'fulfillment-ready-delivery', receive: 'fulfillment-receipts' };
  Object.values(expectedFlowTargets).forEach(id => {
    if (document.getElementById(id)) return;
    const anchor = document.createElement('div');
    anchor.id = id; anchor.className = 'fulfillment-workshop-stage';
    document.getElementById('fulfillment-workshop-zone')?.append(anchor);
    temporaryFlowTargets.push(anchor);
  });
  const flowResolvesTo = (flow, id) => { const target = fulfillmentFlowTarget(flow), anchor = document.getElementById(id); return Boolean(target && anchor && (target === anchor || target.contains(anchor))); };
  check('Cả 5 nút điều hướng dùng mốc nghiệp vụ riêng', Object.entries(expectedFlowTargets).every(([flow, id]) => flowResolvesTo(flow, id)), Object.entries(expectedFlowTargets).map(([flow, id]) => `${flow}:${flowResolvesTo(flow, id) ? id : 'trống'}`).join(' · '));
  check('Điều hướng không dùng lại vùng Gia công chung làm fallback', !Object.values(FULFILLMENT_FLOW_TARGETS).flat().some(id => /workshop-zone|workshop-flow/.test(id)), JSON.stringify(FULFILLMENT_FLOW_TARGETS));
  const scrollTarget = fulfillmentFlowTarget('qc');
  const originalHostRect = fulfillmentScrollHost.getBoundingClientRect?.bind(fulfillmentScrollHost);
  const originalTargetRect = scrollTarget?.getBoundingClientRect.bind(scrollTarget);
  const originalFloatingRect = flowFloat?.getBoundingClientRect.bind(flowFloat);
  const originalScrollTo = fulfillmentScrollHost.scrollTo;
  const originalScrollTop = fulfillmentScrollHost.scrollTop;
  const originalScrollHeight = Object.getOwnPropertyDescriptor(fulfillmentScrollHost, 'scrollHeight');
  const originalClientHeight = Object.getOwnPropertyDescriptor(fulfillmentScrollHost, 'clientHeight');
  let requestedFlowScroll = null;
  Object.defineProperty(fulfillmentScrollHost, 'scrollTop', { configurable: true, writable: true, value: 180 });
  Object.defineProperty(fulfillmentScrollHost, 'scrollHeight', { configurable: true, value: 5000 });
  Object.defineProperty(fulfillmentScrollHost, 'clientHeight', { configurable: true, value: 800 });
  fulfillmentScrollHost.getBoundingClientRect = () => ({ top: 20, bottom: 820, left: 0, right: 390, width: 390, height: 800 });
  if (scrollTarget) scrollTarget.getBoundingClientRect = () => ({ top: 520, bottom: 590, left: 0, right: 360, width: 360, height: 70 });
  if (flowFloat) { flowFloat.classList.add('is-visible'); flowFloat.getBoundingClientRect = () => ({ top: 18, bottom: 92, left: 20, right: 370, width: 350, height: 74 }); }
  fulfillmentScrollHost.scrollTo = options => { requestedFlowScroll = options; };
  scrollFulfillmentToTarget(scrollTarget, { behavior: 'auto' });
  check('Thanh điều hướng cuộn trong đúng container và chừa thanh nổi', Boolean(requestedFlowScroll && requestedFlowScroll.behavior === 'auto' && Math.round(requestedFlowScroll.top) === 594), requestedFlowScroll ? JSON.stringify(requestedFlowScroll) : 'không gọi scroll container');
  if (originalHostRect) fulfillmentScrollHost.getBoundingClientRect = originalHostRect;
  if (scrollTarget && originalTargetRect) scrollTarget.getBoundingClientRect = originalTargetRect;
  if (flowFloat && originalFloatingRect) flowFloat.getBoundingClientRect = originalFloatingRect;
  fulfillmentScrollHost.scrollTo = originalScrollTo;
  Object.defineProperty(fulfillmentScrollHost, 'scrollTop', { configurable: true, writable: true, value: originalScrollTop });
  if (originalScrollHeight) Object.defineProperty(fulfillmentScrollHost, 'scrollHeight', originalScrollHeight); else delete fulfillmentScrollHost.scrollHeight;
  if (originalClientHeight) Object.defineProperty(fulfillmentScrollHost, 'clientHeight', originalClientHeight); else delete fulfillmentScrollHost.clientHeight;
  temporaryFlowTargets.forEach(anchor => anchor.remove());

  const variantWorkshopCard = fulfillmentWorkshopCard({
    source: 'external', externalKey: 'qa-variant-card', o: null,
    it: { id: 'qa-variant-card', modelId: 'qa-model', modelName: 'QA · Mô hình kiểm thử', variantId: 'qa-size-10', variantName: 'Size 10cm', qty: 4 },
    m: { id: 'qa-model', name: 'QA · Mô hình kiểm thử', images: [], variants: [{ id: 'qa-size-10', name: 'Size 10cm' }], parts: [] },
    parts: [], completedParts: 0, ready: false, handover: null, handed: false, reports: [], reportCount: 1,
  });
  check('Thẻ gia công luôn hiện biến thể khi có', variantWorkshopCard.includes('workshop-item-variant') && variantWorkshopCard.includes('Size 10cm'), variantWorkshopCard.includes('Size 10cm') ? 'Size 10cm' : 'thiếu biến thể');

  let row = fulfillmentWorkshopRows().find(item => item.o?.id === 'qa-order');
  check('Bàn giao đi vào chờ QC', workshopAssemblyStage(row) === 'part_qc', workshopAssemblyStage(row));
  check('Nút QC có nhận diện công đoạn riêng', Boolean(document.querySelector('.workshop-item-actions [data-workshop-action="qc"]')));
  openWorkshopEvidence(workshopWaitKey(row));
  const evidenceCards = [...document.querySelectorAll('.workshop-evidence-card')];
  const evidenceDeclaration = document.querySelector('.workshop-evidence-card .workshop-evidence-declaration');
  const evidenceSummary = document.querySelector('.workshop-evidence-card .workshop-evidence-copy > b');
  check('Ảnh minh chứng hiện part, số lượng và màu đã khai báo', Boolean(evidenceDeclaration && evidenceSummary) && evidenceDeclaration.textContent.includes('Thân ×4') && evidenceDeclaration.textContent.includes(qaFilament.name) && evidenceSummary.textContent.includes('4 cái'), `${evidenceSummary?.textContent.trim() || 'thiếu tóm tắt'} · ${evidenceDeclaration?.textContent.trim() || 'thiếu khai báo'}`);
  check('Mọi ảnh minh chứng đều dùng thẻ khai báo, kể cả ảnh cũ thiếu dữ liệu', evidenceCards.length === 2 && evidenceCards.every(card => card.dataset.evidenceLayout === 'declaration-v2' && card.querySelector('.workshop-evidence-copy') && card.querySelector('.workshop-evidence-declaration')) && evidenceCards.some(card => card.textContent.includes('Chưa khai báo part cho model này')), `${evidenceCards.length} ảnh · ${evidenceCards.map(card => card.querySelector('.workshop-evidence-copy') ? 'có nội dung' : 'thiếu nội dung').join(', ')}`);
  closeDialog('dlg-mv');

  /* Mở một ảnh từ thư viện của Model ngoài đơn, sửa rồi lưu không được làm
     thư viện rơi về chỉ mẻ vừa sửa khi cache vận hành đang tải lại. */
  const evidenceImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="90"%3E%3Crect width="120" height="90" fill="%232563eb"/%3E%3C/svg%3E';
  ['a', 'b', 'c'].forEach((suffix, index) => batchReports.push({
    id: `qa-external-evidence-${suffix}`, status: 'done', external: true, externalOrigin: true,
    createdAt: new Date(Date.now() + index).toISOString(), completedAt: stamp, completedBy: 'QA', image: evidenceImage,
    manualItems: [{ modelId: 'qa-model', modelName: 'QA · Mô hình kiểm thử', variantId: 'qa-size-10', variantName: 'Size 10cm', partId: 'qa-body', partName: 'Thân', filamentId: qaFilament.id, qty: 1 }], appliedItems: [],
  }));
  const externalEvidenceRow = fulfillmentWorkshopRows().find(item => item.source === 'external' && item.externalKey === 'qa-model::qa-size-10');
  const externalEvidenceKey = workshopWaitKey(externalEvidenceRow);
  openWorkshopEvidence(externalEvidenceKey);
  const evidenceBeforeEdit = document.querySelectorAll('.workshop-evidence-card').length;
  openWorkshopEvidenceReport(externalEvidenceKey, 'qa-external-evidence-a');
  editCompletedManualBatchReport('qa-external-evidence-a');
  brManualItems[0].qty = 2;
  saveBatchManualReport();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const evidenceAfterEdit = document.querySelectorAll('.workshop-evidence-card').length;
  check('Sửa một ảnh rồi quay lại vẫn giữ toàn bộ ảnh minh chứng của Model', evidenceBeforeEdit === 3 && evidenceAfterEdit === 3 && document.querySelector('.workshop-evidence-head .dlg-title')?.textContent.includes('QA · Mô hình kiểm thử'), `${evidenceBeforeEdit} trước sửa · ${evidenceAfterEdit} sau sửa`);
  closeDialog('dlg-mv');

  /* QC is a repeat action on mobile. Rendering the destination group must not
     steal the operator away from the remaining cards in the current group. */
  fulfillmentScrollHost.scrollTop = 180;
  const scrollBeforeQc = fulfillmentScrollHost.scrollTop;
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  let requestedAutoFocus = false;
  Element.prototype.scrollIntoView = function(...args) {
    requestedAutoFocus = true;
    return originalScrollIntoView?.apply(this, args);
  };
  openPartQcDialog('qa-order', 'qa-item');
  document.getElementById('part-qc-by').value = 'QA';
  savePartQcAccepted('qa-order', 'qa-item');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  Element.prototype.scrollIntoView = originalScrollIntoView;
  check('QC part giữ nguyên vị trí thao tác', !requestedAutoFocus && Math.abs(fulfillmentScrollHost.scrollTop - scrollBeforeQc) <= 2, `trước ${scrollBeforeQc}px · sau ${fulfillmentScrollHost.scrollTop}px · tự focus ${requestedAutoFocus}`);
  row = fulfillmentWorkshopRows().find(item => item.o?.id === 'qa-order');
  check('QC đủ part chuyển sang sẵn gia công', workshopAssemblyStage(row) === 'ready', workshopAssemblyStage(row));
  check('Nút gia công có nhận diện công đoạn riêng', Boolean(document.querySelector('.workshop-item-actions [data-workshop-action="assembly"]')));

  startWorkshopAssembly('qa-order', 'qa-item');
  row = fulfillmentWorkshopRows().find(item => item.o?.id === 'qa-order');
  check('Bắt đầu gia công giữ đúng trạng thái', workshopAssemblyStage(row) === 'in_progress', workshopAssemblyStage(row));
  check('Nút hoàn tất có nhận diện công đoạn riêng', Boolean(document.querySelector('.workshop-item-actions [data-workshop-action="complete"]')));
  const workshopActionBar = [...document.querySelectorAll('.workshop-item:not(.workshop-item-completed) .workshop-item-actions')]
    .find(bar => Boolean(bar.querySelector('button[data-workshop-action="complete"]'))) || null;
  const workshopActionButtons = workshopActionBar ? [...workshopActionBar.querySelectorAll('button')] : [];
  const workshopPrimaryAction = workshopActionButtons.at(-1), workshopActionBarRect = workshopActionBar?.getBoundingClientRect();
  const workshopSecondaryActions = workshopActionButtons.slice(0, -1);
  const actionRows = new Map();
  workshopActionButtons.forEach(button => {
    const top = Math.round(button.getBoundingClientRect().top);
    actionRows.set(top, (actionRows.get(top) || 0) + 1);
  });
  check('Thao tác gia công tối đa hai nút mỗi hàng, không tràn thẻ', Boolean(workshopActionBarRect) && [...actionRows.values()].every(count => count <= 2) && workshopActionButtons.every(button => {
    const rect = button.getBoundingClientRect();
    return rect.left >= workshopActionBarRect.left - 1 && rect.right <= workshopActionBarRect.right + 1;
  }), [...actionRows.values()].join(' / ') || 'thiếu nút');
  check('Mobile chia thao tác gia công theo hai cột dễ bấm', Boolean(workshopPrimaryAction && workshopActionBarRect) && workshopActionButtons.every(button => button.getBoundingClientRect().width >= 72 && button.getBoundingClientRect().height >= 32) && [...actionRows.values()].every(count => count === 2), workshopActionButtons.map(button => `${button.textContent.trim()} ${Math.round(button.getBoundingClientRect().width)}×${Math.round(button.getBoundingClientRect().height)}`).join(' · ') || 'thiếu nút');

  openAssemblyFinish('qa-order', 'qa-item');
  document.getElementById('assembly-finish-qty').value = '2';
  document.getElementById('assembly-finish-reprint').checked = true;
  document.getElementById('assembly-finish-by').value = 'QA';
  saveAssemblyFinish('qa-order', 'qa-item', false);
  row = fulfillmentWorkshopRows().find(item => item.o?.id === 'qa-order');
  const reprintNeeds = getQcReprintNeeds();
  const qaNeed = reprintNeeds.find(item => item.model.id === 'qa-model');
  selectFulfillmentProcessTab('ready-delivery');
  const readyShelf = document.querySelector('.fulfillment-ready-shelf');
  check('Chỉ 2 sản phẩm đạt được mở giao', workshopReadyDeliveryQty(row) === 2, workshopReadyDeliveryQty(row));
  check('Kệ thành phẩm sẵn giao có vùng cuộn riêng', Boolean(readyShelf && getComputedStyle(readyShelf).overflowY === 'auto' && readyShelf.getBoundingClientRect().height <= innerHeight * .4 + 2), readyShelf ? `${Math.round(readyShelf.getBoundingClientRect().height)}px` : 'không có kệ');
  check('2 sản phẩm lỗi được trả về hàng in lại', workshopReprintQty(row) === 2, workshopReprintQty(row));
  check('Part còn lại không bị xoá toàn bộ', pitems.every(item => Number(item.qtyDone) === 2), pitems.map(item => item.qtyDone).join(', '));
  check('Trang Cần in lại nhóm đúng 2 sản phẩm QC lỗi', qaNeed?.productQty === 2, qaNeed?.productQty ?? 'không có nhóm');
  check('Nhóm QC hiển thị riêng trong trang tồn', inventoryQcReprintPanel(reprintNeeds).includes('QC → CẦN IN LẠI'));
  check('Luồng giao chỉ lấy 2 sản phẩm đã đạt', deliveryReadyLines('qa-order')[0]?.available === 2, deliveryReadyLines('qa-order')[0]?.available ?? 'không có dòng');

  /* Cập nhật nhanh phải có xác nhận trách nhiệm, đổi trạng thái tại chỗ và
     lưu vết người thao tác; không cần cuộn sang nhóm kế tiếp để tìm lại thẻ. */
  const quickRowKey = encodeURIComponent('order:qa-order:qa-item');
  selectFulfillmentProcessTab('ready-delivery');
  toggleWorkshopQuickStatus(quickRowKey);
  check('Cập nhật nhanh bung lựa chọn ngay trong thẻ', Boolean(document.querySelector('.workshop-quick-status-panel')) && !document.querySelector('.workshop-quick-status-dialog'), document.querySelector('.workshop-quick-status-panel') ? 'nội tuyến' : 'thiếu dãy chọn');
  setWorkshopQuickStatusConfirm(quickRowKey, true);
  const quickAssemblyBefore = JSON.parse(JSON.stringify(row.o.assembly));
  const quickCompleteButton = document.querySelector('.workshop-quick-status-option[onclick*="completed"]');
  check('Hoàn tất nhanh mở khi đã có bộ part hoàn chỉnh', !quickCompleteButton?.disabled && document.querySelector('.workshop-quick-status-hint')?.textContent.includes('hoàn tất trước đúng số này'), document.querySelector('.workshop-quick-status-hint')?.textContent || 'thiếu hướng dẫn số bộ');
  setWorkshopQuickStatusInline(quickRowKey, 'completed');
  row = fulfillmentWorkshopRows().find(item => item.o?.id === 'qa-order');
  check('Hoàn tất nhanh chốt đúng số bộ đã đủ, không tự bù part thiếu', workshopAssemblyStage(row) === 'completed' && workshopReadyDeliveryQty(row) === 2 && assembledQty(row.o,row.it.id) === 2 && row.handover?.qcAcceptedQty === 2 && operations.auditLog?.some(entry=>entry.metadata?.quickStatus&&entry.metadata?.to==='completed'), `${workshopReadyDeliveryQty(row)} sẵn giao · ${assembledQty(row.o,row.it.id)} đã hoàn thiện`);
  row.o.assembly = quickAssemblyBefore;
  toggleWorkshopQuickStatus(quickRowKey);
  setWorkshopQuickStatusConfirm(quickRowKey, true);
  const quickReadyButton = document.querySelector('.workshop-quick-status-option[onclick*="\'ready\'"]');
  const quickProgressButton = document.querySelector('.workshop-quick-status-option[onclick*="\'in_progress\'"]');
  check('Trạng thái nhanh QC/gia công vẫn bấm được khi còn thiếu part', !quickReadyButton?.disabled && !quickProgressButton?.disabled, `sẵn gia công ${quickReadyButton?.disabled ? 'khoá' : 'mở'} · đang gia công ${quickProgressButton?.disabled ? 'khoá' : 'mở'}`);
  setWorkshopQuickStatusInline(quickRowKey, 'ready');
  row = fulfillmentWorkshopRows().find(item => item.o?.id === 'qa-order');
  check('Trạng thái nhanh chỉ mở đúng số bộ đang đủ part', workshopAssemblyStage(row) === 'ready' && workshopAssemblyTargetQty(row) === 2 && row.handover?.qcAcceptedQty === 2, `${workshopAssemblyStage(row)} · ${workshopAssemblyTargetQty(row)} bộ`);
  row.o.assembly = quickAssemblyBefore;

  const externalPending = { source: 'external', externalKey: 'qa-external', it: { qty: 4 }, handover: { qcStatus: 'rejected', qcAcceptedQty: 2, reprintQty: 2, assemblyStatus: 'in_progress', assemblyQty: 0 } };
  const externalDone = { ...externalPending, handover: { ...externalPending.handover, assemblyStatus: 'completed', assemblyQty: 2, readyQty: 2 } };
  check('Mẻ ngoài đơn chỉ gia công số QC đạt', workshopAssemblyTargetQty(externalPending) === 2, workshopAssemblyTargetQty(externalPending));
  check('Hoàn tất mẻ ngoài đơn chỉ sẵn giao số QC đạt', workshopReadyDeliveryQty(externalDone) === 2, workshopReadyDeliveryQty(externalDone));
  const invalidQuickCompletion = { source: 'external', externalKey: 'qa-invalid-quick', it: { qty: 4 }, parts: [{ qty: 4, qtyDone: 3 }], ready: false, handover: { qcStatus: 'accepted', assemblyStatus: 'completed', assemblyQty: 4, readyQty: 4, manualStatusOverride: { to: 'completed' } } };
  check('Dữ liệu hoàn tất nhanh cũ thiếu part không còn lọt vào kệ giao', workshopAssemblyStage(invalidQuickCompletion) === 'part_qc' && workshopReadyDeliveryQty(invalidQuickCompletion) === 0, `${workshopAssemblyStage(invalidQuickCompletion)} · ${workshopReadyDeliveryQty(invalidQuickCompletion)} sẵn giao`);

  /* Một model chỉ có một part không cần đợi đủ toàn bộ đơn mới được gia công.
     12 part đã in là 12 bộ có thể QC/gia công; part thứ 13 vẫn phải chờ in,
     tuyệt đối không được tự bù thành 13. */
  models.push({
    id: 'qa-single-part-model', name: 'QA · Model một part', cats: ['QA'], images: [],
    variants: [{ id: 'qa-single-size', name: 'Size QA' }],
    parts: [{ id: 'qa-single-main', name: 'Main', qtyPerModel: 1, filamentIds: [qaFilament.id] }],
  });
  orders.push({
    id: 'qa-single-part-order', note: 'QA · Đơn một part', status: 'processing', createdAt: stamp,
    items: [{ id: 'qa-single-part-item', modelId: 'qa-single-part-model', modelName: 'QA · Model một part', variantId: 'qa-single-size', variantName: 'Size QA', qty: 13 }],
    assembly: { status: 'in_progress', items: {}, handovers: { 'qa-single-part-item': { handedAt: stamp, handedBy: 'QA', qcStatus: 'pending' } } },
  });
  pitems.push({ id: 'qa-single-main-pitem', orderId: 'qa-single-part-order', orderItemId: 'qa-single-part-item', modelId: 'qa-single-part-model', partId: 'qa-single-main', partName: 'Main', variantId: 'qa-single-size', variantName: 'Size QA', qty: 13, qtyDone: 12, qtyRejected: 0 });
  batchReports.push({
    id: 'qa-single-part-print', status: 'done', createdAt: stamp, completedAt: stamp, filamentId: qaFilament.id,
    manualItems: [{ modelId: 'qa-single-part-model', modelName: 'QA · Model một part', partId: 'qa-single-main', partName: 'Main', variantId: 'qa-single-size', variantName: 'Size QA', qty: 12, filamentId: qaFilament.id }],
  });
  const partialOrder = orders.find(order => order.id === 'qa-single-part-order');
  const partialItem = partialOrder.items[0];
  let partialRow = fulfillmentWorkshopRows().find(item => item.o?.id === partialOrder.id);
  check('Một part in 12/13 tạo đúng 12 bộ có thể gia công', orderItemCompleteSetQty(partialOrder, partialItem) === 12 && !itemAllPartsPrinted(partialOrder, partialItem) && workshopCompleteSetQty(partialRow) === 12, `${orderItemCompleteSetQty(partialOrder, partialItem)}/13`);
  openPartQcDialog(partialOrder.id, partialItem.id);
  const partialQcQty = document.getElementById('part-qc-qty');
  check('QC part giới hạn theo số bộ đã in thay vì cả đơn', partialQcQty?.max === '12' && partialQcQty?.value === '12', `${partialQcQty?.value}/${partialQcQty?.max}`);
  document.getElementById('part-qc-by').value = 'QA';
  savePartQcAccepted(partialOrder.id, partialItem.id);
  partialRow = fulfillmentWorkshopRows().find(item => item.o?.id === partialOrder.id);
  check('QC 12/13 mở gia công đúng 12 bộ', workshopAssemblyStage(partialRow) === 'ready' && workshopAssemblyTargetQty(partialRow) === 12 && partialRow.handover?.qcAcceptedQty === 12, `${workshopAssemblyStage(partialRow)} · ${workshopAssemblyTargetQty(partialRow)}`);
  startWorkshopAssembly(partialOrder.id, partialItem.id);
  openAssemblyFinish(partialOrder.id, partialItem.id);
  const partialAssemblyQty = document.getElementById('assembly-finish-qty');
  check('Hoàn tất gia công không thể vượt 12 bộ QC đạt', partialAssemblyQty?.max === '12' && partialAssemblyQty?.value === '12', `${partialAssemblyQty?.value}/${partialAssemblyQty?.max}`);
  document.getElementById('assembly-finish-by').value = 'QA';
  saveAssemblyFinish(partialOrder.id, partialItem.id, true);
  partialRow = fulfillmentWorkshopRows().find(item => item.o?.id === partialOrder.id);
  check('Hoàn tất 12 bộ không tự ghi nhận part thứ 13', workshopAssemblyStage(partialRow) === 'completed' && workshopReadyDeliveryQty(partialRow) === 12 && assembledQty(partialOrder, partialItem.id) === 12 && !itemAllPartsPrinted(partialOrder, partialItem), `${workshopReadyDeliveryQty(partialRow)} sẵn giao · ${assembledQty(partialOrder, partialItem.id)} hoàn tất`);
  const partialMetrics = orderFulfillmentMetrics(partialOrder);
  check('Tổng hợp đơn giữ đúng số bộ đã in, QC và gia công một phần', partialMetrics.printReadyQty === 12 && partialMetrics.qcAcceptedQty === 12 && partialMetrics.assembledQty === 12 && partialMetrics.total === 13 && partialMetrics.partialWorkshop, `${partialMetrics.printReadyQty} in · ${partialMetrics.qcAcceptedQty} QC · ${partialMetrics.assembledQty} gia công / ${partialMetrics.total}`);
  check('Đơn gia công từng phần có trạng thái riêng thay vì quay về đang in 0', fulfillmentState(partialOrder) === 'partial_assembly', fulfillmentState(partialOrder));
  goPage('fulfillment', { historyMode: 'none' });
  const partialOrderCard = [...document.querySelectorAll('.fulfillment-card')].find(card => card.textContent.includes('QA · Đơn một part'));
  check('Thẻ đơn hiển thị số lượng thực tế, không còn QC mặc định', partialOrderCard?.textContent.includes('In đủ bộ: 12/13') && partialOrderCard?.textContent.includes('QC đạt: 12/13') && partialOrderCard?.textContent.includes('Gia công xong: 12/13') && !partialOrderCard?.textContent.includes('QC mặc định đạt'), partialOrderCard?.textContent.replace(/\s+/g, ' ').trim() || 'thiếu thẻ');
  check('Khu Cần xử lý luôn có khung hiển thị', Boolean(document.getElementById('fulfillment-receive')), document.getElementById('fulfillment-receive') ? 'có khung' : 'thiếu khung');
  openOrderFulfillmentHistory(partialOrder.id);
  const partialHistoryText = document.getElementById('dlg-mv')?.textContent || '';
  check('Lịch sử hoàn thiện dùng số QC/gia công thật', partialHistoryText.includes('QC 12/13') && partialHistoryText.includes('gia công xong 12/13') && !partialHistoryText.includes('QC mặc định đạt'), partialHistoryText.replace(/\s+/g, ' ').trim());
  closeDialog('dlg-mv');
  const partialPitem = pitems.find(item => item.id === 'qa-single-main-pitem');
  partialPitem.qtyDone = 13;
  partialRow = fulfillmentWorkshopRows().find(item => item.o?.id === partialOrder.id);
  check('Part in bù xong mở nút QC thêm ngay trên thẻ đã hoàn tất', fulfillmentWorkshopCard(partialRow).includes('data-workshop-action="qc"') && fulfillmentWorkshopCard(partialRow).includes('QC thêm 1'), fulfillmentWorkshopCard(partialRow).includes('QC thêm 1') ? 'có nút QC thêm' : 'thiếu nút QC thêm');
  partialPitem.qtyDone = 12;
  const singleStock = getModelWorkshopStock('qa-single-part-model');
  check('Tồn kho model một part không có NaN hoặc undefined', singleStock.total === 12 && singleStock.groups[0]?.counts[0]?.perSet === 1 && Number.isFinite(singleStock.total), `${singleStock.total} bộ · ${singleStock.groups[0]?.counts[0]?.qty}/${singleStock.groups[0]?.counts[0]?.perSet}`);
  openModelPrintHistory('qa-single-part-model');
  const singleHistoryText = document.getElementById('dlg-model-history')?.textContent || '';
  check('Lịch sử in hiện số lượng và màu thực tế', singleHistoryText.includes('12 cái') && singleHistoryText.includes(qaFilament.name), singleHistoryText.slice(0, 240));
  closeDialog('dlg-model-history');
  operations.deliveryBatches.push({ id: 'qa-model-delivery', code: 'GH-QA-01', status: 'received', destination: 'Cửa hàng QA', deliveredAt: stamp, items: [{ modelId: 'qa-single-part-model', modelName: 'QA · Model một part', variantName: 'Size QA', sentQty: 12, receivedQty: 12 }] });
  viewModel('qa-single-part-model');
  const singleModelText = document.getElementById('dlg-mv')?.textContent || '';
  check('Thông tin model có tóm tắt mẻ in gần đây', singleModelText.includes('In gần đây') && singleModelText.includes('12 cái') && singleModelText.includes(qaFilament.name), singleModelText.slice(0, 260));
  const modelDeliveryHistoryText = document.querySelector('#dlg-mv .model-delivery-history')?.textContent || '';
  check('Dialog Model hiển thị lịch sử giao theo model và trạng thái nhận', modelDeliveryHistoryText.includes('GH-QA-01') && modelDeliveryHistoryText.includes('Cửa hàng QA') && modelDeliveryHistoryText.includes('12 cái') && /nhận đủ/i.test(modelDeliveryHistoryText), modelDeliveryHistoryText);
  closeDialog('dlg-mv');
  operations.deliveryBatches = operations.deliveryBatches.filter(batch => batch.id !== 'qa-model-delivery');

  /* Part không khóa màu vẫn phải ghi nhận màu thực tế trong từng dòng mẻ.
     Đây là dữ liệu lịch sử, không phải một quy tắc màu của Model. */
  batchReports.push({ id: 'qa-color-declaration', createdAt: stamp, status: 'pending', filamentId: null, manualItems: [] });
  brCurrentId = 'qa-color-declaration'; brManualItems = [];
  const freeColorPart = newManualEntry({ modelId: 'qa-model', partId: 'qa-body', qty: 1 });
  check('Part không khóa màu không được coi là đã khai báo', !hasDeclaredManualItemFilament(freeColorPart), String(freeColorPart.filamentId));
  freeColorPart.filamentId = fils[0]?.id || null;
  check('Màu thực tế được lưu theo từng Part', hasDeclaredManualItemFilament(freeColorPart), String(freeColorPart.filamentId));
  const configuredColorPart = newManualEntry({ modelId: 'qa-model', partId: 'qa-locked', qty: 1 });
  const configuredPartSource = models[0].parts.find(part => part.id === 'qa-locked');
  check('Part có màu quy định không bắt buộc khai báo lại', !manualItemRequiresActualColor(models[0], configuredColorPart, configuredPartSource) && hasDeclaredManualItemFilament(configuredColorPart), String(configuredColorPart.filamentId));
  brUnifiedSearch = 'QA';
  document.getElementById('ov-batch-report').style.display = 'flex';
  quickSelectBatchModel('qa-model');
  check('Chọn Model từ tìm kiếm chuyển sang bước khai báo', brView === 'manual' && Boolean(document.querySelector('#br-content .br-manual-layout')), brView);
  const actualColorPicker = document.querySelector('.br-color-picker');
  check('Chọn màu thực tế có chấm màu và ô tìm kiếm', Boolean(actualColorPicker?.querySelector('.br-color-picker-dot') && actualColorPicker?.querySelector('input[type="search"]') && actualColorPicker?.querySelector('.br-color-picker-option')), actualColorPicker ? 'có bộ chọn màu' : 'thiếu bộ chọn màu');
  const selectedModelThumb = document.querySelector('.br-manual-model-input .br-manual-model-thumb');
  check('Dòng model đã chọn trong mẻ in hiện ảnh sản phẩm', Boolean(selectedModelThumb?.getAttribute('src') && selectedModelThumb.closest('.br-manual-model-input')), selectedModelThumb?.getAttribute('src') || 'thiếu ảnh model');
  /* Dòng khai báo là một component dùng lại trong mọi mẻ ngoài kế hoạch. Trên
     điện thoại không được giữ cấu trúc bảng desktop khiến Model/Part/Màu/SL
     tràn ngang hoặc ép nút lưu ra ngoài màn hình. */
  const manualRow = document.querySelector('.br-manual-item-row');
  const manualModel = manualRow?.querySelector('.br-manual-item-model');
  const manualColor = manualRow?.querySelector('.br-manual-item-color');
  const manualPrimary = document.querySelector('.br-manual-detail > .br-actions .btn-ac');
  const manualRowStyle = manualRow && getComputedStyle(manualRow);
  const manualRowRect = manualRow?.getBoundingClientRect(), manualModelRect = manualModel?.getBoundingClientRect(), manualColorRect = manualColor?.getBoundingClientRect(), manualPrimaryRect = manualPrimary?.getBoundingClientRect();
  check('Mobile xếp dòng khai báo mẻ in theo nhóm, không còn bảng tràn ngang', Boolean(manualRowStyle && manualRowStyle.gridTemplateColumns.trim().split(/\s+/).length === 2 && manualRowRect && manualModelRect && manualColorRect && manualModelRect.width >= manualRow.clientWidth - 22 && manualColorRect.width >= manualRow.clientWidth - 22 && manualRow.scrollWidth <= manualRow.clientWidth + 1), manualRowRect ? `${manualRowStyle.gridTemplateColumns} · dòng ${Math.round(manualRowRect.width)}px · model ${Math.round(manualModelRect?.width||0)}px · màu ${Math.round(manualColorRect?.width||0)}px · ${manualRow.scrollWidth}/${manualRow.clientWidth}` : 'thiếu dòng khai báo');
  check('Mobile để nút lưu mẻ in thành hành động chính đủ rộng', Boolean(manualPrimaryRect && manualRowRect && manualPrimaryRect.width >= manualRowRect.width - 4 && manualPrimaryRect.right <= innerWidth + 1), manualPrimaryRect ? `${Math.round(manualPrimaryRect.width)}px` : 'thiếu nút lưu');

  /* Đối chiếu mẻ ngoài đơn phải là Model + Part + phiên bản. Một lỗi cũ đã
     cộng cùng một số lượng vào mọi phiên bản có chung Model/Part. */
  models.push({
    id: 'qa-variant-model', name: 'QA · Model nhiều phiên bản', cats: ['QA'], images: [],
    variants: [{ id: 'qa-v35', name: 'Size 3,5cm' }, { id: 'qa-v5', name: 'Size 5cm' }, { id: 'qa-v10', name: 'Size 10cm' }],
    parts: [{ id: 'qa-variant-part', name: 'Mặt gương', qtyPerModel: 1, filamentIds: [] }],
  });
  const variantPitems = [
    { id: 'qa-rec-35', orderId: 'qa-order', modelId: 'qa-variant-model', partId: 'qa-variant-part', partName: 'Mặt gương', variantId: 'qa-v35', variantName: 'Size 3,5cm', qty: 23, qtyDone: 0 },
    { id: 'qa-rec-5', orderId: 'qa-order', modelId: 'qa-variant-model', partId: 'qa-variant-part', partName: 'Mặt gương', variantId: 'qa-v5', variantName: 'Size 5cm', qty: 13, qtyDone: 0 },
    { id: 'qa-rec-10', orderId: 'qa-order', modelId: 'qa-variant-model', partId: 'qa-variant-part', partName: 'Mặt gương', variantId: 'qa-v10', variantName: 'Size 10cm', qty: 7, qtyDone: 0 },
  ];
  pitems.push(...variantPitems);
  const variantReport = { id: 'qa-variant-report', status: 'done', external: true, manualItems: [{ modelId: 'qa-variant-model', modelName: 'QA · Model nhiều phiên bản', partId: 'qa-variant-part', partName: 'Mặt gương', variantId: 'qa-v10', variantName: 'Size 10cm', qty: 4 }] };
  const variantMatches = getBatchReportReconciliationCandidates(variantReport);
  check('Đối chiếu chỉ chọn đúng phiên bản trong Order', variantMatches.length === 1 && variantMatches[0]?.pitem?.id === 'qa-rec-10' && variantMatches[0]?.available === 4, variantMatches.map(row => row.pitem.id).join(', '));
  variantPitems[2].qtyDone = 4;
  const reversibleReport = { ...variantReport, id: 'qa-reversible-report', external: false, externalOrigin: true, manualItems: [], appliedItems: [{ pitemId: 'qa-rec-10', qty: 4 }], reconciliationBackup: { manualItems: variantReport.manualItems, appliedItems: [] }, reconciliationDeltas: [{ pitemId: 'qa-rec-10', qty: 4 }] };
  restoreBatchReportBeforeEditing(reversibleReport);
  check('Sửa báo cáo hoàn tác riêng số lượng đã đối chiếu', variantPitems[2].qtyDone === 0 && variantPitems[0].qtyDone === 0 && variantPitems[1].qtyDone === 0 && reversibleReport.manualItems[0]?.variantId === 'qa-v10' && reversibleReport.external, `${variantPitems.map(item=>item.qtyDone).join('/')} · ${reversibleReport.manualItems[0]?.variantId||''}`);

  /* Reload phải giữ đúng vị trí thư viện báo cáo và toàn bộ điều kiện lọc. */
  const previousBatchView = { page: batchReportCurrentPage, pageSize: batchReportPageSize, search: FILTERS.batches.search, sort: FILTERS.batches.sort, status: FILTERS.batches.status, day: batchTimelineDay };
  Object.assign(FILTERS.batches, { search: 'qa giữ bộ lọc', sort: 'pending_first', status: 'pending' });
  batchReportCurrentPage = 4; batchReportPageSize = 36; batchTimelineDay = '2026-09-08';
  persistBatchLibraryView();
  Object.assign(FILTERS.batches, { search: '', sort: 'recorded_desc', status: 'all' });
  batchReportCurrentPage = 1; batchReportPageSize = 24; batchTimelineDay = ''; batchLibraryViewRestoredKey = '';
  restoreBatchLibraryView();
  check('Tải lại giữ trang đang xem của báo cáo mẻ', batchReportCurrentPage === 4 && batchReportPageSize === 36, `${batchReportCurrentPage} · ${batchReportPageSize}/trang`);
  check('Tải lại giữ đủ bộ lọc báo cáo mẻ', FILTERS.batches.search === 'qa giữ bộ lọc' && FILTERS.batches.sort === 'pending_first' && FILTERS.batches.status === 'pending' && batchTimelineDay === '2026-09-08', JSON.stringify({...FILTERS.batches, day:batchTimelineDay}));
  Object.assign(FILTERS.batches, { search: previousBatchView.search, sort: previousBatchView.sort, status: previousBatchView.status });
  batchReportCurrentPage = previousBatchView.page; batchReportPageSize = previousBatchView.pageSize; batchTimelineDay = previousBatchView.day;

  /* A confirmed receipt is included to exercise the populated mobile section,
     not just the empty-state layout. */
  operations.deliveryBatches.push({
    id: 'qa-receipt', code: 'QA-GH-001', status: 'received', deliveredAt: stamp, receivedAt: stamp,
    deliveredBy: 'QA', receivedBy: 'QA Store', destination: 'Cửa hàng QA',
    items: [{ modelId: 'qa-confirmed-model', modelName: 'QA · Sản phẩm đã nhận', sentQty: 1, receivedQty: 1 }],
  });
  /* A production toast may intentionally open an acknowledgement modal after
     a QC rejection. Close it here so the screenshot audits the destination
     page rather than the transient notification. */
  closeActionDialog?.();
  closeDialog?.('dlg-mv');
  goPage('fulfillment', { historyMode: 'none' });
  const receiptHeading = document.querySelector('.delivery-receipt-overview .fulfillment-workshop-subhead');
  const receiptHelp = receiptHeading?.querySelector('small');
  check('Phiếu đã xác nhận hiện đúng khi có dữ liệu', Boolean(receiptHeading));
  check('Mô tả phiếu trên mobile nằm dưới tiêu đề, không bị ép ngang', Boolean(receiptHeading && receiptHelp && receiptHelp.getBoundingClientRect().top > receiptHeading.getBoundingClientRect().top + 14), receiptHelp ? `${Math.round(receiptHelp.getBoundingClientRect().top - receiptHeading.getBoundingClientRect().top)}px` : 'không có mô tả');
  check('Khu phiếu đã nhận không tràn ngang', !receiptHeading || receiptHeading.scrollWidth <= receiptHeading.clientWidth + 1, receiptHeading ? `${receiptHeading.scrollWidth}/${receiptHeading.clientWidth}` : 'không có heading');
  openCompletedDeliveryReview(operations.deliveryBatches.find(batch => batch.id === 'qa-receipt'));
  check('Quản trị viên có nút sửa cả biên lai đã xác nhận', Boolean(document.querySelector('#dlg-mv button[onclick*="openDeliveryReceiptEditor"]')), document.getElementById('dlg-mv')?.textContent || 'không mở biên lai');
  openDeliveryReceiptEditor('qa-receipt');
  const receiptEditor = document.querySelector('#dlg-mv .dlg');
  check('Form sửa biên lai không tràn ngang trên mobile', !receiptEditor || receiptEditor.scrollWidth <= receiptEditor.clientWidth + 1, receiptEditor ? `${receiptEditor.scrollWidth}/${receiptEditor.clientWidth}` : 'không mở form');
  const receiptSentQty = document.getElementById('receipt-edit-sent-0');
  const receiptReceivedQty = document.getElementById('receipt-edit-received-0');
  check('Quản trị viên có thể sửa số giao và số nhận trên từng dòng biên lai', Boolean(receiptSentQty && receiptReceivedQty), `giao=${Boolean(receiptSentQty)} · nhận=${Boolean(receiptReceivedQty)}`);
  document.getElementById('receipt-edit-destination').value = 'Cửa hàng QA đã sửa';
  document.getElementById('receipt-edit-receive-note').value = 'QA đã kiểm tra lại';
  receiptSentQty.value = '3';
  receiptReceivedQty.value = '9';
  syncDeliveryReceiptQuantity(0);
  saveDeliveryReceiptEditor('qa-receipt');
  const editedReceipt = operations.deliveryBatches.find(batch => batch.id === 'qa-receipt');
  check('Số nhận bị giới hạn theo số giao và trạng thái biên lai tự cập nhật', editedReceipt?.items?.[0]?.sentQty === 3 && editedReceipt?.items?.[0]?.receivedQty === 3 && editedReceipt?.status === 'received', JSON.stringify(editedReceipt?.items?.[0] || {}));
  check('Quản trị viên sửa biên lai sau khi cửa hàng báo nhận và có nhật ký', editedReceipt?.destination === 'Cửa hàng QA đã sửa' && editedReceipt?.receiveNote === 'QA đã kiểm tra lại' && editedReceipt?.editHistory?.[0]?.fields?.includes('destination') && editedReceipt?.editHistory?.[0]?.fields?.includes('receiveNote') && editedReceipt?.editHistory?.[0]?.fields?.includes('items[0].sentQty'), JSON.stringify(editedReceipt?.editHistory?.[0] || {}));
  closeDialog?.('dlg-mv');

  /* Các lời nhắc ngắn không được tự biến thành popup chặn, nhất là khi giao
     hàng chưa đối soát: người dùng vẫn có thể tiếp tục và bổ sung nhật ký nếu cần. */
  closeActionDialog?.();
  toast('Hãy ghi người xác nhận và lý do cho hàng chưa đối soát.');
  check('Toast cảnh báo không tự mở dialog chặn', !document.getElementById('dlg-action')?.classList.contains('open') && !document.getElementById('dlg-action')?.classList.contains('show'), document.getElementById('dlg-action')?.style.display || 'đã đóng');
  check('Giao hàng chưa đối soát không còn bị bắt buộc ghi xác nhận/lý do', !saveDeliveryBatchFromWorkspace.toString().includes("itemsUnreconciled.length&&(!f.legacyConfirmedBy?.trim()||!f.legacyReason?.trim())"));

  deliveryWorkspaceState = { ...deliveryWorkspaceState, sourceOrderId: 'qa-order', step: 'products', selected: {} };
  goPage('delivery-builder', { historyMode: 'none' });
  renderDeliveryBuilderPage({ persist: false });
  check('Mô tả đầu trang dùng copy ngắn thay vì lặp lại nội dung các khối bên dưới', Object.values(PAGE_META).every(meta => String(meta.subtitle || '').length <= 24), Object.values(PAGE_META).map(meta => meta.subtitle).join(' · '));
  const deliveryStepLabels = [...document.querySelectorAll('.delivery-wizard-step')];
  check('Stepper giao hàng chỉ giữ tên bước, không lặp diễn giải', deliveryStepLabels.length === 3 && deliveryStepLabels.every(step => !step.querySelector('small') && step.textContent.trim().length <= 18), deliveryStepLabels.map(step => step.textContent.trim()).join(' · '));
  const deliveryGroups = [...document.querySelectorAll('.delivery-category-section h2')].map(node => node.textContent.trim());
  check('Nhóm hàng giao dùng tên ngắn nhưng vẫn phân biệt đủ bốn nguồn', ['Hàng 3D sẵn giao', 'Hàng ngoài 3D', 'Hàng chưa đối soát', 'Hàng mới'].every(name => deliveryGroups.includes(name)), deliveryGroups.join(' · '));
  const readyVariant = document.querySelector('.delivery-category-section.is-3d .delivery-product-variant');
  check('Thẻ thành phẩm sẵn giao hiển thị biến thể', readyVariant?.textContent.includes('Size 10cm'), readyVariant?.textContent.trim() || 'thiếu biến thể');
  const deliveryStageBeforeSearch = document.querySelector('.delivery-wizard-stage');
  const deliverySearchInput = document.getElementById('delivery-workspace-search');
  if (deliverySearchInput) { deliverySearchInput.focus(); deliverySearchInput.value = 'Size 10cm'; }
  setDeliveryWorkspaceSearch('Size 10cm');
  await new Promise(resolve => requestAnimationFrame(resolve));
  check('Gõ tìm giao hiện gợi ý ngay mà không dựng lại cả trang', Boolean(document.querySelector('.delivery-search-suggestions')) && document.querySelector('.delivery-wizard-stage') === deliveryStageBeforeSearch, document.querySelector('.delivery-search-suggestions') ? 'gợi ý nội tuyến' : 'thiếu gợi ý');
  /* Không đo sau một số mili-giây cố định: ở máy chậm chính frame trước đó có
     thể mất hơn 100ms dù debounce chưa hề sai. Kiểm tra trực tiếp ngưỡng và
     xác nhận DOM chỉ dựng lại sau khi đã vượt đúng khoảng chờ. */
  check('Gõ liên tục chỉ lọc đầy đủ sau nhịp nghỉ đủ dài', DELIVERY_SEARCH_IDLE_MS >= 220, `${DELIVERY_SEARCH_IDLE_MS}ms`);
  await new Promise(resolve => setTimeout(resolve, DELIVERY_SEARCH_IDLE_MS + 50));
  check('Kết quả đầy đủ được lọc sau nhịp gõ', document.querySelector('.delivery-wizard-stage') !== deliveryStageBeforeSearch && document.getElementById('delivery-workspace-search')?.value === 'Size 10cm', document.getElementById('delivery-workspace-search')?.value || 'thiếu ô tìm');
  setDeliveryWorkspaceSearch('');
  await new Promise(resolve => setTimeout(resolve, 210));
  deliveryWorkspaceState = { ...deliveryWorkspaceState, step: 'info', selected: { 0: 1 }, form: { ...(deliveryWorkspaceState.form || {}), destination: 'Bánh mì Stationery', date: '2026-09-09' } };
  renderDeliveryBuilderPage({ persist: false });
  const deliveryInfoStage = document.querySelector('.delivery-wizard-stage');
  const deliveryInfoHead = deliveryInfoStage?.querySelector('.delivery-wizard-stage-head');
  const deliveryInfoSummary = deliveryInfoHead?.querySelector('.delivery-wizard-summary-compact');
  const deliveryInfoForm = deliveryInfoStage?.querySelector('.delivery-form-card');
  check('Bước thông tin giao chỉ giữ một tiêu đề theo mục tiêu', Boolean(deliveryInfoHead?.querySelector('h2')) && !/BƯỚC\s*2|Thông tin này sẽ in|Đã chọn ở bước 1/i.test(deliveryInfoStage?.innerText || ''), deliveryInfoStage?.innerText.slice(0, 180) || 'thiếu bước');
  check('Tóm tắt số hàng ở bước giao được gộp thành một chip', Boolean(deliveryInfoSummary?.textContent.includes('1 dòng') && deliveryInfoSummary?.textContent.includes('1 cái')) && document.querySelectorAll('.delivery-wizard-hero .badge').length === 0, deliveryInfoSummary?.textContent.trim() || 'thiếu chip');
  const infoHeadRect = deliveryInfoHead?.getBoundingClientRect(), infoFormRect = deliveryInfoForm?.getBoundingClientRect();
  check('Bước giao có khoảng thở rõ giữa tiêu đề và biểu mẫu', Boolean(infoHeadRect && infoFormRect && infoFormRect.top - infoHeadRect.bottom >= 16), infoHeadRect && infoFormRect ? `${Math.round(infoFormRect.top - infoHeadRect.bottom)}px` : 'thiếu khối');
  const deliveryInfoContinue = document.querySelector('.delivery-wizard-stage .delivery-form-card .delivery-workspace-actions button[onclick="setDeliveryWorkspaceStep(\'photos\')"]');
  check('Bước thông tin giao có nút tiếp tục ngay cuối form', Boolean(deliveryInfoContinue) && !deliveryInfoContinue.disabled, deliveryInfoContinue?.textContent.trim() || 'thiếu nút');
  deliveryInfoContinue?.click();
  check('Nút tiếp tục ở bước thông tin chuyển sang bước chụp ảnh', deliveryWorkspaceState.step === 'photos' && Boolean(document.querySelector('.delivery-wizard-camera')), deliveryWorkspaceState.step);

  /* Realtime có thể bị browser ngắt khi máy ngủ hoặc đổi mạng. Khi đó app phải
     tự phát hiện revision từ cloud và nạp lại, không được buộc người vận hành
     reload trang. Dùng Supabase giả để kiểm tra đúng lớp fallback này. */
  const priorCloudSync = {
    sb, currentUser, cloudReady, activeWorkspace, cloudSyncing, lastCloudWriteAt, cloudOutbox: [...cloudOutbox],
    reconcileWorkspace: cloudRemoteRevisionWorkspace, revisions: [...cloudRemoteRevisions.entries()],
    queue: queueRemoteDataRefresh,
  };
  const remoteVersions = Object.fromEntries(Object.values(CLOUD_TABLES).map((table, index) => [table, `2026-09-10T00:00:0${index}.000Z`]));
  sb = { from(table) {
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; },
      limit() { return Promise.resolve({ data: remoteVersions[table] ? [{ updated_at: remoteVersions[table] }] : [], error: null }); },
    };
    return query;
  } };
  currentUser = { id: 'qa-realtime-user' }; cloudReady = true; activeWorkspace = { workspace_id: 'qa-realtime-workspace' };
  cloudSyncing = false; cloudOutbox = []; lastCloudWriteAt = 0; cloudRemoteRevisionWorkspace = ''; cloudRemoteRevisions.clear(); remoteRefreshTables.clear();
  let fallbackRefreshes = 0;
  queueRemoteDataRefresh = () => { fallbackRefreshes += 1; };
  await reconcileRemoteCloudChanges();
  remoteVersions.models = '2026-09-10T01:00:00.000Z';
  const detectedRemoteChange = await reconcileRemoteCloudChanges();
  check('Đồng bộ nền tự phát hiện dữ liệu máy khác khi Realtime không tới', detectedRemoteChange && fallbackRefreshes === 1 && remoteRefreshTables.has('models'), `${fallbackRefreshes} lượt · ${[...remoteRefreshTables].join(',')}`);
  const realtimeRecoverySource = `${setupCloudRealtime.toString()} ${handleCloudRealtimeStatus.toString()} ${installCloudRemoteReconcileListeners.toString()}`;
  check('Kênh Realtime có theo dõi trạng thái, tự nối lại và kiểm tra khi quay lại app', /subscribe\(\(status,error\)=>handleCloudRealtimeStatus/.test(realtimeRecoverySource) && /CHANNEL_ERROR/.test(realtimeRecoverySource) && /visibilitychange/.test(realtimeRecoverySource) && /online/.test(realtimeRecoverySource), realtimeRecoverySource.includes('CHANNEL_ERROR') ? 'có fallback kết nối' : 'thiếu fallback');
  const beforeLocalCacheModels = models;
  const receivedLocalCache = applyLocalWorkspaceCacheValue(K.models, JSON.stringify([{ id: 'qa-live-model', name: 'Model vừa sửa ở tab khác', parts: [] }]));
  check('Tab cùng máy nhận ngay dữ liệu mới từ cache dùng chung, không cần reload', receivedLocalCache && models[0]?.name === 'Model vừa sửa ở tab khác', models[0]?.name || 'không nhận cache');
  models = beforeLocalCacheModels;
  remoteRefreshTables.clear(); cloudOutbox = [{ id: 'qa-pending-write' }]; lastCloudWriteAt = Date.now();
  scheduleCloudRefresh('models');
  check('Event Realtime đến lúc outbox đang gửi vẫn được giữ để nạp sau', remoteRefreshTables.has('models'), [...remoteRefreshTables].join(',') || 'event đã bị rơi');
  clearTimeout(cloudRefreshTimer); cloudOutbox = [];
  clearTimeout(cloudRemoteReconcileTimer); remoteRefreshTables.clear();
  sb = priorCloudSync.sb; currentUser = priorCloudSync.currentUser; cloudReady = priorCloudSync.cloudReady; activeWorkspace = priorCloudSync.activeWorkspace;
  cloudSyncing = priorCloudSync.cloudSyncing; cloudOutbox = priorCloudSync.cloudOutbox; lastCloudWriteAt = priorCloudSync.lastCloudWriteAt; cloudRemoteRevisionWorkspace = priorCloudSync.reconcileWorkspace;
  cloudRemoteRevisions.clear(); priorCloudSync.revisions.forEach(([key, revision]) => cloudRemoteRevisions.set(key, revision));
  queueRemoteDataRefresh = priorCloudSync.queue;

  /* Lịch sử bán tăng mỗi ngày phải không bị nhét lại vào settings JSON. Chỉ
     metadata được đồng bộ; chi tiết SKU nằm ở kho báo cáo theo ngày. */
  const priorKiotArchive = kiotViet;
  const priorKiotArchiveReady = kiotSalesArchiveReadyForSettings;
  kiotViet = {
    ...kiotViet, sales: [{ sku: 'QA-LATEST', name: 'QA', qty: 1, revenue: 10000 }],
    salesImports: [{ id: 'qa-sales-archive', importedAt: stamp, source: 'range', period: { from: '2026-09-01', to: '2026-09-01' }, sales: [{ sku: 'QA-SKU', name: 'QA SKU', category: 'QA', qty: 12, revenue: 120000 }] }],
  };
  check('Lịch sử cũ vẫn được giữ trong settings trước khi chuyển kho xong', kiotVietForCloudSettings().salesImports[0].sales?.length === 1, JSON.stringify(kiotVietForCloudSettings().salesImports[0]));
  kiotSalesArchiveReadyForSettings = true;
  const cloudKiotSettings = kiotVietForCloudSettings();
  check('Lịch sử bán lớn chỉ đồng bộ metadata, không gửi chi tiết SKU trong settings', cloudKiotSettings.sales.length === 0 && cloudKiotSettings.salesImports.length === 1 && !Object.hasOwn(cloudKiotSettings.salesImports[0], 'sales') && cloudKiotSettings.salesImports[0].qtyTotal === 12, JSON.stringify(cloudKiotSettings.salesImports[0]));
  /* Lịch/biểu đồ đọc metadata trước, còn SKU chi tiết chỉ nạp khi mở đúng
     ngày. Không được biến doanh thu của ngày chưa nạp chi tiết thành 0đ. */
  const archivedSalesDay = { id: 'qa-sales-summary', period: { from: '2026-09-02', to: '2026-09-02' }, skuCount: 3, qtyTotal: 9, revenueTotal: 456700, detailLoaded: false };
  const archivedMetric = kiotSalesImportMetrics(archivedSalesDay);
  const archivedSeries = kiotSalesDailySeries([archivedSalesDay])[0];
  check('Biểu đồ dùng tổng đã lưu khi chi tiết ngày cũ chưa tải', archivedMetric.sku === 3 && archivedMetric.qty === 9 && archivedMetric.revenue === 456700 && archivedSeries?.sku === 3 && archivedSeries?.revenue === 456700, JSON.stringify({ archivedMetric, archivedSeries }));
  const kiotTextRevenue = kiotSalesRevenueForRow({ 'Mã hàng': 'QA-TEXT', 'Số lượng bán': '2', 'Thành tiền': '1.250.000 đ' });
  const kiotEnglishRevenue = kiotSalesRevenueForRow({ SKU: 'QA-EN', 'SL bán': '1', 'Tổng doanh thu': '1,250.50' });
  check('Nhập báo cáo đọc đúng doanh thu dạng text vi-VN và en-US', kiotTextRevenue === 1250000 && kiotEnglishRevenue === 1250.5, `${kiotTextRevenue} · ${kiotEnglishRevenue}`);
  check('Bù theo khoảng chỉ xếp các ngày chưa có báo cáo', JSON.stringify(kiotSalesMissingDays('2026-09-01', '2026-09-03')) === JSON.stringify(['2026-09-02', '2026-09-03']), JSON.stringify(kiotSalesMissingDays('2026-09-01', '2026-09-03')));
  const rangeDialogSource = `${openKiotSalesRangeDialog} ${startKiotSalesRangeSync} ${refreshKiotSalesRangeAutomation} ${previewKiotSalesRange}`;
  check('Bù khoảng ngày kiểm tra bridge, gửi đúng ngày thiếu và không phụ thuộc bản ghi RAM', /kiotSalesRangeAutomation\.ready/.test(rangeDialogSource) && /\/health/.test(rangeDialogSource) && /\/range\/run/.test(rangeDialogSource) && /days:missing/.test(rangeDialogSource) && !/\/recording/.test(refreshKiotSalesRangeAutomation.toString()), rangeDialogSource.includes('/range/run') ? 'có health check và hàng chờ' : 'thiếu hàng chờ');
  /* Bộ chọn kỳ báo cáo là một họ control dùng lại ở trang Bán hàng và hộp
     quản lý lịch sử. Dữ liệu nhiều tháng phải có lối lọc nhanh, đồng thời chỉ
     đổi danh sách kỳ/biểu đồ chứ không làm mất báo cáo đang xem. */
  const priorSalesPageReportId = salesPageReportId, priorSalesPageMonthFilter = salesPageMonthFilter, priorSalesHistoryMonthFilter = salesHistoryMonthFilter;
  kiotViet = {
    ...kiotViet,
    salesImports: ['05-11','06-12','07-13','08-14'].map((day,index) => ({
      id: `qa-month-${index + 5}`, importedAt: `2026-${String(index + 5).padStart(2, '0')}-${day.slice(3)}T09:00:00.000Z`, source: 'dated-file',
      period: { from: `2026-${String(index + 5).padStart(2, '0')}-${day.slice(3)}`, to: `2026-${String(index + 5).padStart(2, '0')}-${day.slice(3)}` },
      sales: [{ sku: `QA-M${index + 5}`, name: `QA tháng ${index + 5}`, category: 'QA', qty: index + 1, revenue: (index + 1) * 10000 }],
    })),
  };
  salesPageReportId = ''; salesPageMonthFilter = 'all'; salesHistoryMonthFilter = 'all';
  renderSalesPage();
  const salesMonthChips = [...document.querySelectorAll('#sales-page .sales-month-chip')].map(button => button.textContent.trim());
  check('Kỳ báo cáo có chip lọc nhanh cho mọi tháng đã nhập', ['Tháng 5 · 2026','Tháng 6 · 2026','Tháng 7 · 2026','Tháng 8 · 2026'].every(label => salesMonthChips.includes(label)), salesMonthChips.join(' | '));
  setSalesPageMonthFilter('2026-06');
  const salesOptionsAfterMonthFilter = [...document.querySelectorAll('#sales-period option')].map(option => option.textContent.trim());
  const chartAfterMonthFilter = document.querySelector('#sales-page .sales-daily-chart')?.textContent || '';
  check('Lọc tháng chỉ giữ đúng các kỳ và biểu đồ của tháng đã chọn', salesOptionsAfterMonthFilter.length === 1 && /12\/06\/2026/.test(salesOptionsAfterMonthFilter[0] || '') && /12\/06/.test(chartAfterMonthFilter) && !/11\/05|13\/07|14\/08/.test(chartAfterMonthFilter), `${salesOptionsAfterMonthFilter.join(' | ')} · ${chartAfterMonthFilter.slice(0, 120)}`);
  openKiotSalesHistoryManager();
  setSalesHistoryMonthFilter('2026-08');
  const historyRowsAfterMonthFilter = [...document.querySelectorAll('#dlg-mv .kiot-sales-history-row')].map(row => row.textContent.trim());
  check('Quản lý lịch sử dùng cùng bộ lọc tháng', historyRowsAfterMonthFilter.length === 1 && /14\/08\/2026/.test(historyRowsAfterMonthFilter[0] || ''), historyRowsAfterMonthFilter.join(' | '));
  closeDialog('dlg-mv');
  salesPageReportId = priorSalesPageReportId; salesPageMonthFilter = priorSalesPageMonthFilter; salesHistoryMonthFilter = priorSalesHistoryMonthFilter;
  kiotViet = priorKiotArchive;kiotSalesArchiveReadyForSettings = priorKiotArchiveReady;

  /* Sổ tồn dùng snapshot bất biến làm mốc, không được lấy tồn mới rồi tự cộng
     đè lên. 2 + nhận 5 - bán 3 phải ra đúng 4 để phát hiện mọi chênh lệch. */
  const priorInventoryLedger = kiotInventoryLedger;
  kiotViet = {
    ...kiotViet,
    catalog: [{ sku: 'QA-STOCK-A', name: 'QA Product A', stock: 4 }],
    snapshots: [
      { id: 'qa-stock-current', observedAt: '2026-09-15T23:59:59.999+07:00', stockBySku: { 'QA-STOCK-A': 4 }, fileName: 'current.xlsx' },
      { id: 'qa-stock-baseline', observedAt: '2026-09-09T23:59:59.999+07:00', stockBySku: { 'QA-STOCK-A': 2 }, fileName: 'baseline.xlsx' },
    ],
  };
  kiotInventoryLedger = { movements: [
    { sourceKey: 'delivery:qa', kind: 'delivery_received', occurredAt: '2026-09-10T12:00:00+07:00', sku: 'QA-STOCK-A', name: 'QA Product A', quantityDelta: 5 },
    { sourceKey: 'sales:qa', kind: 'sale', occurredAt: '2026-09-15T23:59:59.999+07:00', sku: 'QA-STOCK-A', name: 'QA Product A', quantityDelta: -3 },
  ], remoteReconciliation: [], remoteSnapshots: [], loaded: true };
  const stockLedgerRows = kiotInventoryLocalReconciliation(kiotViet.snapshots[0]);
  check('Sổ tồn kho tính snapshot + giao − bán đúng', stockLedgerRows[0]?.expectedStock === 4 && stockLedgerRows[0]?.observedStock === 4 && stockLedgerRows[0]?.status === 'matched', JSON.stringify(stockLedgerRows[0]));
  kiotViet.snapshots[0].stockBySku['QA-STOCK-A'] = 6;
  const stockVarianceRows = kiotInventoryLocalReconciliation(kiotViet.snapshots[0]);
  check('Snapshot lệch tồn tạo cảnh báo thay vì tự sửa số', stockVarianceRows[0]?.variance === 2 && stockVarianceRows[0]?.status === 'open', JSON.stringify(stockVarianceRows[0]));
  check('KiotViet có luồng ghi điều chỉnh tồn kho có lý do', /openKiotInventoryAdjustmentDialog/.test(kiotInventoryControlHTML()) && /Lý do bắt buộc/.test(openKiotInventoryAdjustmentDialog.toString()) && /persistKiotInventoryMovement/.test(saveKiotInventoryAdjustment.toString()), 'có adjustment audit');
  check('Trang Kiot không tự render vô hạn khi chưa đăng nhập cloud', /!kiotInventoryLedger\.loaded&&sb&&currentUser&&cloudWorkspaceId\(\)&&kiotInventoryLedgerAvailable/.test(renderKiotVietPage.toString()), 'chỉ hydrate ledger cloud khi đã có phiên đăng nhập');
  kiotInventoryLedger = priorInventoryLedger;kiotViet = priorKiotArchive;

  /* Một lượt QC có thể loại nhiều part. Lỗi của Đèn đỏ không được đưa cả
     Đèn giao thông khỏi tab QC, và hàng in bù phải chỉ rõ từng part lỗi. */
  const trafficModel = {
    id: 'qa-traffic-model', name: 'QA · Đèn giao thông', cats: ['QA'], images: [], variants: [],
    parts: [
      { id: 'qa-traffic-base', name: 'Đế', qtyPerModel: 1, filamentIds: [] },
      { id: 'qa-traffic-red', name: 'Đèn đỏ', qtyPerModel: 1, filamentIds: [] },
      { id: 'qa-traffic-yellow', name: 'Đèn vàng', qtyPerModel: 1, filamentIds: [] },
      { id: 'qa-traffic-green', name: 'Đèn xanh', qtyPerModel: 1, filamentIds: [] },
    ],
  };
  const trafficOrder = {
    id: 'qa-traffic-order', note: 'QA · QC nhiều part', status: 'processing', createdAt: stamp,
    items: [{ id: 'qa-traffic-item', modelId: trafficModel.id, modelName: trafficModel.name, qty: 10 }],
    assembly: { status: 'in_progress', items: {}, handovers: { 'qa-traffic-item': { handedAt: stamp, handedBy: 'QA', qcStatus: 'pending', qcAcceptedQty: 0, partQcAcceptedQty: 0, assemblyStatus: 'blocked' } } },
  };
  models.push(trafficModel); orders.push(trafficOrder);
  pitems.push(
    { id: 'qa-traffic-pitem-base', orderId: trafficOrder.id, orderItemId: 'qa-traffic-item', modelId: trafficModel.id, partId: 'qa-traffic-base', partName: 'Đế', qty: 10, qtyDone: 10, qtyRejected: 0 },
    { id: 'qa-traffic-pitem-red', orderId: trafficOrder.id, orderItemId: 'qa-traffic-item', modelId: trafficModel.id, partId: 'qa-traffic-red', partName: 'Đèn đỏ', qty: 10, qtyDone: 10, qtyRejected: 0 },
    { id: 'qa-traffic-pitem-yellow', orderId: trafficOrder.id, orderItemId: 'qa-traffic-item', modelId: trafficModel.id, partId: 'qa-traffic-yellow', partName: 'Đèn vàng', qty: 10, qtyDone: 10, qtyRejected: 0 },
    { id: 'qa-traffic-pitem-green', orderId: trafficOrder.id, orderItemId: 'qa-traffic-item', modelId: trafficModel.id, partId: 'qa-traffic-green', partName: 'Đèn xanh', qty: 10, qtyDone: 9, qtyRejected: 0 },
  );
  normalizeOperations(); goPage('fulfillment', { historyMode: 'none' }); renderFulfillmentPage();
  openWorkshopQualityIssuePicker(trafficOrder.id, 'qa-traffic-item');
  const trafficSelections = [...document.querySelectorAll('.quality-part-select')];
  const trafficQtyInputs = trafficSelections.map(input => document.getElementById(`quality-part-qty-${input.dataset.partId}`));
  trafficSelections.filter(input => ['qa-traffic-pitem-red', 'qa-traffic-pitem-yellow', 'qa-traffic-pitem-green'].includes(input.dataset.partId)).forEach(input => {
    input.checked = true; syncWorkshopQualityIssuePart(input.dataset.partId);
  });
  document.getElementById('quality-part-qty-qa-traffic-pitem-red').value = '2';
  document.getElementById('quality-part-qty-qa-traffic-pitem-yellow').value = '3';
  document.getElementById('quality-part-qty-qa-traffic-pitem-green').value = '2';
  check('QC part cho chọn nhiều part và số lỗi riêng trong một lượt', trafficSelections.length === 4 && trafficQtyInputs.every(input => input) && trafficSelections.filter(input => input.checked).length === 3 && trafficSelections.filter(input => input.checked).every(input => !document.getElementById(`quality-part-qty-${input.dataset.partId}`).disabled), `${trafficSelections.length} part · ${trafficSelections.filter(input => input.checked).length} đã chọn`);
  const trafficIssueResult = recordWorkshopQualityIssues(trafficOrder, trafficOrder.items[0], [
    { partId: 'qa-traffic-pitem-red', qty: 2 }, { partId: 'qa-traffic-pitem-yellow', qty: 3 }, { partId: 'qa-traffic-pitem-green', qty: 2 },
  ], { reason: 'QA', checkedBy: 'QA' });
  operations.qualityIssues.unshift(...(trafficIssueResult?.issues || [])); closeDialog('dlg-mv');
  const trafficRow = fulfillmentWorkshopRows().find(row => row.o?.id === trafficOrder.id);
  const trafficEntries = fulfillmentReprintEntries([trafficRow]);
  const trafficNeed = getQcReprintNeeds().find(need => need.model?.id === trafficModel.id);
  check('QC lỗi chỉ giảm đúng part được chọn, giữ part còn lại nguyên vẹn', ['10','8','7','7'].join(',') === ['qa-traffic-pitem-base','qa-traffic-pitem-red','qa-traffic-pitem-yellow','qa-traffic-pitem-green'].map(id => String(pitems.find(part => part.id === id)?.qtyDone)).join(','), ['qa-traffic-pitem-base','qa-traffic-pitem-red','qa-traffic-pitem-yellow','qa-traffic-pitem-green'].map(id => pitems.find(part => part.id === id)?.qtyDone).join(','));
  check('Part lỗi không kéo cả model rời khỏi QC part', workshopAssemblyStage(trafficRow) === 'part_qc' && workshopNeedsReprint(trafficRow), `${workshopAssemblyStage(trafficRow)} · ${workshopReprintQty(trafficRow)} bộ cần bù`);
  check('Hàng in bù tách theo đúng part lỗi, không gộp thành thẻ model', trafficEntries.length === 3 && ['Đèn đỏ','Đèn vàng','Đèn xanh'].every(name => trafficEntries.some(entry => entry.partName === name)) && trafficEntries.every(entry => entry.partName !== trafficModel.name), trafficEntries.map(entry => `${entry.partName}:${entry.partQty}`).join(' · '));
  check('Nhu cầu in bù của một lượt QC nhiều part chỉ tính bộ thiếu lớn nhất', trafficNeed?.productQty === 3, trafficNeed?.productQty ?? 'không có nhu cầu');
  selectFulfillmentProcessTab('part-qc'); renderFulfillmentPage();
  const trafficQcCard = [...document.querySelectorAll('#fulfillment-stage-part-qc .workshop-item')].find(card => card.textContent.includes(trafficModel.name));
  check('Thẻ QC vẫn cho báo lỗi các part tiếp theo sau lượt đầu', Boolean(trafficQcCard?.querySelector('[data-workshop-action="issue"]')), trafficQcCard?.textContent.replace(/\s+/g, ' ').trim() || 'thiếu thẻ QC');
  check('Thẻ QC cảnh báo rõ part đang fail, tách khỏi part còn thiếu', /Part đang fail: Đèn đỏ × 2 · Đèn vàng × 3 · Đèn xanh × 2 · chờ in bù/.test(trafficQcCard?.textContent || '') && Boolean(trafficQcCard?.querySelector('.workshop-item-failed')), trafficQcCard?.textContent.replace(/\s+/g, ' ').trim() || 'thiếu cảnh báo');
  selectFulfillmentProcessTab('reprint'); renderFulfillmentPage();
  const trafficReprintPartIds = [...document.querySelectorAll('#fulfillment-stage-reprint [data-reprint-part-id]')].map(card => card.dataset.reprintPartId);
  const trafficReprintCards = [...document.querySelectorAll('#fulfillment-stage-reprint [data-reprint-part-id]')];
  check('Tab in bù ghi rõ part báo lỗi và tách tên model trên từng thẻ', trafficReprintCards.filter(card => ['qa-traffic-pitem-red','qa-traffic-pitem-yellow','qa-traffic-pitem-green'].includes(card.dataset.reprintPartId)).every(card => /Part báo lỗi: Đèn (đỏ|vàng|xanh)/.test(card.textContent) && card.textContent.includes('Model: QA · Đèn giao thông') && /cái cần in lại/.test(card.textContent)), trafficReprintCards.map(card => card.textContent.replace(/\s+/g, ' ').trim()).join(' · '));
  check('Tab in bù hiển thị thẻ riêng cho từng part lỗi', ['qa-traffic-pitem-red','qa-traffic-pitem-yellow','qa-traffic-pitem-green'].every(id => trafficReprintPartIds.includes(id)), trafficReprintPartIds.join(' · '));
  orders = orders.filter(order => order.id !== trafficOrder.id);
  models = models.filter(model => model.id !== trafficModel.id);
  pitems = pitems.filter(part => part.orderId !== trafficOrder.id);
  operations.qualityIssues = operations.qualityIssues.filter(issue => issue.orderId !== trafficOrder.id);
  normalizeOperations();

  goPage('inventory', { historyMode: 'none' });
  return rows;
});
const realtimeMigration = readFileSync(join(root, 'supabase', 'migrations', '20260912084151_realtime_operational_sync.sql'), 'utf8');
const publishedCoreTables = ['models','filaments','projects','orders','plates','plate_items','settings','batch_reports'].every(table => realtimeMigration.includes(`'${table}'`));
results.push({
  name: 'Migration publish đủ bảng vận hành vào Supabase Realtime',
  passed: publishedCoreTables && /alter publication supabase_realtime add table/.test(realtimeMigration),
  detail: publishedCoreTables ? '8 bảng vận hành' : 'thiếu bảng publication',
});
/* Desktop thu hẹp không được giữ ba cột khi card còn mang phần khai báo: đây là
   breakpoint dễ bị bỏ sót vì nó không phải mobile, nhưng là nơi copy bị bóp nhất. */
await page.setViewportSize({ width: 760, height: 820 });
const compactEvidence = await page.evaluate(() => {
  const row = fulfillmentWorkshopRows().find(item => item.source === 'external' && item.externalKey === 'qa-model::qa-size-10');
  openWorkshopEvidence(workshopWaitKey(row));
  const grid = document.querySelector('.workshop-evidence-grid');
  const cards = [...document.querySelectorAll('.workshop-evidence-card')];
  const columns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
  const minCardWidth = Math.min(...cards.map(card => card.getBoundingClientRect().width));
  const declarationsFit = cards.every(card => {
    const declaration = card.querySelector('.workshop-evidence-declaration');
    return declaration && declaration.scrollWidth <= declaration.clientWidth + 1;
  });
  closeDialog('dlg-mv');
  return { columns, minCardWidth, declarationsFit, overflow: grid.scrollWidth - grid.clientWidth };
});
results.push({
  name: 'Gallery ảnh minh chứng chuyển 2 cột ở desktop thu hẹp, không bóp nội dung',
  passed: compactEvidence.columns === 2 && compactEvidence.minCardWidth >= 250 && compactEvidence.declarationsFit && compactEvidence.overflow <= 1,
  detail: `${compactEvidence.columns} cột · ${Math.round(compactEvidence.minCardWidth)}px · tràn ${compactEvidence.overflow}px`,
});
/* Ở desktop phóng to, phần mô tả từng ảnh không được bị chính thẻ hoặc vùng
   cuộn của dialog cắt mất. Fixture 9 ảnh tái hiện đúng thư viện dài của xưởng. */
await page.setViewportSize({ width: 1280, height: 900 });
const fullEvidence = await page.evaluate(() => {
  ['d', 'e', 'f', 'g', 'h', 'i'].forEach((suffix, index) => batchReports.push({
    id: `qa-external-evidence-${suffix}`, status: 'done', external: true, externalOrigin: true,
    createdAt: new Date(Date.now() + 10 + index).toISOString(), completedAt: new Date().toISOString(), completedBy: 'QA',
    image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="90"%3E%3Crect width="120" height="90" fill="%232563eb"/%3E%3C/svg%3E',
    manualItems: [{ modelId: 'qa-model', modelName: 'QA · Mô hình kiểm thử', variantId: 'qa-size-10', variantName: 'Size 10cm', partId: 'qa-body', partName: 'Thân', filamentId: fils[0]?.id || '', qty: 1 }], appliedItems: [],
  }));
  const row = fulfillmentWorkshopRows().find(item => item.source === 'external' && item.externalKey === 'qa-model::qa-size-10');
  openWorkshopEvidence(workshopWaitKey(row));
  const dialog = document.querySelector('.workshop-evidence-dialog');
  const grid = document.querySelector('.workshop-evidence-grid');
  const cards = [...document.querySelectorAll('.workshop-evidence-card')];
  const copiesVisible = cards.every(card => {
    const copy = card.querySelector('.workshop-evidence-copy');
    const cardRect = card.getBoundingClientRect(), copyRect = copy?.getBoundingClientRect();
    return copy && copyRect.top >= cardRect.top - 1 && copyRect.bottom <= cardRect.bottom + 1 && copyRect.height > 20;
  });
  const dialogFits = dialog.getBoundingClientRect().bottom <= window.innerHeight + 1;
  const gridScrollable = grid.scrollHeight > grid.clientHeight;
  const firstCard = cards[0], firstCopy = firstCard?.querySelector('.workshop-evidence-copy');
  const firstMedia = firstCard?.querySelector('.workshop-evidence-media');
  const firstCardRect = firstCard?.getBoundingClientRect(), firstCopyRect = firstCopy?.getBoundingClientRect();
  const firstMediaRect = firstMedia?.getBoundingClientRect();
  const cardDisplay = getComputedStyle(firstCard).display, copyPosition = getComputedStyle(firstCopy).position;
  const dialogHeight = Math.round(dialog.getBoundingClientRect().height), dialogCssHeight = getComputedStyle(dialog).height;
  const gridHeight = Math.round(grid.clientHeight), gridScrollHeight = Math.round(grid.scrollHeight), gridFlex = getComputedStyle(grid).flex;
  closeDialog('dlg-mv');
  return { count: cards.length, copiesVisible, dialogFits, gridScrollable, dialogHeight, dialogCssHeight, gridHeight, gridScrollHeight, gridFlex, cardDisplay, copyPosition, firstCardHeight: Math.round(firstCardRect?.height || 0), firstMediaBottom: Math.round(firstMediaRect?.bottom || 0), firstCopyTop: Math.round(firstCopyRect?.top || 0), firstCopyBottom: Math.round(firstCopyRect?.bottom || 0), firstCardBottom: Math.round(firstCardRect?.bottom || 0) };
});
results.push({
  name: 'Gallery ảnh minh chứng phóng to giữ trọn nội dung từng thẻ và cuộn trong dialog',
  passed: fullEvidence.count === 9 && fullEvidence.copiesVisible && fullEvidence.dialogFits && fullEvidence.gridScrollable,
  detail: `${fullEvidence.count} ảnh · copy ${fullEvidence.copiesVisible} · dialog ${fullEvidence.dialogFits}/${fullEvidence.dialogHeight}px/${fullEvidence.dialogCssHeight} · cuộn ${fullEvidence.gridScrollable} · grid ${fullEvidence.gridHeight}/${fullEvidence.gridScrollHeight}/${fullEvidence.gridFlex} · ${fullEvidence.cardDisplay}/${fullEvidence.copyPosition} · thẻ ${fullEvidence.firstCardHeight}px · ảnh đến ${fullEvidence.firstMediaBottom} · copy ${fullEvidence.firstCopyTop}-${fullEvidence.firstCopyBottom}/${fullEvidence.firstCardBottom}`,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const inventoryShot = join(outputDir, `${stamp}-inventory.png`);
await page.screenshot({ path: inventoryShot, fullPage: true });
await page.evaluate(() => window.goPage('fulfillment', { historyMode: 'none' }));
await page.waitForTimeout(200);
const fulfillmentShot = join(outputDir, `${stamp}-fulfillment.png`);
await page.evaluate(() => {
  document.getElementById('toast')?.replaceChildren();
  document.querySelector('.delivery-receipt-overview')?.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(100);
await page.screenshot({ path: fulfillmentShot, fullPage: false });
const receiptShot = join(outputDir, `${stamp}-confirmed-receipt.png`);
await page.locator('.delivery-receipt-overview').screenshot({ path: receiptShot });
await browser.close();

const filteredErrors = consoleErrors.filter(message => !/failed to fetch|net::err|favicon|chưa tải được thư viện kết nối/i.test(message));
const report = {
  createdAt: now.toISOString(),
  mode: 'isolated fixture — không dùng tài khoản hoặc dữ liệu xưởng',
  viewport: 'iPhone 390×844',
  results,
  consoleErrors: filteredErrors,
  screenshots: [`qa-results/workflow/${stamp}-inventory.png`, `qa-results/workflow/${stamp}-fulfillment.png`, `qa-results/workflow/${stamp}-confirmed-receipt.png`],
  summary: { passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length + filteredErrors.length },
};
writeFileSync(join(outputDir, `report-${stamp}.json`), JSON.stringify(report, null, 2));
writeFileSync(join(outputDir, 'latest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: `qa-results/workflow/report-${stamp}.json`, latest: 'qa-results/workflow/latest.json', summary: report.summary, failures: [...results.filter(row => !row.passed), ...filteredErrors.map(message => ({ name: 'JavaScript console', passed: false, detail: message }))] }, null, 2));
process.exitCode = report.summary.failed ? 1 : 0;
