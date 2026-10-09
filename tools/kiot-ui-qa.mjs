import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';

// Isolated data and blocked network: this guard never reads or changes live Kiot data.
const out=resolve('qa-results/kiot-workspace');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const width of [320,390,768,1024,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route(/^https?:/,route=>route.abort());const page=await context.newPage(),errors=[];
  await context.route('https://qa.invalid/model.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#bc98e8"/><circle cx="30" cy="30" r="18" fill="#ddd1f8"/></svg>'}));
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(resolve(process.env.KIOT_QA_FILE||'plate-studio.html')).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.setProperty('display','none','important');
   cloudReady=false;currentUser=null;sb=null;canAccess=()=>true;
   orders=[];pitems=[];batchReports=[];operations={products:[],deliveries:[],deliveryBatches:[],qualityIssues:[]};normalizeOperations();
   models=[{id:'m',name:'Lót ly hoa',images:['https://qa.invalid/model.svg'],parts:[],variants:[{id:'v',name:'Hoa tím'}]}];
   kiotViet={catalog:Array.from({length:420},(_,i)=>({sku:'QA'+i,name:i===0?'Lót ly hoa tên dài để kiểm tra giao diện trên điện thoại':'Sản phẩm '+i,category:'Đồ trang trí',stock:i,imageUrl:i===1?'https://qa.invalid/missing.png':''})),mappings:[{sku:'QA0',modelId:'m',modelName:'Lót ly hoa',variantId:'v',variantName:'Hoa tím'}],snapshots:[],sales:[],salesImports:[{id:'day',period:{from:'2026-10-08',to:'2026-10-08'},sales:[{sku:'QA0',name:'Lót ly hoa',qty:3,revenue:120000}]}],aiInsights:[],skippedSkus:[]};
   kiotInventoryLedger={...kiotInventoryLedger,loaded:true,movements:[]};kiotChromeSync={status:'idle',detail:''};kiotDailySchedule={available:false,enabled:true};
   kiotCatalogQuery='';kiotCatalogLinkFilter='all';kiotSalesArchiveLoaded=true;salesPageReportId='day';salesPageDatePreset='all';
   window.bridgeCalls=0;refreshKiotDailySchedule=async()=>{bridgeCalls++;};
   goPage('kiotviet',{historyMode:'none'});
   window.originalInput=document.getElementById('kv-search');window.originalRow=document.querySelector('[data-kv-sku="QA0"]');window.originalImage=originalRow.querySelector('img');
   window.originalCatalog=JSON.stringify(kiotViet);
  },theme);
  assert.equal(await page.locator('.kv-sync-workspace').count(),1,'One coherent sync workspace');
  assert.equal(await page.locator('.kv-row').count(),100,'Large catalog paginates');
  await page.waitForFunction(()=>originalImage?.complete&&originalImage.naturalWidth>0);
  await page.waitForFunction(()=>!document.querySelector('[data-kv-sku="QA1"] img'));
  assert.equal(await page.locator('[data-kv-sku="QA1"] .kv-row-thumb svg').count(),1,'Broken image keeps fallback frame');
  assert.match(await page.locator('#kiot-daily-schedule').textContent(),/Chưa kết nối/);
  assert.doesNotMatch(await page.locator('#kiot-daily-schedule').textContent(),/Đang bật/);
  assert.match(await page.locator('#kiot-inventory-control').textContent(),/Chưa có snapshot/);
  assert.doesNotMatch(await page.locator('#kiot-inventory-control').textContent(),/Đã khớp/);
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,controls:[...document.querySelectorAll('.kv-sync-workspace button,.kv-sync-workspace summary')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})).filter(e=>e.height<43.99||e.width<43.99)}));
  assert.equal(geometry.overflow,false,`${width}/${theme}: horizontal overflow`);assert.deepEqual(geometry.controls,[],`${width}/${theme}: touch targets`);
  const contrast=await new AxeBuilder({page}).include('.kv-sync-workspace').withRules(['color-contrast']).analyze();
  assert.deepEqual(contrast.violations,[],`${width}/${theme}: text contrast`);
  await page.screenshot({path:resolve(out,`${width}-${theme}-top.png`)});
  await page.locator('#kv-search').fill('lot ly');await page.waitForTimeout(250);
  assert.equal(await page.locator('.kv-row').count(),1,'Vietnamese accent-insensitive query');
  assert.deepEqual(await page.evaluate(()=>[originalInput===document.getElementById('kv-search'),originalInput===document.activeElement,originalRow===document.querySelector('[data-kv-sku="QA0"]'),originalImage===originalRow.querySelector('img'),bridgeCalls]),[true,true,true,true,1]);
  await page.locator('#kv-search').fill('hoa tim');await page.waitForTimeout(250);assert.equal(await page.locator('.kv-row').count(),1,'Variant searchable');
  await page.evaluate(()=>{originalInput.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));originalInput.value='Đồ';originalInput.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
  await page.waitForTimeout(220);assert.equal(await page.locator('.kv-row').count(),1,'IME does not redraw midway');
  await page.evaluate(()=>originalInput.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'Đồ'})));await page.waitForTimeout(250);
  assert.equal(await page.locator('.kv-row').count(),100);
  await page.locator('#kv-sync-clear').click();await page.locator('[data-filter="unlinked"]').click();assert.equal(await page.locator('[data-kv-sku="QA0"]').count(),0);
  await page.locator('#kv-sync-clear').click();await page.locator('#kv-sync-more').click();assert.equal(await page.locator('.kv-row').count(),200);
  await page.locator('#kv-search').fill('QA419');await page.waitForTimeout(250);assert.equal(await page.locator('[data-kv-sku="QA419"]').count(),1,'Search includes records beyond first page');
  await page.locator('#kv-search').fill('nothing-matches');await page.waitForTimeout(250);assert.match(await page.locator('.kv-list').textContent(),/Không có kết quả/);
  await page.locator('#kv-sync-clear').click();
  await page.evaluate(()=>{const details=document.querySelector('.kv-sync-extra');details.open=true;window.focusedInput=document.getElementById('kv-search');focusedInput.focus();focusedInput.setSelectionRange(0,0);renderKiotVietPage();});
  assert.deepEqual(await page.evaluate(()=>[document.querySelector('.kv-sync-extra').open,focusedInput===document.activeElement,originalImage===originalRow.querySelector('img'),JSON.stringify(kiotViet)===originalCatalog]),[true,true,true,true],'Background refresh preserves UI and source data');
  await page.evaluate(()=>{window.mappingButton=originalRow.querySelector('button');mappingButton.focus();kiotViet.catalog[0].stock=19;renderKiotVietPage();});
  assert.match(await page.locator('[data-kv-sku="QA0"] .kv-row-copy').textContent(),/Tồn 19/);
  assert.deepEqual(await page.evaluate(()=>[originalImage===originalRow.querySelector('img'),mappingButton===document.activeElement]),[true,true],'Changed stock patches copy while preserving thumbnail and button focus');
  await page.evaluate(()=>{kiotChromeSync={status:'running',detail:'Đang tạo báo cáo…'};updateKiotChromeSyncUI();});assert.equal(await page.locator('#kiot-chrome-sync-button').isDisabled(),true);
  await page.evaluate(()=>{kiotChromeSync={status:'error',detail:'Chrome không phản hồi'};updateKiotChromeSyncUI();});assert.equal(await page.locator('#kiot-chrome-sync-button').isDisabled(),false);assert.match(await page.locator('#kiot-chrome-sync-button').textContent(),/Thử lại/);
  // Verify every principal action still reaches its established handler, without performing imports.
  await page.evaluate(()=>{window.actions=[];for(const name of ['startKiotSalesChromeSync','openManualKiotSalesDialog','openKiotSalesRangeDialog','openKiotMappingDialog','openKiotInventoryLedgerDialog','openKiotInventoryAdjustmentDialog'])window[name]=(...args)=>actions.push([name,...args]);});
  for(const label of ['Thử lại Hôm qua','Nhập file theo ngày','Bù ngày thiếu','Sửa ghép','Xem sổ','Ghi điều chỉnh'])await page.getByRole('button',{name:label,exact:true}).first().click();
  assert.deepEqual(await page.evaluate(()=>actions.map(a=>a[0])),['startKiotSalesChromeSync','openManualKiotSalesDialog','openKiotSalesRangeDialog','openKiotMappingDialog','openKiotInventoryLedgerDialog','openKiotInventoryAdjustmentDialog']);
  assert.equal(await page.locator('#kiot-catalog-input').getAttribute('onchange'),'importKiotCatalogFile(this)');
  assert.equal(await page.locator('#kiot-sales-input').getAttribute('onchange'),'importKiotSalesFile(this)');
  await page.evaluate(()=>{
   kiotViet.salesImports[0].detailError='Không tải được chi tiết';window.retryCalls=0;
   ensureModelKiotSales=async force=>{if(force)retryCalls++;};renderKiotVietPage();
   document.getElementById('kv-sync-sales').closest('details').open=true;
  });
  await page.getByRole('button',{name:'Tải lại chi tiết',exact:true}).click();
  assert.equal(await page.evaluate(()=>retryCalls),1);
  assert.equal(await page.locator('#kv-sync-sales-retry').isDisabled(),false,'Retry remains available after repeated failure');
  await page.evaluate(()=>{delete kiotViet.salesImports[0].detailError;renderKiotVietPage();});
  assert.equal(await page.locator('#kv-sync-sales-retry').count(),0,'Recovered report clears error action');
  await page.evaluate(()=>{
   operations.deliveryBatches=[{id:'delivery',deliveredAt:'2026-10-08',items:[{modelId:'m',variantId:'v',modelName:'Lót ly hoa',variantName:'Hoa tím',qty:2},{modelId:'other',modelName:'Hàng chưa ghép',qty:1}]}];
   renderKiotVietPage();
  });
  assert.equal(await page.locator('.kv-delivery').count(),2);
  assert.equal(await page.getByRole('button',{name:'Đã vào Kiot',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Chọn SKU',exact:true}).count(),1);
  assert.equal(await page.locator('.kv-delivery img').count(),1,'Delivery uses model thumbnail');
  await page.evaluate(()=>{
   window.deliveryActions=[];reconcileKiotDeliveryItem=(...args)=>deliveryActions.push(args);openKiotDeliverySkuPicker=(...args)=>deliveryActions.push(args);
  });
  await page.getByRole('button',{name:'Đã vào Kiot',exact:true}).click();await page.getByRole('button',{name:'Chọn SKU',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>deliveryActions),[['delivery',0],['delivery',1]]);
  await page.evaluate(()=>{
   kiotViet.snapshots=[{id:'baseline',importedAt:'2026-10-08T10:00:00Z',stockBySku:{QA0:9}}];renderKiotVietPage();
  });
  assert.match(await page.locator('#kiot-inventory-control').textContent(),/Mốc ban đầu/);
  assert.doesNotMatch(await page.locator('#kiot-inventory-control').textContent(),/Đã khớp/);
  await page.evaluate(()=>{
   kiotViet.catalog=[];kiotViet.mappings=[];renderKiotVietPage();
  });
  assert.match(await page.locator('.kv-list').textContent(),/Chưa có danh mục/);
  assert.equal(await page.locator('#kiot-catalog-input').count(),1,'Import remains accessible in empty state');
  await page.locator('#kv-sync-catalog').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`${width}-${theme}-catalog.png`)});
  assert.deepEqual(errors,[]);console.log(`PASS Kiot workspace ${width}/${theme}: hierarchy, states, touch, search/IME, pagination, preserved DOM, handlers, no source mutation`);
  await context.close();
 }
}finally{await browser.close();}
