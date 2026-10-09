import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
const out=resolve('qa-results/model-sales');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [390,1280])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await context.route(/^https?:/,route=>route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.getElementById('auth-ov').style.setProperty('display','none','important');cloudReady=false;currentUser=null;sb=null;
  orders=[];pitems=[];batchReports=[];operations={products:[],deliveries:[],deliveryBatches:[],qualityIssues:[]};normalizeOperations();
  models=[{id:'flower',name:'Flower Coasters',createdAt:'2026-10-01',images:['data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="pink"/></svg>')],variants:[],parts:[{id:'flower-part',name:'Lót ly hoa',qtyPerModel:1}]}];
  kiotSalesDetailCache={};kiotSalesArchiveLoaded=true;kiotSalesArchiveAvailable=true;modelKiotReadError='';salesPageReportId='day';salesPageDatePreset='all';
  kiotViet={catalog:[{sku:'SP012001',name:'Lót ly hoa',stock:9}],mappings:[{sku:'SP012001',modelId:'flower',modelName:'Flower Coasters'}],sales:[{sku:'SP012001',qty:999,revenue:999}],salesImports:[{id:'day',period:{from:'2026-10-08',to:'2026-10-08'},archiveRevision:'r1',skuCount:1,qtyTotal:3,revenueTotal:131552}],snapshots:[],aiInsights:[]};
  kiotSalesDetailCache.day={revision:'r1',sales:[{sku:'SP012001',name:'Lót ly hoa',qty:3,revenue:131552}]};
  viewModel('flower');window.photoNode=document.querySelector('#dlg-mv .model-detail-images img');
 },theme);
 assert.equal(await page.locator('[data-model-sold]').textContent(),'3');assert.match(await page.locator('[data-model-revenue]').textContent(),/131[.,]552/);
 assert.match(await page.locator('[data-model-sales-period]').textContent(),/08\/10\/2026/);
 assert.deepEqual(await page.evaluate(()=>{const a=salesPageRows(salesPageReport())[0],b=getModelKiotMetrics('flower');return [a.qty,b.sold,a.revenue,b.revenue,modelKiotVariantRows(models[0])[0].shopStock];}),[3,3,131552,131552,9]);
 await page.evaluate(()=>{kiotViet.sales=[];renderKiotVietPage();});assert.equal(await page.locator('.kv-sales-row b').textContent(),'3 bán');assert.equal(await page.locator('.kv-summary').first().locator('.kv-kpi').nth(3).locator('b').textContent(),'1');
 // A cache with another revision must not masquerade as current details.
 await page.evaluate(()=>{
  delete kiotViet.salesImports[0].sales;kiotViet.salesImports[0].detailLoaded=false;kiotSalesDetailCache.day.revision='old';
  currentUser={id:'qa'};canAccess=()=>true;cloudWorkspaceId=()=> 'qa';loadKiotSalesArchiveIndex=async()=>{kiotSalesArchiveLoaded=true;return kiotViet.salesImports;};
  window.calls=0;window.payloads=[];window.releaseLines=null;
  sb={from:table=>({select(){return this},eq(){return this},order(){return this},range:async()=>{calls++;if(calls===1)return await new Promise(resolve=>window.releaseLines=()=>resolve({data:[{sku:'SP012001',name:'Lót ly hoa',quantity:3,revenue:131552}]}));return {data:[]};},single:async()=>({data:{updated_at:'r1'}})}),functions:{invoke:async(name,args)=>{payloads.push(args.body);return {data:{analysis:{summary:'QA',badges:[],recommendations:[]}}};}}};
  saveKiotViet=()=>{};refreshModelKiotCard('flower');patchModelKiotCard('flower');
 });
 await page.waitForFunction(()=>typeof releaseLines==='function');assert.equal(await page.locator('[data-model-sold]').textContent(),'—');
 assert.equal(await page.evaluate(()=>getModelKiotMetrics('flower').sold),null);
 await page.evaluate(()=>{document.querySelector('.model-kiot-detail-wrap').scrollLeft=160;window.keptLeft=document.querySelector('.model-kiot-detail-wrap').scrollLeft;releaseLines();});
 await page.waitForFunction(()=>document.querySelector('[data-model-sold]')?.textContent==='3');
 assert.ok(await page.evaluate(()=>photoNode===document.querySelector('#dlg-mv .model-detail-images img')),'Archive refresh preserves photo DOM');
 assert.equal(await page.evaluate(()=>document.querySelector('.model-kiot-detail-wrap').scrollLeft),await page.evaluate(()=>keptLeft));
 await page.evaluate(()=>analyzeKiotProduct('flower'));
 assert.deepEqual(await page.evaluate(()=>[payloads[0].metrics.sold,payloads[0].metrics.revenue,payloads[0].metrics.salesReportAt]),[3,131552,'2026-10-08 – 2026-10-08']);
 // Selected old report and stale AI cannot silently use the newest period.
 await page.evaluate(()=>{kiotViet.salesImports.push({id:'old-day',period:{from:'2026-09-01',to:'2026-09-01'},sales:[{sku:'SP012001',qty:7,revenue:700}]});salesPageReportId='old-day';patchModelKiotCard('flower');});
 assert.equal(await page.locator('[data-model-sold]').textContent(),'7');assert.equal(await page.locator('.model-kiot-ai-badges').count(),0);
 await page.evaluate(()=>{salesPageDatePreset='custom';salesPageCustomRange={from:'2026-10-08',to:'2026-10-08'};patchModelKiotCard('flower');});assert.equal(await page.locator('[data-model-sold]').textContent(),'3','Date filtering chooses the same fallback report as Sales');
 // Genuine loaded zero is distinct from unknown/error. Retry uses the archive.
 await page.evaluate(()=>{salesPageDatePreset='all';salesPageReportId='zero';kiotViet.salesImports.push({id:'zero',period:{from:'2026-10-07',to:'2026-10-07'},sales:[],skuCount:0,detailLoaded:true});patchModelKiotCard('flower');});assert.equal(await page.locator('[data-model-sold]').textContent(),'0');
 await page.evaluate(()=>{salesPageReportId='day';const report=kiotViet.salesImports[0];delete report.sales;report.detailLoaded=false;report.detailError='Mất kết nối QA';delete kiotSalesDetailCache.day;patchModelKiotCard('flower');});
 assert.equal(await page.locator('[data-model-sold]').textContent(),'—');await page.evaluate(()=>analyzeKiotProduct('flower'));assert.equal(await page.evaluate(()=>payloads.length),1,'AI cannot consume unknown as zero');await page.evaluate(()=>closeDialog('dlg-action'));
 await page.locator('[data-model-kiot-retry]').click();await page.waitForFunction(()=>!modelKiotReadRequest);assert.equal(await page.locator('[data-model-sold]').textContent(),'—','Incomplete pagination is not a genuine zero');
 await page.evaluate(()=>{sb.from=table=>({select(){return this},eq(){return this},order(){return this},range:async()=>({error:{message:'Lỗi mạng QA'}})});});await page.locator('[data-model-kiot-retry]').click();await page.waitForFunction(()=>!modelKiotReadRequest);
 assert.match(await page.locator('.model-kiot-card [role=status]').textContent(),/Lỗi mạng QA/);assert.equal(await page.locator('[data-model-sold]').textContent(),'—');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.locator('[data-model-kiot-retry]').evaluate(el=>el.getBoundingClientRect().height>=44));
 await page.screenshot({path:resolve(out,`${width}-${theme}-error.png`)});
 await page.evaluate(()=>{const report=kiotViet.salesImports[0];report.sales=[{sku:'SP012001',qty:3,revenue:131552}];delete report.detailError;report.detailLoaded=true;patchModelKiotCard('flower');});
 await page.screenshot({path:resolve(out,`${width}-${theme}-ready.png`)});
 await page.evaluate(()=>{canAccess=()=>false;patchModelKiotCard('flower');});assert.match(await page.locator('.model-kiot-card').textContent(),/Không có quyền/);assert.equal(await page.locator('[data-model-sold]').count(),0);
 // Unknown metadata without SKU count is still not a genuine zero.
 assert.equal(await page.evaluate(()=>{canAccess=()=>true;return kiotSalesSnapshot({id:'metadata-only',sales:[],qtyTotal:3}).ready;}),false);
 // Late callbacks must not reopen closed dialogs or replace another model.
 await page.evaluate(async()=>{closeDialog('dlg-mv');await refreshModelKiotCard('flower');});assert.equal(await page.locator('#dlg-mv').isVisible(),false);
 await page.evaluate(()=>{models.push({id:'other',name:'Other model',images:[],parts:[],variants:[]});viewModel('other');});
 await page.evaluate(()=>patchModelKiotCard('flower'));assert.match(await page.locator('#dlg-mv .dlg-title').textContent(),/Other model/);
 const changedScope=await page.evaluate(async()=>{
  salesPageReportId='day';const report=kiotViet.salesImports[0];delete report.sales;delete report.detailError;report.detailLoaded=false;delete kiotSalesDetailCache.day;
  let resolvePage;sb.from=()=>({select(){return this},eq(){return this},order(){return this},range:()=>new Promise(resolve=>resolvePage=resolve)});
  const original=refreshModelKiotCard('other');await new Promise(resolve=>setTimeout(resolve,0));currentUser={id:'another-user'};cloudWorkspaceId=()=> 'another-workspace';
  resolvePage({error:{message:'Late old workspace error'}});await original;
  return {error:modelKiotReadError,title:document.querySelector('#dlg-mv .dlg-title').textContent};
 });assert.equal(changedScope.error,'');assert.match(changedScope.title,/Other model/);
 // Actual reload with lean cloud settings (flat sales cleared) and durable cache.
 await page.evaluate(()=>{
  const report={id:'day',archiveMigrated:true,archiveRevision:'r1',period:{from:'2026-10-08',to:'2026-10-08'},skuCount:1,qtyTotal:3,revenueTotal:131552,sales:[{sku:'SP012001',name:'Lót ly hoa',qty:3,revenue:131552}]};
  kiotViet.salesImports=[report];kiotSalesArchiveReadyForSettings=true;
  saveLocalValue(K.models,models);saveLocalValue(K.kiotViet,kiotVietForCloudSettings());saveLocalValue(K.kiotSalesDetails,{day:{revision:'r1',sales:report.sales}});
 });await page.reload({waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{currentUser=null;sb=null;cloudReady=false;document.getElementById('auth-ov').style.setProperty('display','none','important');viewModel('flower');});
 assert.equal(await page.evaluate(()=>kiotViet.sales.length),0);assert.equal(await page.locator('[data-model-sold]').textContent(),'3','Reload reads archive cache, not erased flat sales');
 assert.deepEqual(errors,[]);console.log(`PASS model sales ${width}/${theme}: archive/cache revision, 3 vs 0 regression, period, lazy load, retry, AI payload, unknown vs zero, permission, preserved DOM/scroll`);await context.close();
}}finally{await browser.close();}
