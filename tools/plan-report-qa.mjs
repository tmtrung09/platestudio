import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const executablePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(existsSync);
mkdirSync('qa-results/plan-report',{recursive:true});
const browser=await chromium.launch({executablePath,headless:true});
try{
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:850}});await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();await page.goto(pathToFileURL(resolve('plate-studio.html')).href);
  await page.addStyleTag({content:'#auth-ov{display:none!important}'});
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;currentUser=null;cloudReady=false;
   canEditBatchReports=()=>true;canDescribeBatchReports=()=>true;recordSystemEvent=()=>{};recordAudit=()=>{};
   orders=[];pitems=[];plates=[];operations={};
   fils=[{id:'f',name:'Trắng',hex:'#ffffff',brand:'PLA'}];
   models=[{id:'bao',name:'Bánh bao',parts:[{id:'bun',name:'Bánh',filamentIds:['f']},{id:'tray',name:'Xửng',filamentIds:['f']}],variants:[]}];
   const plan=getNightPrintPlan('2026-09-19');plan.id='night-19';plan.machines.lucifer.plate={id:'plate-19',items:[{modelId:'bao',partId:'bun',variantId:null,filamentId:'f',qty:10},{modelId:'bao',partId:'tray',variantId:null,filamentId:'f',qty:10}]};
   getNightPrintPlan('2026-09-20').machines.lucifer.plate={id:'next-night',items:[{modelId:'bao',partId:'bun',filamentId:'f',qty:4}]};
   batchReports=[{id:'report-20',status:'pending',createdAt:'2026-09-20T08:00:00+07:00',recordedAt:'2026-09-20',image:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#888"/></svg>')}];
   brCurrentId='report-20';brView='color';document.getElementById('ov-batch-report').style.display='flex';renderBatchReport();
  },theme);
  await page.locator('.br-machine-plan select').selectOption('lucifer');
  assert.equal(await page.evaluate(()=>batchReports[0].planReview.planId),'night-19','Morning report defaults to previous night, not the coming night');
  assert.equal(await page.locator('[data-plan-actual]').count(),2,'All planned parts prefilled');
  const overflow=await page.locator('.br-plan-review').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false,`${width}/${theme} no report overflow`);
  assert.equal(await page.locator('.br-plan-stepper button').evaluateAll(elements=>elements.every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;})),true,'All report quantity targets are usable');
  await page.getByRole('spinbutton',{name:'Lỗi dòng 1',exact:true}).fill('2');
  assert.equal(await page.getByRole('spinbutton',{name:'Đạt dòng 1',exact:true}).inputValue(),'8');
  await page.locator('[data-plan-actual="1"]').getByRole('button',{name:'Chưa in cả dòng'}).click();
  assert.equal(await page.locator('[data-plan-actual="1"] output').textContent(),'Chưa in: 10');
  const draft=await page.evaluate(()=>({retry:getPlanRetryNeeds().length,stored:JSON.parse(localStorage.getItem(K.batchReports))[0].planReview.rows[0].failedQty}));
  assert.deepEqual(draft,{retry:0,stored:2},'Draft survives reload but creates no retry demand');
  await page.evaluate(()=>{batchReports=JSON.parse(localStorage.getItem(K.batchReports));brView='manual';renderBatchReport();});
  assert.equal(await page.getByRole('spinbutton',{name:'Đạt dòng 1',exact:true}).inputValue(),'8','Reopening a saved draft does not replace actual quantities with planned quantities');
  await page.screenshot({path:`qa-results/plan-report/${width}-${theme}.png`});
  await page.getByRole('button',{name:'Xác nhận thực tế'}).click();
  const saved=await page.evaluate(()=>({goods:batchReports[0].manualItems.map(i=>({part:i.partId,qty:i.qty})),result:printPlanResults()['plate-19'].rows.map(r=>[r.goodQty,r.failedQty,r.unprintedQty]),retry:getPlanRetryNeeds().map(r=>r.qty),scheduled:scheduledPrintQtyByKey().get('bao::base::bun::f'),cloud:getCloudCollections().settings.find(r=>r.id==='operations').values.printPlanResults['plate-19'].reportId}));
  assert.deepEqual(saved,{goods:[{part:'bun',qty:8}],result:[[8,2,0],[0,0,10]],retry:[2,10],scheduled:4,cloud:'report-20'},'Only good quantity enters production; failed/unprinted persist in cloud payload and finished plate no longer reserves stock');
  const lifecycle=await page.evaluate(()=>{
   const report=batchReports[0];commitBatchPlanResult(report);const repeated=getPlanRetryNeeds().map(row=>row.qty);
   setPrintPlanResultVoided(report,true);const deleted=getPlanRetryNeeds().length;setPrintPlanResultVoided(report,false);const restored=getPlanRetryNeeds().map(row=>row.qty);
   activePrintPlanDate='2026-09-19';clearNightPlanMachine('lucifer');const kept=!!getNightPrintPlan().machines.lucifer.plate;
   const source=report.planReview.rows[0];source.goodQty=99;const invalid=validateBatchPlanReview(report);source.goodQty=8;
   return {repeated,deleted,restored,kept,invalid};
  });assert.deepEqual(lifecycle,{repeated:[2,10],deleted:0,restored:[2,10],kept:true,invalid:false},'Idempotent confirmation, trash/restore, finished-plan protection and invalid-total guard');
  const duplicate=await page.evaluate(()=>{batchReports.push({id:'duplicate',machineId:'lucifer',printPlanId:'night-19',recordedAt:'2026-09-20'});brCurrentId='duplicate';useBatchMachinePlan();return !!batchReports[1].planReview;});
  assert.equal(duplicate,false,'A second photo cannot report the same plate twice');
  await page.evaluate(()=>{brCurrentId='report-20';commitBatchPlanResult(batchReports[0]);activePrintPlanDate='2026-09-21';openNightPlanEditor('lucifer');});
  await page.getByRole('tab',{name:/In lại/}).click();await page.locator('.pp-picker-card:visible').click();
  assert.equal(await page.locator('#pp-plan-qty').inputValue(),'2');await page.locator('.pp-picker-add').click();await page.getByRole('button',{name:'Lưu plate',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>getPlanRetryNeeds().map(r=>r.qty)),[10],'Replanned two failed parts are reserved once');
  const retried=await page.evaluate(()=>{
   const plan=getNightPrintPlan('2026-09-21'),plate=plan.machines.lucifer.plate;
   batchReports.push({id:'retry-report',machineId:'lucifer',printPlanId:plan.id,recordedAt:'2026-09-22',status:'pending'});brCurrentId='retry-report';useBatchMachinePlan();updateBatchPlanActual(0,'failedQty',1);saveBatchPlanReview();
   const results=Object.values(printPlanResults());
   // Simulate the next device: only persisted operations and reports are available.
   operations=JSON.parse(localStorage.getItem(K.operations));batchReports=[];
   return {demands:getPlanRetryNeeds().map(r=>r.qty).sort((a,b)=>a-b),results:results.length};
  });
  assert.deepEqual(retried,{demands:[1,10],results:2},'Retry failure creates only one new deficit, including after cloud-shaped JSON roundtrip with report pagination');
  const zero=await page.evaluate(()=>{
   const plan=getNightPrintPlan('2026-09-23');plan.machines.lucifer.plate={id:'zero-plate',items:[{modelId:'bao',partId:'bun',filamentId:'f',qty:10}]};
   batchReports=[{id:'zero',status:'pending',recordedAt:'2026-09-24',machineId:'lucifer',printPlanId:plan.id}];brCurrentId='zero';useBatchMachinePlan();updateBatchPlanActual(0,'unprinted',0);saveBatchPlanReview();return {goods:batchReports[0].manualItems.length,missing:printPlanResults()['zero-plate'].rows[0].unprintedQty};
  });assert.deepEqual(zero,{goods:0,missing:10},'Entirely unprinted plate stays zero, never coerced to one');
  const limited=await page.evaluate(()=>{
   const plan=getNightPrintPlan('2026-09-25');plan.machines.lucifer.plate={id:'staff-plate',items:[{modelId:'bao',partId:'bun',filamentId:'f',qty:10}]};batchReports=[{id:'staff',status:'pending',recordedAt:'2026-09-26',machineId:'lucifer',printPlanId:plan.id}];brCurrentId='staff';canEditBatchReports=()=>false;useBatchMachinePlan();updateBatchPlanActual(0,'failedQty',2);saveBatchPlanReview();return {status:batchReports[0].status,good:batchReports[0].manualItems[0].qty,confirmed:!!printPlanResults()['staff-plate']};
  });assert.deepEqual(limited,{status:'pending',good:8,confirmed:false},'Declaration-only staff cannot silently approve production or retry demand');
  console.log(`PASS plan report ${width}/${theme}: previous-night prefill, actual quantities, retry lifecycle, duplicates, draft/cloud roundtrip, zero production, permissions`);
  await context.close();
 }
}finally{await browser.close();}
