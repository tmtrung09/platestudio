import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
const root=resolve('.'),out=resolve('qa-results/custom-orders-live'),base='https://custom-orders.test/';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const issues=[];let checks=0;
async function setup(width=390,theme='light',largeCatalog=false){
 const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block',reducedMotion:'reduce',hasTouch:width<600,isMobile:width<600});
 await context.addInitScript(largeCatalog=>{
  const ws='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',token='a'.repeat(64),revision='2026-10-25T00:00:00.000Z';
  const models=[{id:'m1',name:'Bàn phím tên',sku:'SP001',images:['http://custom-orders.test/fixture.svg'],revision,parts:[{id:'tray',name:'Khay',qtyPerModel:1},{id:'key',name:'Nút',qtyPerModel:5},{id:'unused',name:'Ẩn theo biến thể'}],variants:[{id:'v1',name:'Nhỏ',partIds:['tray','key']}]},{id:'m2',name:'Khay để bàn',sku:'SP002',images:[],revision,parts:[],variants:[]}];
  if(largeCatalog)models.push(...Array.from({length:198},(_,index)=>({id:'library-'+index,name:'Model thư viện với tên dài '+index,sku:'LIB'+index,images:index%3?[]:['http://custom-orders.test/fixture.svg'],revision,parts:[],variants:[]})));
  const fils=[{id:'green',name:'Xanh rêu',brand:'Generic',mat:'PLA',hex:'#315d34'},{id:'cream',name:'Kem',brand:'Generic',mat:'PLA',hex:'#eadfc5'}];
  const sample={id:'sample',customer:'Bảo',phone:'0900000000',address:'Địa chỉ chỉ dành cho cửa hàng',delivery:'pickup',total:280000,deposit:100000,due:'2026-10-29',stage:1,creator:'Thu Hà',created:'2026-10-25',lines:[{id:'sample-line',modelId:'m1',model:{id:'m1',name:models[0].name,images:models[0].images,variants:[{id:'v1',name:'Nhỏ'}]},variantId:'v1',qty:1,note:'Màu kem',images:[],partColors:[]}]};
  const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
  window.__calls=[];window.__failCommit=false;window.__role='store_custom';window.__uploads=[];
  const records=()=>JSON.parse(localStorage.getItem('qa-custom-server')||'[]');
  const client={
   auth:{getSession:async()=>({data:{session:{user:{id:user,email:'an@example.test',user_metadata:{full_name:'Minh An'}}}}}),onAuthStateChange:()=>({}),signOut:async()=>({})},
   rpc:async(name,args)=>{
    window.__calls.push({name,args});
    if(name==='ensure_workspace_membership'){if(localStorage.getItem('qa-offline'))return {error:{message:'Offline QA transport'}};return {data:[{workspace_id:ws,owner_user_id:'owner',permissions:['custom_orders.create','custom_orders.view'],role:window.__role}]};}
    if(name==='custom_order_filaments')return {data:fils};
    if(name==='custom_order_catalog'){const values=models.filter(model=>normalize(model.name+' '+model.sku).includes(normalize(args.q||'')));return {data:{models:largeCatalog?values.slice(args.off||0,(args.off||0)+60):values,total:values.length}};}
    if(name==='custom_order_list')return {data:{orders:records().map(row=>row.order).concat([sample]),total:records().length+1}};
    if(name==='custom_order_tracking')return {data:token};
    if(name==='commit_custom_order'){
     if(window.__failCommit)return {data:null,error:{message:'Mất mạng giả lập sau khi giữ yêu cầu.'}};
     const previous=records().find(row=>row.request===args.request);if(previous)return {data:previous.result};
     const order={id:'custom-'+args.request,...args.p,stage:0,created:'2026-10-25',creator:'Minh An',lines:args.p.lines.map((line,index)=>({...line,id:'line-'+index,model:models.find(model=>model.id===line.modelId),partColors:Object.entries(line.colorChoices).map(([partId,fid])=>({partId,partName:models[0].parts.find(part=>part.id===partId)?.name,...fils.find(fil=>fil.id===fid)}))}))};
     const result={order,token};localStorage.setItem('qa-custom-server',JSON.stringify(records().concat([{request:args.request,order,result}])));return {data:result};
    }
    return {data:null,error:{message:'Unsupported QA RPC '+name}};
   },
   storage:{from:()=>({upload:async(path,blob)=>{window.__uploads.push({path,size:blob.size});return {};},createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'http://custom-orders.test/fixture.svg'}))})})},
   functions:{invoke:async(name,{body})=>{window.__calls.push({name:'public',token:body.token});if(body.token!==token)return {error:Error('Not found')};const full=records()[0]?.order||sample;const {phone,address,...order}=full;return {data:{order:{...order,stage:window.__publicStage??order.stage,cancelled:window.__cancelled||false,lines:order.lines.map(line=>({...line,qty:window.__maliciousQty||line.qty,images:line.images.map(image=>({...image,src:'http://custom-orders.test/fixture.svg'}))}))}}};}}
  };
  window.supabase={createClient:(...args)=>{window.__clientOptions=args[2];return client;}};
  const originalInterval=window.setInterval;window.setInterval=(fn,delay,...args)=>delay===30000?(window.__poll=fn,999):originalInterval(fn,delay,...args);
 },largeCatalog);
 const page=await context.newPage();page.on('pageerror',error=>issues.push(error.message));
 await page.route(/^https?:/,route=>{
  const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
  if(url.pathname==='/assets/custom-orders/supabase.js')return route.fulfill({contentType:'application/javascript',body:'/* Isolated QA transport supplied by addInitScript. */'});
  if(url.pathname==='/fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><rect width="200" height="140" fill="#e4eaca"/><path d="m30 70 100-20 35 25-100 30Z" fill="#769867"/></svg>'});
  const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep)||!existsSync(path))return route.abort();
  return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});
 });
 await page.goto(base+'custom-orders.html',{waitUntil:'domcontentloaded'});await page.locator('#model-search').waitFor();
 if(theme==='dark')await page.locator('#theme-toggle').click();
 return {page,context};
}
async function noOverflow(page,label){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label);checks++;}
async function chooseParts(page){
 for(const [index,query,id] of [[0,'xanh reu','green'],[1,'kem','cream']]){
  await page.locator('.part-colors .br-color-picker-toggle').nth(index).click();const menu=page.locator('body>.filament-menu');
  await menu.locator('input').fill(query);assert.equal(await menu.locator('[role="option"]').count(),1);
  await menu.locator(`[data-value="${id}"]`).click();
 }
}
async function beginOrder(page){
 await page.locator('#model-search').fill('SP001');await page.waitForFunction(()=>document.querySelectorAll('.model-card').length===1);
 await page.locator('[data-model=m1]').click();assert.equal(await page.locator('#add-variant').isDisabled(),true);
 await page.locator('[data-variant=v1]').click();await page.locator('#add-variant').click();assert.equal(await page.locator('.part-color-field').count(),2,'Variant excludes unused part');
 await page.locator('[data-note]').fill('Khay xanh rêu, nút kem theo yêu cầu khách.');
}
async function fillCustomer(page){
 await page.locator('#next-step').click();await page.locator('#customer-name').fill('Linh');await page.locator('#customer-phone').fill('0901234567');await page.locator('#order-total').fill('280000');await page.locator('#order-deposit').fill('100000');await page.locator('#order-due').fill('2026-10-29');
}

