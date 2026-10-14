import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('qa-results/sales-range');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390,640,1280])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await context.route(/^https?:/,route=>route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.setProperty('display','none','important');cloudReady=false;currentUser=null;sb=null;canAccess=()=>true;kiotSalesArchiveLoaded=true;kiotSalesDetailCache={};
  orders=[];pitems=[];batchReports=[];operations={products:[],deliveries:[],deliveryBatches:[],qualityIssues:[]};normalizeOperations();
  models=[{id:'flower',name:'Flower Coasters',images:[],variants:[],parts:[{id:'part',name:'Lót ly hoa',qtyPerModel:1}]}];
  kiotSalesRangeToday=()=> '2026-10-14';kiotViet={catalog:[{sku:'A',name:'Lót ly hoa',stock:1}],mappings:[{sku:'A',modelId:'flower'}],sales:[],salesImports:Array.from({length:45},(_,i)=>{const day=salesPageShiftDay('2026-10-14',-i);return {id:'day-'+i,period:{from:day,to:day},sales:[{sku:'A',name:'Lót ly hoa',category:'Decor',qty:i+1,revenue:(i+1)*100},{sku:'B',name:'Sản phẩm có tên dài để kiểm tra bố cục trên màn hình nhỏ',category:'Decor',qty:2,revenue:200}]};}),snapshots:[],aiInsights:[]};
  window.rangeOriginal=JSON.stringify(kiotViet);salesPageDatePreset='all';salesPageCalendarOpen=false;salesPageReportId='day-30';goPage('sales',{historyMode:'none'});
 },theme);
 assert.equal(await page.locator('#sales-period').count(),0);assert.equal(await page.locator('.sales-kpi b').nth(0).textContent(),'1.125');assert.equal(await page.locator('.sales-kpi b').nth(1).textContent(),'2');
 assert.equal(await page.locator('.sales-product-value b').first().textContent(),'1.035 bán');assert.equal(await page.locator('.sales-chart-bar').count(),45);
 await page.getByRole('button',{name:'7 ngày trước',exact:true}).click();assert.equal(await page.locator('.sales-kpi b').first().textContent(),'42');assert.equal(await page.locator('.sales-chart-bar').count(),7);
 assert.equal(await page.evaluate(()=>getModelKiotMetrics('flower').sold),28);assert.equal(await page.evaluate(()=>modelKiotVariantRows(models[0])[0].sold),28);
 await page.evaluate(()=>{window.plannedQty=0;openModelPartPlanPicker=(modelId,qty)=>window.plannedQty=qty;openSalesRestockPlan('A','sales-range');});assert.equal(await page.evaluate(()=>plannedQty),28);
 await page.getByRole('button',{name:'Danh sách đầy đủ',exact:true}).click();assert.match(await page.locator('#dlg-mv').textContent(),/08\/10\/2026 – 14\/10\/2026/);assert.equal(await page.locator('#dlg-mv .kiot-sales-history-row').count(),2);await page.getByRole('button',{name:'Đóng',exact:true}).last().click();
 await page.locator('.sales-chart-bar').first().click();assert.match(await page.locator('#dlg-mv').textContent(),/08\/10\/2026 – 08\/10\/2026/);await page.getByRole('button',{name:'Đóng',exact:true}).last().click();assert.equal(await page.locator('.sales-kpi b').first().textContent(),'42');assert.equal(await page.evaluate(()=>salesPageDatePreset),'last-7');
 await page.getByRole('button',{name:'Khoảng ngày',exact:true}).click();await page.locator('#sales-page time[datetime="2026-10-13"]').click();await page.locator('#sales-page time[datetime="2026-10-14"]').click();assert.equal(await page.locator('.sales-kpi b').first().textContent(),'7');
 const toggle=page.getByRole('button',{name:'Đóng lịch',exact:true});await toggle.focus();await page.evaluate(()=>renderSalesPage());assert.equal(await page.getByRole('button',{name:'Đóng lịch',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Tất cả',exact:true}).click();assert.equal(await page.locator('.sales-kpi b').first().textContent(),'1.125');
 await page.evaluate(()=>{document.querySelector('#sales-page').closest('.pg-content').scrollTop=0;});await page.waitForTimeout(350);await page.screenshot({path:resolve(out,`${width}-${theme}-ready.png`)});
 assert.equal(await page.evaluate(()=>JSON.stringify(kiotViet)===rangeOriginal),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // One unloaded report must not silently turn detail/AI/restock into partial totals.
 await page.evaluate(()=>{delete kiotViet.salesImports[0].sales;kiotViet.salesImports[0].qtyTotal=1;kiotViet.salesImports[0].revenueTotal=100;kiotViet.salesImports[0].skuCount=1;kiotViet.salesImports[0].detailError='Mất mạng QA';renderSalesPage();});
 assert.equal(await page.locator('.sales-kpi b').nth(1).textContent(),'—');assert.equal(await page.evaluate(()=>getModelKiotMetrics('flower').sold),null);assert.equal(await page.locator('.sales-product-copy').count(),0);assert.equal(await page.getByRole('button',{name:'Danh sách đầy đủ',exact:true}).isDisabled(),true);
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS range UI ${width}/${theme}: aggregate, SKU/category/model, restock amount, report drilldown, calendar, focus, source immutability, unknown detail and overflow`);
}}finally{await browser.close();}
