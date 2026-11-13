
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import {waitForAppReady} from './app-ready-qa.mjs';

const origin='https://order-production.test';
const root=resolve('.');
const output=resolve('qa-results/order-production');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const model={
  id:'lamp',name:'Đèn Hoa Cúc',cats:['Trang trí'],images:[],
  variants:[{id:'small',name:'Cỡ nhỏ'},{id:'large',name:'Cỡ lớn'}],
  parts:[{id:'base',name:'Đế',qtyPerModel:1,filamentIds:['green']},{id:'shade',name:'Chụp',qtyPerModel:1,filamentIds:['green']}]
};
const results=[];
async function boot(page){
  await page.goto(origin+'/plate-studio.html',{waitUntil:'domcontentloaded'});
  await waitForAppReady(page);
  await page.addStyleTag({content:'#auth-ov{display:none!important}'});
  await page.evaluate(()=>{
    isWorkspaceOwner=()=>true;
    canAccess=()=>true;
    sb=null;
    currentUser=null;
    cloudReady=false;
    maybeStartPageGuide=()=>{};
    setCloudLoadingOverlay(false);
    setCardContentLoading(false);
    goPage('orders',{historyMode:'replace'});
  });
}
async function setup(width,withModel=true){
  const context=await browser.newContext({viewport:{width,height:width<800?844:900},hasTouch:width<800,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort();
    const file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(relative(root,file).startsWith('..'))return route.abort();
    const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'};
    try{return route.fulfill({contentType:types[extname(file)]||'application/octet-stream',body:readFileSync(file)});}
    catch{return route.fulfill({status:404,body:''});}
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await boot(page);
  await page.evaluate(model=>{
    models=model?[model]:[];fils=[{id:'green',name:'Xanh QA',hex:'#397454'}];
    orders=[];plates=[];pitems=[];operations={};batchReports=[];
    normalizeOperations();
    for(const [key,value] of [[K.models,models],[K.fils,fils],[K.orders,orders],[K.plates,plates],[K.pitems,pitems],[K.batchReports,batchReports]])sv(key,value);
    saveOperations();
  },withModel?model:null);
  return {page,context,errors};
}
async function run(name,width,scenario,withModel){
  const {context,page,errors}=await setup(width,withModel);
  try{
    await scenario(page,context);
    assert.deepEqual(errors,[]);
    results.push({name,width,status:'pass'});
    console.log('PASS',name,width);
  }catch(error){
    results.push({name,width,status:'fail',message:error.message,stack:error.stack});
    await page.screenshot({path:resolve(output,name+'-'+width+'-failed.png')}).catch(()=>{});
    console.error('FAIL',name,width,error.message);
  }finally{
    await context.close();
    writeFileSync(resolve(output,'summary.json'),JSON.stringify(results,null,2));
  }
}
async function openCheckout(page,qty,note){
  await page.evaluate(qty=>{
    openOrderForm('lamp');
    addFromCard('lamp',qty-1);
  },qty);
  const checkout=page.getByRole('button',{name:'Thanh toán',exact:true});
  if(await checkout.count())await checkout.click();
  await page.locator('.of-variant-chip').filter({hasText:'Cỡ nhỏ'}).click();
  await page.locator('#of-o-note').fill(note);
  await page.waitForFunction(note=>loadLocalOrderDraft()?.form.note===note,note);
}
async function readyToConfirm(page){
  const checkout=page.getByRole('button',{name:'Thanh toán',exact:true});
  if(await checkout.count())await checkout.click();
}
function readOrderState(page){
  return page.evaluate(()=>({orders:orders.length,plates:plates.length,parts:pitems.length,draft:loadLocalOrderDraft()?.form.note||'',events:operations.events.filter(event=>event.type==='order_created').length}));
}
async function faultScenario(page){
  const note='Đơn kiểm tra lưu bền vững';
  await openCheckout(page,2,note);
  for(const mode of ['all','parts','order','outbox']){
    await page.evaluate(mode=>{
      if(mode==='outbox'){
        currentUser={id:'audit-user'};
        activeWorkspace={workspace_id:'audit-workspace',owner_user_id:'audit-user'};
        persistOrderDraft();
      }
      const realSetItem=Storage.prototype.setItem;
      window.qaRestoreStorage=()=>{Storage.prototype.setItem=realSetItem;};
      const denied=mode==='all'?[K.orders,K.plates,K.pitems]:[({parts:K.pitems,order:K.orders,outbox:K.syncOutbox})[mode]];
      Storage.prototype.setItem=function(key,value){
        if(denied.includes(key))throw new DOMException('QA quota','QuotaExceededError');
        return realSetItem.call(this,key,value);
      };
    },mode);
    await page.locator('#of-btn-confirm').click();
    await page.getByText('Chưa lưu được đơn. Giỏ hàng vẫn mở để em thử lại.',{exact:true}).last().waitFor();
    assert.equal(await page.locator('#of-done-ov').isVisible(),false,mode);
    assert.deepEqual(await readOrderState(page),{orders:0,plates:0,parts:0,draft:note,events:0},mode);
    assert.deepEqual(await page.evaluate(()=>[ld(K.orders,[]).length,ld(K.plates,[]).length,ld(K.pitems,[]).length,ld(K.syncOutbox,[]).length]),[0,0,0,0],mode);
    await page.evaluate(()=>{qaRestoreStorage();currentUser=null;activeWorkspace=null;});
  }
  await boot(page);
  await page.evaluate(()=>openOrderForm());
  await readyToConfirm(page);
  assert.equal(await page.locator('#of-o-note').inputValue(),note);
  await page.evaluate(async()=>{await Promise.all([submitOrder(),submitOrder()]);});
  await page.locator('#of-done-ov').waitFor();
  assert.deepEqual(await readOrderState(page),{orders:1,plates:1,parts:2,draft:'',events:1});
  await boot(page);
  assert.deepEqual(await readOrderState(page),{orders:1,plates:1,parts:2,draft:'',events:1});
}
async function staleTabScenario(page,context){
  const note='Một đơn từ cùng nháp ở hai tab';
  await openCheckout(page,2,note);
  const other=await context.newPage();
  await boot(other);
  await other.evaluate(()=>openOrderForm());
  await readyToConfirm(other);
  assert.equal(await other.locator('#of-o-note').inputValue(),note);
  await Promise.all([page.evaluate(()=>submitOrder()),other.evaluate(()=>submitOrder())]);
  await page.locator('#of-done-ov').waitFor();
  await other.locator('#of-done-ov').waitFor();
  await boot(other);
  assert.deepEqual(await readOrderState(other),{orders:1,plates:1,parts:2,draft:'',events:1});
}
async function conflictingTabScenario(page,context){
  const note='Bản nháp chưa sửa';
  await openCheckout(page,2,note);
  const other=await context.newPage();
  await boot(other);
  await other.evaluate(()=>openOrderForm());
  await readyToConfirm(other);
  await other.locator('#of-o-note').fill('Sửa nháp ở tab thứ hai');
  await page.evaluate(()=>submitOrder());
  await other.evaluate(()=>submitOrder());
  await other.getByText(/Bản nháp này đã được xác nhận ở phiên khác/).waitFor();
  assert.equal(await other.locator('#of-done-ov').isVisible(),false);
  assert.equal(await other.locator('#of-o-note').inputValue(),'Sửa nháp ở tab thứ hai');
  assert.equal(await other.evaluate(()=>ld(K.orders,[]).length),1);
}
async function queuedOrderScenario(page){
  await page.evaluate(()=>{
    currentUser={id:'offline-user'};
    activeWorkspace={workspace_id:'offline-workspace',owner_user_id:'offline-user'};
  });
  await openCheckout(page,2,'Đơn đã lưu trên thiết bị');
  await page.evaluate(()=>submitOrder());
  await page.getByText(/Đã lưu trên thiết bị · 1 sản phẩm/).waitFor();
  await boot(page);
  assert.deepEqual(await page.evaluate(()=>({orders:orders.length,parts:pitems.length,jobs:cloudOutbox.length})),{orders:1,parts:2,jobs:1});
}
async function catalogScenario(page){
  await page.evaluate(()=>openOrderForm());
  await page.getByText('Chưa có model nào',{exact:true}).waitFor();
  await page.locator('#of-p-search').fill('den');
  assert.equal(await page.locator('#of-p-grid').count(),1);
  await page.evaluate(model=>{
    closeOrderForm('orders');
    models=[model,{id:'turtle',name:'Rùa vàng',cats:['Con vật'],parts:[],images:[]}];
    operations.products=[{id:'turtle-set',name:'Bộ rùa',components:[{modelId:'turtle',qty:1}]}];
    openOrderForm();
  },model);
  for(const query of ['den hoa cuc','co nho','chup','trang tri']){
    await page.locator('#of-p-search').fill(query);
    assert.equal(await page.locator('.of-p-card').filter({hasText:model.name}).count(),1,query);
  }
  await page.locator('#of-p-search').fill('');
  const filter=page.locator('.mws-order-filter');
  if(await filter.count())await filter.click();
  await page.locator('#of-p-chips').getByRole('button',{name:'Trang trí',exact:true}).click();
  assert.equal(await page.locator('.of-p-card').count(),1);
  if(await filter.count())await filter.click();
  await page.locator('#of-p-chips').getByRole('button',{name:'Sản phẩm ghép',exact:true}).click();
  assert.equal(await page.locator('.of-p-card').filter({hasText:'Bộ rùa'}).count(),1);
  assert.equal(await page.locator('.of-p-card').count(),1);
}
async function makeOrder(page,qty,note){
  await openCheckout(page,qty,note);
  await page.locator('#of-btn-confirm').click();
  await page.locator('#of-done-ov').waitFor();
  return page.evaluate(()=>{const order=orders.at(-1);return [order.id,order.items[0].id];});
}
async function plan(page,date,seed){
  await page.evaluate(({date,seed})=>{
    closeDone(false);
    activePrintPlanDate=date;
    const needs=getAllOutstandingPrintNeeds();
    openPrintPlanSuggestion(seed==='retry'?needs.filter(row=>row.partId==='shade'):needs,'Lên lịch ca đêm QA');
  },{date,seed});
  await page.getByRole('button',{name:/Xếp .* dòng vào máy/}).click();
  return page.evaluate(date=>{
    const plan=getNightPrintPlan(date,false);
    const [machineId,machine]=Object.entries(plan.machines).find(([,entry])=>entry.plate?.items.length);
    closeActionDialog();
    return {date,planId:plan.id,machineId,plate:machine.plate};
  },date);
}
async function report(page,plan,id){
  await page.evaluate(async ({plan,id})=>{
    const canvas=document.createElement('canvas');
    canvas.width=150;canvas.height=100;
    const context=canvas.getContext('2d');
    context.fillStyle=id==='print-1'?'#50785d':'#476384';
    context.fillRect(0,0,150,100);
    context.fillStyle='#ecd184';
    context.fillRect(27,22,90,50);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
    currentUser={id:'photo-user'};
    activeWorkspace={workspace_id:'photo-workspace'};
    queueBatchCameraFiles([new File([blob],id+'.jpg',{type:'image/jpeg'})]);
  },{plan,id});
  await page.waitForFunction(()=>brMultiCameraShots.some(shot=>shot.state==='queued'&&shot.localSaved));
  await boot(page);
  await page.evaluate(async ({plan,id})=>{
    // Restore the photographed file from the real offline queue. Only the
    // external storage and database acknowledgement are simulated here.
    currentUser={id:'photo-user'};
    activeWorkspace={workspace_id:'photo-workspace'};
    await restoreBatchCameraQueue();
    const shot=brMultiCameraShots.find(shot=>shot.file?.name===id+'.jpg');
    if(!shot?.localSaved)throw Error('Ảnh báo cáo chưa được khôi phục từ hàng chờ');
    const image=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=reject;
      reader.readAsDataURL(shot.file);
    });
    batchReports.push({id,status:'pending',image,recordedAt:planDateAdd(plan.date,1),machineId:plan.machineId,printPlanId:plan.planId});
    await removeBatchCameraShotLocal(shot);
    brMultiCameraShots=[];
    currentUser=null;activeWorkspace=null;
    brCurrentId=id;brView='color';
    document.getElementById('ov-batch-report').style.display='flex';
    useBatchMachinePlan(plan.planId);
  },{plan,id});
}
async function reconcile(page,id){
  await page.evaluate(id=>openBatchReconciliation(id),id);
  await page.getByRole('button',{name:/Chuyển .* mục vào Order/}).click();
}
async function productionScenario(page){
  const [orderId,itemId]=await makeOrder(page,3,'Đơn đèn qua hai ca in');
  const initial=await plan(page,'2026-11-13');
  assert.deepEqual(initial.plate.items.map(row=>[row.modelId,row.variantId,row.partId,row.qty]).sort(),[
    ['lamp','small','base',3],['lamp','small','shade',3]
  ]);
  await report(page,initial,'print-1');
  await page.locator('.br-plan-photo img').waitFor();
  const shade=initial.plate.items.findIndex(row=>row.partId==='shade');
  await page.locator('[data-plan-actual="'+shade+'"] [data-actual-good]').fill('1');
  await page.locator('[data-plan-actual="'+shade+'"] [data-actual-failed]').fill('1');
  assert.match(await page.locator('[data-plan-actual="'+shade+'"] output').textContent(),/Chưa in: 1/);
  await page.screenshot({path:resolve(output,'print-partial-'+(await page.evaluate(()=>innerWidth))+'.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Xác nhận thực tế'}).click();
  const outcome=await page.evaluate(id=>({
    rows:printPlanResults()[id].rows.map(row=>[row.partId,row.goodQty,row.failedQty,row.unprintedQty]).sort(),
    retry:getPlanRetryNeeds().reduce((sum,row)=>sum+row.qty,0)
  }),initial.plate.id);
  assert.deepEqual(outcome,{rows:[['base',3,0,0],['shade',1,1,1]],retry:2});
  await reconcile(page,'print-1');
  const progress=()=>page.evaluate(([id,itemId])=>{
    const order=orders.find(order=>order.id===id),item=order.items.find(item=>item.id===itemId);
    return {parts:pitems.filter(row=>row.orderItemId===itemId).map(row=>[row.partId,row.qtyDone]).sort(),complete:orderItemCompleteSetQty(order,item)};
  },[orderId,itemId]);
  assert.deepEqual(await progress(),{parts:[['base',3],['shade',1]],complete:1});
  await page.evaluate(([orderId,itemId])=>{goPage('fulfillment');markWorkshopItemHanded(orderId,itemId);openPartQcDialog(orderId,itemId);},[orderId,itemId]);
  assert.equal(await page.locator('#part-qc-qty').getAttribute('max'),'1','Early handover never makes the two missing sets eligible for QC');
  await page.evaluate(()=>closeDialog('dlg-mv'));
  const retry=await plan(page,'2026-11-14','retry');
  assert.deepEqual(retry.plate.items.map(row=>[row.partId,row.qty]),[['shade',2]]);
  await report(page,retry,'print-2');
  await page.getByRole('button',{name:'Xác nhận thực tế'}).click();
  await reconcile(page,'print-2');
  assert.deepEqual(await progress(),{parts:[['base',3],['shade',3]],complete:3});
  assert.equal(await page.evaluate(()=>getPlanRetryNeeds().length),0);
  assert.equal(await page.evaluate(()=>batchReports.filter(report=>report.status==='done').length),2);
  await page.evaluate(([orderId,itemId])=>{goPage('fulfillment');openWorkshopQualityIssuePicker(orderId,itemId);},[orderId,itemId]);
  await page.getByRole('checkbox',{name:'Báo lỗi Chụp',exact:true}).check();
  await page.getByRole('button',{name:'Xác nhận lỗi đã chọn',exact:true}).click();
  await page.waitForFunction(()=>operations.qualityIssues.length===1);
  assert.deepEqual(await progress(),{parts:[['base',3],['shade',2]],complete:2});
  await page.evaluate(([orderId,itemId])=>openPartQcDialog(orderId,itemId),[orderId,itemId]);
  assert.equal(await page.locator('#part-qc-qty').getAttribute('max'),'2');
  await page.locator('#part-qc-by').fill('QC QA');
  await page.getByRole('button',{name:/Xác nhận 2 bộ đạt/}).click();
  await page.evaluate(([orderId,itemId])=>{
    startWorkshopAssembly(orderId,itemId);
    const row=fulfillmentWorkshopRows().find(row=>row.o?.id===orderId);
    openWorkshopWaitStatus(workshopWaitKey(row));
  },[orderId,itemId]);
  await page.locator('#assembly-wait-preset').selectOption('Chờ hộp');
  await page.getByRole('button',{name:'Lưu trạng thái',exact:true}).click();
  await boot(page);
  await page.evaluate(orderId=>{
    goPage('fulfillment');
    const row=fulfillmentWorkshopRows().find(row=>row.o?.id===orderId);
    if(workshopWaitStatus(row)?.label!=='Chờ hộp')throw Error('Trạng thái chờ vật tư bị mất sau tải lại');
    openWorkshopWaitStatus(workshopWaitKey(row));
  },orderId);
  await page.locator('#assembly-wait-preset').selectOption('');
  await page.getByRole('button',{name:'Lưu trạng thái',exact:true}).click();
  await page.evaluate(([orderId,itemId])=>openAssemblyFinish(orderId,itemId),[orderId,itemId]);
  assert.equal(await page.locator('#assembly-finish-qty').getAttribute('max'),'2');
  await page.evaluate(([orderId,itemId])=>{
    document.getElementById('assembly-finish-by').value='Xưởng QA';
    saveAssemblyFinish(orderId,itemId,false);
    goPage('packaging');
    const row=fulfillmentWorkshopRows().find(row=>row.o?.id===orderId);
    openPackagingTask(workshopWaitKey(row));
  },[orderId,itemId]);
  await page.locator('#packaging-type').fill('Hộp giấy QA');
  await page.locator('#packaging-status').selectOption('ready');
  await page.locator('#packaging-tag-status').selectOption('ready');
  await page.getByRole('button',{name:'Lưu chuẩn bị',exact:true}).click();
  assert.equal(await page.locator('.packaging-card.is-ready').count(),1);
  assert.equal(await page.evaluate(id=>deliveryReadyLines(id)[0]?.available,orderId),2);
  await page.evaluate(async id=>{openDeliveryBatchBuilder(id);setDeliveryWorkspaceQty(0,2);await saveDeliveryBatchFromWorkspace();},orderId);
  const delivery=await page.evaluate(()=>operations.deliveryBatches[0]);
  assert.equal(delivery.items[0].sentQty,2);
  await boot(page);
  await page.evaluate(id=>openReceivingDialog(id),delivery.id);
  await page.locator('#receive-workspace-qty-0').fill('1');
  await page.getByRole('button',{name:/Xác nhận kiểm hàng/}).click();
  await boot(page);
  assert.deepEqual(await page.evaluate(id=>{
    const batch=operations.deliveryBatches[0];
    return [batch.status,batch.items[0].receivedQty,deliveryReadyLines(id)[0]?.available||0];
  },orderId),['partial_received',1,0]);
}
async function splitReconciliation(page){
  await makeOrder(page,3,'Đơn A cùng mẫu');
  await page.evaluate(()=>closeDone(false));
  await makeOrder(page,3,'Đơn B cùng mẫu');
  await page.evaluate(()=>{
    closeDone(false);
    batchReports=[{id:'shared',status:'done',external:true,manualItems:[
      {modelId:'lamp',variantId:'small',partId:'shade',filamentId:'green',qty:4},
      {modelId:'lamp',variantId:'small',partId:'shade',filamentId:'red',qty:8},
      {modelId:'lamp',variantId:'large',partId:'shade',filamentId:'green',qty:8}
    ]}];
  });
  await reconcile(page,'shared');
  await page.evaluate(()=>applyBatchReconciliation('shared'));
  assert.deepEqual(await page.evaluate(()=>({
    applied:batchReports[0].appliedItems.reduce((sum,row)=>sum+row.qty,0),
    parts:pitems.filter(row=>row.partId==='shade').map(row=>row.qtyDone),
    remaining:batchReports[0].manualItems.map(row=>[row.variantId,row.filamentId,row.qty])
  })),{applied:4,parts:[3,1],remaining:[['small','red',8],['large','green',8]]});
}
try{
  await run('order-storage-and-retry',426,faultScenario);
  await run('offline-success-keeps-sync-job',426,queuedOrderScenario);
  await run('same-draft-two-tabs',1440,staleTabScenario);
  await run('conflicting-draft-two-tabs',1440,conflictingTabScenario);
  await run('empty-catalog-search-and-filter',426,catalogScenario,false);
  await run('empty-catalog-search-and-filter',1440,catalogScenario,false);
  await run('order-to-receiving',426,productionScenario);
  await run('order-to-receiving',1440,productionScenario);
  await run('shared-batch-reconciliation',1440,splitReconciliation);
}finally{await browser.close();}
process.exitCode=results.some(result=>result.status!=='pass')?1:0;