async function checkProductFlow(width,theme){
 const {page,context}=await setup(width,theme,true);
 if(width===844)await page.setViewportSize({width,height:390});
 await page.waitForFunction(()=>document.querySelectorAll('.model-card').length===60);
 for(const count of [120,180,200]){await page.locator('#more-models').click();await page.waitForFunction(count=>document.querySelectorAll('.model-card').length===count,count);}
 await page.locator('[data-model=m1]').click();await page.locator('[data-variant=v1]').click();await page.locator('#add-variant').click();
 const position=await page.locator('.selected-line').first().evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,height:innerHeight};});
 assert.ok(position.top>=0&&position.top<position.height/2,'Selected requirement must be in view immediately, without scrolling past 200 models: '+JSON.stringify(position));
 assert.equal(await page.locator('#model-search').isVisible(),false,'Catalog folds after selection');
 assert.equal(await page.locator('#next-step').isVisible(),true);
 const nextBounds=await page.locator('#next-step').boundingBox();assert.ok(nextBounds.y>=0&&nextBounds.y+nextBounds.height<=page.viewportSize().height,'Next action remains in the viewport');
 if([390,1440].includes(width))await page.screenshot({path:resolve(out,width+'-'+theme+'-selected-viewport.png')});
 await page.locator('[data-note]').fill('Yêu cầu màu và tên đã chốt cùng khách');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const notePosition=await page.locator('[data-note]').evaluate(el=>{const note=el.getBoundingClientRect(),actions=document.querySelector('.product-actions').getBoundingClientRect();return {top:note.top,bottom:note.bottom,actions:actions.top};});
 assert.ok(notePosition.top>=0&&notePosition.bottom<=notePosition.actions,'The action bar must not cover the focused request: '+JSON.stringify(notePosition));
 await chooseParts(page);
 await page.locator('[data-qty][data-delta="1"]').click();
 await page.locator('[data-files]').setInputFiles({name:'flow-reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/WQAAAAASUVORK5CYII=','base64')});await page.locator('.attachment img').waitFor();
 await page.evaluate(()=>{window.__flowNote=document.querySelector('[data-note]');window.__flowImage=document.querySelector('.attachment img');window.__flowNote.setSelectionRange(3,9);window.__flowSearch=document.querySelector('#model-search');});
 await page.locator('#model-picker summary').click();
 const grid=await page.locator('#catalog').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,viewport:innerHeight}));assert.ok(grid.height<=Math.min(grid.viewport*.45,360)+1&&grid.scroll>grid.height,'Large library scrolls within a bounded picker');
 await page.locator('#model-search').fill('zz-no-model');await page.locator('#catalog .empty').waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.locator('#model-search').isVisible(),false);
 await page.locator('#model-picker summary').press('Enter');assert.equal(await page.locator('#model-search').inputValue(),'zz-no-model','Toggling preserves query');
 await page.locator('#model-search').fill('SP002');await page.locator('[data-model=m2]').waitFor();await page.locator('[data-model=m2]').click();
 assert.equal(await page.locator('#model-search').isVisible(),false,'No-variant selection also folds the picker');
 assert.equal(await page.locator('.selected-line').count(),2);
 assert.equal(await page.evaluate(()=>document.querySelector('[data-note]')===window.__flowNote&&document.querySelector('.attachment img')===window.__flowImage&&document.querySelector('#model-search')===window.__flowSearch&&window.__flowNote.selectionStart===3&&window.__flowNote.selectionEnd===9),true,'Add/search/collapse preserves existing inputs, images, caret and picker DOM');
 await page.locator('[data-note]').nth(1).fill('Món thứ hai của khách');
 await page.waitForFunction(()=>document.querySelector('.draft-hint')?.textContent.includes('Đã giữ'));
 await page.reload();await page.locator('.selected-line').nth(1).waitFor();
 assert.equal(await page.locator('#model-search').isVisible(),false,'Reload opens the saved requirements, not the catalog');
 assert.equal(await page.locator('[data-note]').first().inputValue(),'Yêu cầu màu và tên đã chốt cùng khách');assert.equal(await page.locator('[data-quantity]').first().inputValue(),'2');
 assert.equal(await page.locator('[data-part=tray]').inputValue(),'green');assert.equal(await page.locator('.attachment img').count(),1);
 await noOverflow(page,width+'/'+theme+'/compact-product-flow');
 if([390,1440].includes(width))await page.screenshot({path:resolve(out,width+'-'+theme+'-product-flow.png'),fullPage:true});
 await page.locator('#next-step').click();await page.locator('#customer-name').waitFor();
 await page.locator('[data-action=back]').click();assert.equal(await page.locator('#model-search').isVisible(),false);assert.equal(await page.locator('.selected-line').count(),2);
 // Removing the last line reopens the picker, so the empty draft has a clear next action.
 for(let left=2;left>0;left--){await page.locator('[data-remove-line]').last().click();await page.locator('[data-confirm-remove]').click();assert.equal(await page.locator('.selected-line').count(),left-1);}
 assert.equal(await page.locator('#model-search').isVisible(),true);assert.equal(await page.locator('#model-search').evaluate(el=>el===document.activeElement),true);
 await context.close();checks+=18;console.log('PASS product flow '+width+'/'+theme+': 200 models, bounded picker, immediate requirements, reachable next, preserved query/DOM/caret/image/colors/quantity, reload/back/remove');
}

