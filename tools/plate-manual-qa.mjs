import {waitForAppReady} from './app-ready-qa.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
mkdirSync('qa-results/plate-manual',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390,1440])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
 await context.addInitScript(()=>{
  const schedule=window.setTimeout.bind(window);
  window.setTimeout=(callback,delay,...args)=>{
   if(delay===2000&&typeof callback==='function'&&callback.toString().replace(/\s/g,'')==='()=>resume()')
    return schedule(async()=>{try{await callback(...args);}finally{window.qaPrintFileStartupSettled=true;}},delay);
   return schedule(callback,delay,...args);
  };
 });
 await context.route(/^https?:/,r=>r.abort());page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await waitForAppReady(page);
 await page.waitForFunction(()=>!!window.PlatePlanFiles);
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');currentUser=null;cloudReady=false;
  operations={};models=[{id:'known',name:'Model thư viện',parts:[{id:'body',name:'Thân',filamentIds:['white']}]}];fils=[{id:'white',name:'Trắng',hex:'#fff'}];pitems=[];orders=[];plates=[];
  sv(K.models,models);sv(K.fils,fils);openNightPlanEditor('lucifer');window.manualNode=document.getElementById('pp-manual-name');
 },theme);
 await page.locator('.pp-manual>summary').click();
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('.pp-select-file').click()]);assert.ok(chooser.isMultiple(),'Visible choose-file button opens a real multiple-file picker');
 await page.locator('#pp-manual-name').fill('Bình decor mới – tên rất dài để kiểm tra bố cục');
 await page.locator('#pp-manual-note').fill('In mẫu thử\nKhông ghép vào model có sẵn');
 await page.getByRole('button',{name:'Tăng số lượng nhập tay',exact:true}).click();
 await page.locator('#pp-manual-note').focus();
 await page.evaluate(()=>selectNightPlanModel('known'));
 assert.ok(await page.evaluate(()=>manualNode===document.getElementById('pp-manual-name')&&document.activeElement===document.getElementById('pp-manual-note')),'Model selection preserves manual DOM, note and focus');
 await page.locator('.pp-picker-add').click();
 assert.equal(await page.locator('#pp-manual-name').inputValue(),'Bình decor mới – tên rất dài để kiểm tra bố cục');
 await page.locator('#pp-manual-files').setInputFiles({name:'decor "mẫu".3mf',mimeType:'application/octet-stream',buffer:Buffer.from('print-input-original-bytes')});
 await page.waitForFunction(()=>!printPlanEditState.fileBusy&&printPlanEditState.manual.files.length===1);
 const meta=await page.evaluate(()=>printPlanEditState.manual.files[0]);
 assert.equal(await page.evaluate(async id=>(await PlatePlanFiles.get(id)).blob.size,meta.id),26,'Original bytes persisted in IndexedDB before add');
 await page.evaluate(()=>PlatePlanFiles.refresh());await page.evaluate(()=>document.querySelector('.pp-edit-body').scrollTop=0);await page.screenshot({path:`qa-results/plate-manual/form-${width}-${theme}.png`});
 await page.locator('#pp-manual-add').click();
 assert.equal(await page.locator('.pp-queued-row').count(),2,'Manual and library items share the same plate');
 assert.match(await page.locator('.pp-queued-row').last().textContent(),/Nhập tay/);
 assert.equal(await page.evaluate(()=>printPlanEditState.items[1].qty),2);
 await page.locator('.pp-manual>summary').click();await page.locator('#pp-manual-name').fill('Bình decor mới – tên rất dài để kiểm tra bố cục');await page.locator('#pp-manual-add').click();
 assert.equal(await page.evaluate(()=>new Set(printPlanEditState.items.filter(i=>i.kind==='manual').map(i=>planItemKey(i))).size),2,'Same-name manual work is never implicitly merged');
 await page.locator('.pp-manual>summary').click();await page.locator('#pp-manual-name').fill('Nháp chưa thêm');
 await page.getByRole('button',{name:'Đóng xếp plate',exact:true}).click();
 await page.evaluate(()=>openNightPlanEditor('lucifer'));
 assert.equal(await page.locator('#pp-manual-name').inputValue(),'Nháp chưa thêm');assert.equal(await page.locator('.pp-queued-row').count(),3,'Close keeps queued items and unadded manual draft');
 await page.locator('#pp-manual-name').fill('');
 await page.getByRole('button',{name:/^Lưu plate/}).click();
 assert.equal(await page.locator('.pp-edit-dlg').isVisible(),false);
 await page.reload({waitUntil:'domcontentloaded'});
 await waitForAppReady(page);await page.waitForFunction(()=>!!window.PlatePlanFiles);
 await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');currentUser=null;cloudReady=false;openNightPlanEditor('lucifer');},theme);
 assert.equal(await page.locator('.pp-queued-row').count(),3,'Saved manual rows survive a real reload');
 assert.equal(await page.evaluate(async id=>await (await PlatePlanFiles.get(id)).blob.text(),meta.id),'print-input-original-bytes','Pending file survives reload byte-for-byte');
 await page.locator('.pp-edit-dlg').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
 const geometry=await page.locator('.pp-edit-dlg').evaluate(el=>{const f=el.querySelector('.pp-edit-footer').getBoundingClientRect();return {overflow:el.scrollWidth>el.clientWidth+1,body:el.querySelector('.pp-edit-body').scrollWidth>el.querySelector('.pp-edit-body').clientWidth+1,footer:f.top>=0&&f.bottom<=innerHeight,targets:[...el.querySelectorAll('.pp-manual button,.pp-file-remove')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().height>=44)};});
 assert.deepEqual(geometry,{overflow:false,body:false,footer:true,targets:true},JSON.stringify(await page.locator('.pp-manual button,.pp-file-remove').evaluateAll(list=>list.filter(b=>b.getClientRects().length).map(b=>({label:b.getAttribute('aria-label')||b.textContent,h:b.getBoundingClientRect().height,w:b.getBoundingClientRect().width})))));
 if(width<700)await page.evaluate(()=>{const body=document.querySelector('.pp-edit-body'),queue=document.querySelector('.pp-queue');body.scrollTop=body.scrollTop+queue.getBoundingClientRect().top-body.getBoundingClientRect().top;});
 await page.screenshot({path:`qa-results/plate-manual/${width}-${theme}.png`});
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.pp-file-download').first().click()]);assert.equal(download.suggestedFilename(),'decor _mẫu_.3mf','Browser sanitizes Windows-invalid quotes only in the download filename');assert.equal(readFileSync(await download.path(),'utf8'),'print-input-original-bytes','Download returns the original print file');
 const roundtrip=await page.evaluate(()=>{
  const plan=getNightPrintPlan(),plate=plan.machines.lucifer.plate,cloud=getCloudCollections().settings.find(s=>s.id==='operations').values.printPlans.find(p=>p.id===plan.id).machines.lucifer.plate;
  const manual=cloud.items.find(i=>i.kind==='manual');return {name:manual.name,note:manual.note,file:manual.files[0].name,blob:'blob' in manual.files[0],matches:planItemMatchesPlateItem({modelId:null,partId:null},manual)};
 });assert.equal(roundtrip.blob,false);assert.equal(roundtrip.matches,false);assert.equal(roundtrip.file,'decor "mẫu".3mf');assert.match(roundtrip.note,/Không ghép/);
 await page.evaluate(()=>{
  const plan=getNightPrintPlan();plan.machines.lucifer.plate.items[0].qty=7;saveNightPlanEditor();
 });assert.equal(await page.locator('.pp-edit-dlg').isVisible(),true,'Concurrent plan update is not overwritten');
 assert.match(await page.locator('#pp-editor-feedback').textContent(),/chưa ghi đè/);
 await page.getByRole('button',{name:'Đóng xếp plate',exact:true}).click();await page.evaluate(()=>openNightPlanEditor('lucifer'));
 assert.equal(await page.locator('.pp-conflicting-drafts').count(),1,'Conflicting old draft remains accessible');
 await page.getByRole('button',{name:'Đóng xếp plate',exact:true}).click();
 await page.evaluate(()=>{
  canDescribeBatchReports=()=>true;canEditBatchReports=()=>true;recordAudit=()=>{};recordSystemEvent=()=>{};
  batchReports=[{id:'manual-report',recordedAt:localPlanDate(),createdAt:new Date().toISOString(),status:'pending',machineId:'lucifer',printPlanId:getNightPrintPlan().id}];brCurrentId='manual-report';document.getElementById('ov-batch-report').style.display='flex';useBatchMachinePlan();
 });
 assert.match(await page.locator('[data-plan-actual="1"]').textContent(),/Không ghép vào model/);assert.equal(await page.locator('[data-plan-actual="1"] .pp-file-download').count(),1);
 await page.getByRole('spinbutton',{name:'Lỗi dòng 2',exact:true}).fill('1');await page.getByRole('button',{name:'Xác nhận thực tế',exact:true}).click();
 const report=await page.evaluate(()=>({done:batchReports[0].status,manual:batchReports[0].manualItems.find(i=>i.kind==='manual'),retry:getPlanRetryNeeds().find(i=>i.kind==='manual'),pitems:pitems.length,results:printPlanResults()[batchReports[0].planReview.plateId].rows.length}));
 assert.equal(report.done,'done');assert.equal(report.manual.qty,1);assert.equal(report.manual.modelId,null);assert.equal(report.manual.files[0].id,meta.id);assert.equal(report.retry.qty,1);assert.equal(report.pitems,0);assert.equal(report.results,3);
 // File-only entry, validation failure, failed upload, idempotent retry and scope isolation.
 await page.evaluate(()=>{getNightPrintPlan().machines['my-nu'].plate=null;models=[];openNightPlanEditor('my-nu');});
 await page.locator('.pp-manual>summary').click();await page.locator('#pp-manual-files').setInputFiles({name:'mẫu mới.stl',mimeType:'application/octet-stream',buffer:Buffer.from('solid new')});
 await page.waitForFunction(()=>printPlanEditState.manual.files.length===1);assert.equal(await page.locator('#pp-manual-name').inputValue(),'mẫu mới','File name seeds a manual label, not a model');
 await page.locator('#pp-manual-files').setInputFiles({name:'unsafe.exe',mimeType:'application/octet-stream',buffer:Buffer.from('not-printable')});await page.waitForFunction(()=>!printPlanEditState.fileBusy);assert.match(await page.locator('#pp-manual-status').textContent(),/chỉ nhận/);assert.equal(await page.evaluate(()=>printPlanEditState.manual.files.length),1);
 const validation=await page.evaluate(async()=>{const failures=[];for(const file of [{name:'empty.stl',size:0},{name:'too-big.stl',size:52428801}]){try{await PlatePlanFiles.add([file]);}catch(e){failures.push(e.message);}}return failures;});assert.equal(validation.length,2);assert.ok(validation.every(e=>e.includes('50 MB')));
 const quota=await page.evaluate(()=>{
  addManualPlanItem();const original=Storage.prototype.setItem,before=JSON.stringify(getNightPrintPlan().machines['my-nu'].plate);
  Storage.prototype.setItem=function(key,value){if(key===K.operations)throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value);};
  try{saveNightPlanEditor();return {unchanged:before===JSON.stringify(getNightPrintPlan().machines['my-nu'].plate),open:document.getElementById('dlg-mv').style.display==='flex',message:document.getElementById('pp-editor-feedback').textContent};}finally{Storage.prototype.setItem=original;}
 });assert.equal(quota.unchanged,true);assert.equal(quota.open,true);assert.match(quota.message,/Chưa lưu được plate/);
 const switched=await page.evaluate(async()=>{const before=JSON.stringify(operations),initial=PlatePlanFiles.scope();currentUser={id:'different-user'};activeWorkspace={workspace_id:'different-workspace',owner_user_id:'different-user'};saveNightPlanEditor();let writes=0;const add=PlatePlanFiles.add;PlatePlanFiles.add=async()=>{writes++;return [];};try{await attachManualPlanFiles({files:[new File(['wrong-scope'],'wrong.stl')],value:'selected'});}finally{PlatePlanFiles.add=add;currentUser=null;activeWorkspace=null;}return {unchanged:JSON.stringify(operations)===before,writes,initial};});assert.equal(switched.unchanged,true,'Scope rejection never creates an empty plan in another workspace');assert.equal(switched.writes,0,'Old forms cannot upload into a newly selected workspace');
 // Install the upload transport after the real startup scan completes, so an
 // in-flight background scan cannot race this single manual retry fixture.
 await page.waitForFunction(()=>window.qaPrintFileStartupSettled===true);
 const upload=await page.evaluate(async()=>{
  _closeDialogBase('dlg-mv');currentUser={id:'user-a'};activeWorkspace={workspace_id:'workspace-a',owner_user_id:'user-a'};canAccess=()=>true;
  let attempts=0;sb={storage:{from:()=>({upload:async()=>{attempts++;return {error:{message:'Mất mạng'}};},download:async()=>({data:new Blob(['secret']),error:null})})}};
  const settled=async(id,status)=>{const until=performance.now()+5000;do{const row=await PlatePlanFiles.get(id);if(row?.status===status){await new Promise(requestAnimationFrame);return row;}await new Promise(requestAnimationFrame);}while(performance.now()<until);throw Error('File did not reach persisted '+status);};
  const file=(await PlatePlanFiles.add([new File(['cloud-original'],'cloud.3mf')]))[0];
  const failed=await settled(file.id,'error');sb.storage.from=()=>({upload:async()=>{attempts++;return {error:null};}});await PlatePlanFiles.resume(file.id);
  const saved=await PlatePlanFiles.get(file.id);
  sb.storage.from=()=>({upload:async()=>{attempts++;return {error:{message:'Mất mạng'}};}});const pending=(await PlatePlanFiles.add([new File(['other-pending'],'pending.stl')]))[0];await settled(pending.id,'error');
  currentUser={id:'user-b'};await PlatePlanFiles.resume();
  return {failed:failed.status,blob:await saved.blob.text(),status:saved.status,attempts};
 });assert.deepEqual(upload,{failed:'error',blob:'cloud-original',status:'uploaded',attempts:3});
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS manual plate ${width}/${theme}: mixed/empty library, file-only, durable original/draft/reload, conflict, actual/retry results, no stock writes, upload failure/retry, scope, layout`);
}}finally{await browser.close();}
