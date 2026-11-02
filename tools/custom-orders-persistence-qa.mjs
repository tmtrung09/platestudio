import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';

const baseline=process.env.QA_CUSTOM_BASELINE==='1',root=resolve('.'),out=resolve('qa-results/custom-orders-persistence'+(baseline?'-baseline':'')),base='https://custom-orders-persistence.test';
const previous=baseline?new Map(['assets/custom-orders/custom-orders.js','assets/custom-orders/durable-store.js'].map(path=>['/'+path,execFileSync('git',['show','HEAD:'+path])])):new Map();
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
async function setup({width=390,theme='light',legacy=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce',isMobile:width<600,hasTouch:width<600});
 await context.addInitScript(()=>{
  const ws='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',token='a'.repeat(64);
  const model={id:'model-1',name:'Sản phẩm thử',sku:'TEST',revision:'2026-10-25T00:00:00Z',parts:[],variants:[],images:[]};
  const sample=index=>({id:'saved-'+String(index).padStart(3,'0'),customer:'Khách thử '+index,phone:'',address:'',delivery:'pickup',total:100000,deposit:0,due:'2026-11-10',stage:0,created:'2026-11-01',creator:'Nhân viên thử',lines:[{id:'line-'+index,modelId:model.id,model,variantId:null,qty:1,note:'Đơn thử độc lập',images:[],partColors:[]}]});
  if(!localStorage.getItem('qa-server'))localStorage.setItem('qa-server',JSON.stringify(Array.from({length:130},(_,index)=>sample(index))));
  const records=()=>JSON.parse(localStorage.getItem('qa-server'));
  window.__calls=[];window.__failLists=false;window.__holdList=false;window.__releaseList=null;window.__signFailure=false;window.__loseAck=false;
  const client={auth:{getSession:async()=>({data:{session:{user:{id:localStorage.getItem('qa-user')||user}}}}),onAuthStateChange:()=>({})},
   rpc:async(name,args)=>{
    window.__calls.push({name,args});
    if(name==='ensure_workspace_membership')return localStorage.getItem('qa-offline')?{error:{message:'Kết nối thử đang ngoại tuyến'}}:{data:[{workspace_id:ws,owner_user_id:'owner',permissions:['custom_orders.create','custom_orders.view']}]};
    if(name==='custom_order_catalog')return {data:{models:[model],total:1}};
    if(name==='custom_order_filaments')return {data:[]};
    if(name==='custom_order_list'){
     if(window.__failLists)return {error:{message:'Lỗi tải danh sách thử'}};
     const all=records().filter(row=>(row.customer+' '+row.id).toLowerCase().includes((args.q||'').toLowerCase()));
     const response={data:{orders:all.slice(args.off,args.off+60),total:all.length}};
     if(window.__holdList){window.__holdList=false;return new Promise(resolve=>{window.__releaseList=()=>resolve(response);});}
     return response;
    }
    if(name==='custom_order_get')return {data:records().find(row=>row.id===args.oid)||null};
    if(name==='custom_order_tracking')return {data:token};
    if(name==='commit_custom_order'){
     if(window.__injectOldList){window.__injectOldList=false;window.__holdList=true;window.__poll();window.__failLists=true;}
     const previous=records().find(row=>row.id==='custom-'+args.request);
     const order=previous||{...sample(999),...args.p,id:'custom-'+args.request,lines:args.p.lines.map((line,index)=>({...line,id:'new-line-'+index,model,partColors:[]}))};
     if(window.__slowImages)order.lines[0].images=[{path:'slow-reference.png',name:'Ảnh tham khảo chậm'}];
     if(!previous)localStorage.setItem('qa-server',JSON.stringify([order,...records()]));
     if(window.__loseAck){window.__loseAck=false;return {error:{message:'Mất phản hồi sau khi server đã lưu'}};}
     return {data:{order,token}};
    }
    return {error:{message:'RPC thử chưa hỗ trợ: '+name}};
   },storage:{from:()=>({createSignedUrls:async paths=>{if(window.__slowImages)return new Promise(()=>{});if(window.__signFailure)throw Error('Lỗi ảnh phụ');return {data:paths.map(path=>({path,signedUrl:location.origin+'/fixture.svg'}))};}})}};
  window.supabase={createClient:()=>client};
  const original=window.setInterval;window.setInterval=(fn,delay,...args)=>delay===30000?(window.__poll=fn,999):original(fn,delay,...args);
 });
 const errors=[];const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
 await page.route(/^https?:/,route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(url.pathname==='/seed.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated legacy cache fixture</title>'});
  if(url.pathname==='/assets/custom-orders/supabase.js')return route.fulfill({contentType:'application/javascript',body:'/* isolated transport */'});
  if(url.pathname==='/fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="#315d34"/></svg>'});
  const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep)||!existsSync(path))return route.abort();
  return route.fulfill({body:previous.get(url.pathname)||readFileSync(path),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});
 });
 if(legacy){
  await page.goto(base+'/seed.html');await page.evaluate(()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('platedio-custom-orders-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('scopes');request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{const db=request.result,tx=db.transaction('scopes','readwrite');tx.objectStore('scopes').put({draft:{lines:[],customer:'Nháp từ phiên cũ',phone:'',address:'',delivery:'pickup',total:'',deposit:'',due:'',checked:false},step:1},'11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
  }));
 }
 await page.goto(base+'/custom-orders.html',{waitUntil:'domcontentloaded'});await page.locator(legacy?'#customer-name':'#model-search').waitFor();
 if(theme==='dark')await page.locator('#theme-toggle').click();
 return {context,page,errors};
}
async function list(page){await page.locator('[data-action=orders]:visible').first().click();await page.locator('[data-order=saved-000]').waitFor();}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function review(page){
 await page.locator('[data-model=model-1]').click();await page.locator('[data-note]').fill('Yêu cầu thử việc lưu đơn');await page.locator('#next-step').click();
 await page.locator('#customer-name').fill('Khách xác nhận');await page.locator('#customer-phone').fill('0901234567');
 await page.locator('#order-total').fill('100000');await page.locator('#order-deposit').fill('0');await page.locator('#order-due').fill('2026-11-10');
 await page.locator('[data-action=next]').click();await page.locator('#review-confirm').check();
}
async function run(name,fn,options){
 let fixture;try{fixture=await setup(options);await fn(fixture);assert.deepEqual(fixture.errors,[],'No browser errors');assert.doesNotMatch(await fixture.page.locator('#toast').innerText(),/Cannot (set|read)|TypeError/,'No swallowed runtime errors');assert.ok(await fixture.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');results.push({name,status:'PASS'});console.log('PASS '+name);}
 catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name+': '+error.message);if(fixture)await fixture.page.screenshot({path:resolve(out,name+'.png'),fullPage:true}).catch(()=>{});}
 finally{await fixture?.context.close();}
}
try{
 await run('expanded-list-survives-background-refresh',async({page})=>{
  await list(page);await page.evaluate(()=>window.__poll());await page.locator('[data-action=more-orders]').click();await page.locator('[data-order=saved-119]').waitFor();
  await page.evaluate(()=>window.__poll());await settle(page);
  assert.equal(await page.locator('[data-order=saved-119]').count(),1,'Background refresh must retain all previously loaded pages');
  assert.equal(await page.locator('.order-row').count(),120);
 });
 await run('late-list-cannot-remove-confirmed-order',async({page})=>{
  await review(page);await page.evaluate(()=>{window.__injectOldList=true;});
  await page.locator('#submit-order').click();await page.locator('.success-panel').waitFor();
  const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-server'))[0].id);
  await page.evaluate(()=>{window.__failLists=true;window.__releaseList();});await settle(page);
  assert.ok((await page.locator('.success-panel').innerText()).includes(id),'Confirmed receipt survives an older list response');
  await page.locator('.success-panel [data-track]').click();await page.waitForURL(/order-status\.html#a{64}$/);
 });
 await run('confirmed-orders-survive-offline-reload',async({page})=>{
  await review(page);await page.locator('#submit-order').click();await page.locator('.success-panel').waitFor();
  const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-server'))[0].id);
  await page.evaluate(()=>localStorage.setItem('qa-offline','1'));await page.reload();await page.locator('.offline-note').waitFor();
  await page.locator('[data-action=orders]:visible').first().click();
  assert.equal(await page.locator(`[data-order="${id}"]`).count(),1,'A cloud-confirmed order remains readable from this account cache');
  await page.locator(`[data-order="${id}"]`).click();assert.match(await page.locator('#detail-dialog').innerText(),/Khách xác nhận/);
  assert.equal(await page.evaluate(()=>window.__calls.filter(call=>call.name==='commit_custom_order').length),0,'Reload must not create another order');
  await page.locator('[data-close-dialog]').click();await page.screenshot({path:resolve(out,'offline-confirmed-mobile.png')});
  await page.evaluate(()=>localStorage.setItem('qa-user','33333333-3333-4333-8333-333333333333'));await page.reload();
  await page.getByRole('heading',{name:'Chưa mở được không gian cửa hàng.'}).waitFor();
  assert.equal(await page.locator(`[data-order="${id}"]`).count(),0,'Another account cannot see this scoped cache');
 });
 await run('read-failure-keeps-records-and-explains-state',async({page})=>{
  await list(page);await page.evaluate(()=>{window.__failLists=true;window.__poll();});await settle(page);
  assert.equal(await page.locator('.order-row').count(),60);
  assert.match(await page.locator('#order-sync').innerText(),/Chưa cập nhật/,'Read failure is visible without claiming an empty server list');
  assert.equal(await page.locator('#order-search').inputValue(),'');
  await page.screenshot({path:resolve(out,'read-error-desktop-dark.png')});
 },{width:1440,theme:'dark'});
 await run('lost-ack-retry-reads-one-cloud-order',async({page})=>{
  await review(page);await page.evaluate(()=>{window.__loseAck=true;});await page.locator('#submit-order').click();
  await page.waitForFunction(()=>window.__calls.some(call=>call.name==='commit_custom_order'));
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Mất phản hồi'));
  const request=await page.evaluate(()=>window.__calls.find(call=>call.name==='commit_custom_order').args.request);
  await page.reload();await page.locator('.success-panel').waitFor();
  assert.equal(await page.evaluate(()=>window.__calls.find(call=>call.name==='commit_custom_order').args.request),request);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-server')).filter(row=>row.id.startsWith('custom-')).length),1);
  await page.reload();await page.locator('#model-search').waitFor();await page.locator('[data-action=orders]:visible').first().click();
  await page.locator(`[data-order="custom-${request}"]`).waitFor();
 });
 await run('reference-image-error-keeps-cloud-orders',async({page})=>{
  await page.evaluate(()=>{const rows=JSON.parse(localStorage.getItem('qa-server'));rows[0].lines[0].images=[{path:'reference.png',name:'Ảnh thử'}];localStorage.setItem('qa-server',JSON.stringify(rows));window.__signFailure=true;});
  await list(page);await settle(page);
  assert.equal(await page.locator('.order-row').count(),60,'Optional signed image failure must not discard an otherwise valid server list');
 });
 await run('slow-images-cannot-delay-cloud-ack',async({page})=>{
  await review(page);await page.evaluate(()=>{window.__slowImages=true;});await page.locator('#submit-order').click();
  await page.locator('.success-panel').waitFor();assert.match(await page.locator('.success-panel').innerText(),/MÁY CHỦ XÁC NHẬN/);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-server')).filter(row=>row.id.startsWith('custom-')).length),1);
 });
 await run('cache-write-error-does-not-revoke-cloud-ack',async({page})=>{
  await review(page);await page.evaluate(()=>{CustomOrderStore.saveOrders=async()=>{throw Error('Quota thử');};});await page.locator('#submit-order').click();
  await page.locator('.success-panel').waitFor();assert.match(await page.locator('#toast').innerText(),/Máy chủ đã xác nhận.*Chưa giữ được/s);
  const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-server'))[0].id);
  await page.reload();await page.locator('#model-search').waitFor();await page.locator('[data-action=orders]:visible').first().click();await page.locator(`[data-order="${id}"]`).waitFor();
  assert.equal(await page.evaluate(()=>window.__calls.filter(call=>call.name==='commit_custom_order').length),0,'Cloud ACK is read back without resubmitting');
 });
 await run('legacy-draft-and-independent-confirmed-cache',async({page})=>{
  assert.equal(await page.locator('#customer-name').inputValue(),'Nháp từ phiên cũ','The existing draft database remains compatible');
  const result=await page.evaluate(async()=>{
   const scope='11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222';
   await CustomOrderStore.saveOrders(scope,[{id:'cache-proof',stage:3}],200);
   await CustomOrderStore.saveOrders(scope,[{id:'cache-proof',stage:0}],100);
   const oldDraft=await CustomOrderStore.load(scope);await CustomOrderStore.save(scope,oldDraft);
   await new Promise((resolve,reject)=>{const request=indexedDB.open('platedio-custom-orders-v1',1);request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
   return {order:(await CustomOrderStore.loadOrders(scope)).find(row=>row.id==='cache-proof'),foreign:await CustomOrderStore.loadOrders('another-workspace:another-user')};
  });
  assert.equal(result.order.stage,3,'Older in-flight reads and stale draft snapshots cannot erase a newer confirmed cache record');
  assert.deepEqual(result.foreign,[],'Confirmed cache is scoped by workspace and account');
 },{legacy:true});
 writeFileSync(resolve(out,'summary.json'),JSON.stringify({status:results.every(row=>row.status==='PASS')?'PASS':'FAIL',scope:'Isolated browser/IndexedDB, mocked transport; no production writes',results},null,2));
 assert.ok(results.every(row=>row.status==='PASS'),results.filter(row=>row.status==='FAIL').map(row=>row.name).join(', '));
}finally{await browser.close();}