try{
 for(const width of [320,390,844,1440])for(const theme of ['light','dark'])await checkProductFlow(width,theme);
 if(process.env.QA_CUSTOM_FLOW_ONLY==='1'){assert.deepEqual(issues,[]);console.log('PASS focused custom product flow');process.exitCode=0;}else{
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  const {page,context}=await setup(width,theme);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),theme==='dark'?'rgb(21, 27, 29)':'rgb(243, 242, 237)','Counter shares the approved balanced palette');
  await noOverflow(page,`${width}/${theme}/catalog`);await beginOrder(page);
  assert.equal(await page.locator('[data-part=tray]').inputValue(),'','No automatic part color');
  await page.locator('#next-step').click();assert.match(await page.locator('#toast').innerText(),/từng part/);
  await page.locator('[data-note]').evaluate(el=>{window.__note=el;});await chooseParts(page);
  assert.equal(await page.locator('[data-note]').evaluate(el=>el===window.__note),true,'Color selection preserves note DOM');
  await noOverflow(page,`${width}/${theme}/part-colors`);
  if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}-parts.png`),fullPage:true});
  await fillCustomer(page);await noOverflow(page,`${width}/${theme}/customer-form`);
  await page.locator('[data-action=back]').click();assert.equal(await page.locator('[data-part=tray]').inputValue(),'green');assert.equal(await page.locator('[data-part=key]').inputValue(),'cream');
  await page.locator('#next-step').click();await page.locator('[data-action=next]').click();assert.equal(await page.locator('#submit-order').isDisabled(),true);
  assert.match(await page.locator('.part-summary').first().innerText(),/Khay.*Xanh rêu/s);
  await page.locator('#review-confirm').check();await page.locator('#submit-order').click();await page.locator('.success-panel').waitFor();
  assert.equal(await page.locator('.qr-code svg').count(),1);assert.match(await page.locator('.qr-link').innerText(),/order-status\.html#[a-f0-9]{64}$/);
  const commit=await page.evaluate(()=>window.__calls.find(call=>call.name==='commit_custom_order'));
  assert.deepEqual(commit.args.p.lines[0].colorChoices,{tray:'green',key:'cream'});assert.equal(commit.args.p.lines[0].modelRevision,'2026-10-25T00:00:00.000Z');
  await noOverflow(page,`${width}/${theme}/confirmed-qr`);
  await page.locator('[data-action=orders]:visible').first().click();await page.locator('.order-row').first().waitFor();assert.equal(await page.locator('.order-row').count(),2,'Store sees orders from another staff member');
  await page.locator('.order-row').first().evaluate(el=>{window.__row=el;el.focus();window.__poll();});await page.waitForFunction(()=>window.__calls.filter(call=>call.name==='custom_order_list').length>=3);
  assert.equal(await page.locator('.order-row').first().evaluate(el=>el===window.__row&&el===document.activeElement),true,'Unchanged staff polling keeps row/image DOM and keyboard focus');
  await page.locator('.order-row').first().click();assert.equal(await page.locator('#detail-dialog input,#detail-dialog select,#detail-dialog textarea').count(),0,'Staff detail is read-only');assert.equal(await page.locator('[data-complete]').count(),0,'Counter cannot complete customer handoff');
  await page.locator('#detail-dialog [data-track]').click();await page.locator('.customer-hero').waitFor();
  assert.equal(await page.evaluate(()=>window.__clientOptions.auth.persistSession),false,'Public page never opens a login session');
  assert.equal(await page.locator('.demo-controls').count(),0);assert.equal(await page.locator('[data-action=create]').count(),0);
  assert.ok(!(await page.locator('.customer-page').innerText()).includes('0901234567'));assert.match(await page.locator('.part-summary').innerText(),/Khay.*Xanh rêu/s);
  assert.equal(await page.locator('.customer-contact a').getAttribute('href'),'https://www.facebook.com/banhmi.176huynhcuong');
  await noOverflow(page,`${width}/${theme}/public`);await page.evaluate(()=>{window.__scene=document.querySelector('.journey-art');window.__poll();});
  await page.waitForFunction(()=>window.__calls.filter(call=>call.name==='public').length>=2);assert.equal(await page.locator('.journey-art').evaluate(el=>el===window.__scene),true,'Unchanged poll retains scene DOM');
  await page.evaluate(()=>{window.__publicStage=3;window.__poll();});await page.waitForFunction(()=>document.querySelector('.hero-status').textContent.includes('Sẵn sàng'));
  if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}-customer.png`),fullPage:true});
  await page.evaluate(()=>{window.__maliciousQty='<img src=x onerror="window.__injected=true">';window.__poll();});await page.waitForFunction(()=>document.querySelector('.customer-product small').textContent.includes('<img'));
  assert.equal(await page.locator('.customer-order [onerror]').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.__injected)),false,'Even mutable workshop JSON is rendered as text on the public page');
  await page.evaluate(()=>{window.__cancelled=true;window.__poll();});await page.waitForFunction(()=>document.querySelector('#customer-title').textContent.includes('Đơn đã hủy'));
  assert.equal(await page.locator('.printer-head').count(),0,'Cancelled order has no printing animation');
  await context.close();console.log(`PASS custom order UI ${width}/${theme}: real adapter, shared per-part picker, variant scope, validation, create ACK, QR, public projection, unchanged polling, cancel`);
 }
 // Durable outbox after failed commit, reload, then retry using exactly the same request ID.
 const {page,context}=await setup();await beginOrder(page);await chooseParts(page);
 await page.locator('[data-files]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/WQAAAAASUVORK5CYII=','base64')});await page.locator('.attachment img').waitFor();
 await fillCustomer(page);await page.locator('[data-action=next]').click();await page.locator('#review-confirm').check();await page.evaluate(()=>{window.__failCommit=true;});await page.locator('#submit-order').click();
 await page.waitForFunction(()=>window.__calls.some(call=>call.name==='commit_custom_order'));await page.locator('[data-action=retry]').waitFor({state:'visible'});
 const original=await page.evaluate(()=>window.__calls.find(call=>call.name==='commit_custom_order').args.request);
 await page.reload();await page.locator('.success-panel').waitFor();const retry=await page.evaluate(()=>window.__calls.find(call=>call.name==='commit_custom_order'));
 assert.equal(retry.args.request,original,'Request ID survives reload');assert.equal(await page.evaluate(()=>window.__uploads.length),0,'ACKed reference upload is reused');assert.equal(retry.args.p.lines[0].images.length,1);assert.equal(await page.locator('.review-product .attachment img').count(),1);
 await context.close();
 const offline=await setup();await beginOrder(offline.page);await chooseParts(offline.page);
 await offline.page.waitForFunction(()=>document.querySelector('.draft-hint')?.textContent.includes('Đã giữ'));
 await offline.page.evaluate(()=>localStorage.setItem('qa-offline','yes'));await offline.page.reload();await offline.page.locator('.offline-note').waitFor();
 assert.equal(await offline.page.locator('[data-part=tray]').inputValue(),'green');assert.equal(await offline.page.locator('[data-part=key]').inputValue(),'cream');
 await fillCustomer(offline.page);await offline.page.locator('[data-action=next]').click();await offline.page.locator('#review-confirm').check();await offline.page.locator('#submit-order').click();await offline.page.locator('[data-action=retry]').waitFor();
 assert.equal(await offline.page.evaluate(()=>window.__calls.filter(call=>call.name==='commit_custom_order').length),0,'Offline form never claims server ACK');
 await offline.page.reload();await offline.page.locator('[data-action=retry]').waitFor();
 await offline.page.evaluate(()=>{localStorage.removeItem('qa-offline');window.dispatchEvent(new Event('online'));});await offline.page.locator('.success-panel').waitFor();
 assert.equal(await offline.page.evaluate(()=>window.__calls.filter(call=>call.name==='commit_custom_order').length),1,'Online wake resumes durable offline request');
 await offline.context.close();assert.deepEqual(issues,[],'No browser JavaScript errors');checks+=35;
 writeFileSync(resolve(out,'summary.json'),JSON.stringify({status:'PASS',checks,scope:'Mocked transport, isolated IndexedDB; SQL tested separately; no live customer/order data'},null,2));
 console.log(`PASS custom-order live UI: ${checks} layout/behavior checks; durable image/outbox reload and idempotent retry.`);
}
}finally{await browser.close();}
