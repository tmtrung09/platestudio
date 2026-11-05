import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
const out=resolve('qa-results/customer-care');mkdirSync(out,{recursive:true});rmSync(resolve(out,'summary.json'),{force:true});const runAt=new Date().toISOString();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true});
let checks=0;
try{for(const width of [320,390,768,1440].filter(w=>!process.env.QA_CARE_WIDTH||String(w)===process.env.QA_CARE_WIDTH))for(const theme of ['light','dark'].filter(t=>!process.env.QA_CARE_THEME||t===process.env.QA_CARE_THEME)){
 const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
 await context.addInitScript(({theme})=>{
  const token='a'.repeat(64),ws='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
  const line={id:'line',modelId:'model',qty:1,note:'Theo yêu cầu',images:[],partColors:[{partId:'tray',partName:'Khay'},{partId:'keys',partName:'Nút + ký tự'}],model:{id:'model',name:'Bàn phím tên',images:[],variants:[]}};
  const order={id:'source',customer:'An',delivery:'pickup',total:200000,deposit:200000,due:'2026-11-05',created:'2026-11-01',stage:4,lines:[line]};
  window.__bumpSource=()=>{order.due='2026-11-06';};
  const read=()=>JSON.parse(localStorage.getItem('care-server')||'{"eligible":true,"review":null,"warranties":[]}'),write=x=>localStorage.setItem('care-server',JSON.stringify(x));
  window.__careCalls=[];window.__dropAck=false;window.__offline=localStorage.getItem('care-test-offline')==='1';
  localStorage.setItem('ps_theme',theme);
  const client={auth:{getSession:async()=>({data:{session:{user:{id:user,email:'owner@example.test'}}}}),onAuthStateChange:()=>({})},rpc:async name=>{
   if(name==='ensure_workspace_membership')return {data:[{workspace_id:ws,owner_user_id:user,role:'owner',permissions:['orders.manage']}]};
   if(name==='custom_order_filaments')return {data:[]};if(name==='custom_order_catalog')return {data:{models:[],total:0}};
   if(name==='custom_order_list')return {data:{orders:[order],total:1}};return {data:null};
  },storage:{from:()=>({uploadToSignedUrl:async()=>({}),createSignedUrls:async()=>({data:[]})})},functions:{invoke:async(name,{body:b})=>{
   window.__careCalls.push({name,body:b});if(window.__offline)return {error:Error('Offline')};
   if(name==='custom-order-status')return {data:{order}};
   if(name==='custom-care-zalo')return {data:{configured:false}};
   const care=read();
   if(b.action==='reserve')return {data:{uploads:b.files.map(f=>({path:ws+'/'+b.requestId+'/'+f.id,token:'test-upload-token'}))}};
   if(b.action==='submit'){
    if(b.payload.kind==='review')care.review={...b.payload};
    else if(!care.warranties.some(row=>row.id===b.requestId))care.warranties.unshift({id:b.requestId,orderId:'source',lineId:'line',modelName:'Bàn phím tên',partId:b.payload.partId,partName:'Khay',description:b.payload.description,stage:'pending',revision:1,note:'',images:[],parts:line.partColors});
    write(care);if(window.__dropAck){window.__dropAck=false;return {error:Error('Lost acknowledgement')};}
   }
   if(b.action==='supplement'){const row=care.warranties.find(row=>row.id===b.id);row.supplement=b.message;row.stage='pending';row.revision++;write(care);}
   if(b.action==='decision'){const row=care.warranties.find(row=>row.id===b.id);row.stage=b.decision;row.note=b.note;row.revision++;if(b.decision==='approved')row.jobId='warranty-'+row.id;write(care);}
   if(b.action==='inbox'){const filtered=b.focusId?care.warranties.filter(row=>row.id===b.focusId):care.warranties;return {data:{care:{...care,warranties:filtered.slice(b.offset||0,(b.offset||0)+40),total:filtered.length,reviews:care.review?[{orderId:'source',...care.review}]:[],reviewTotal:care.review?1:0,events:[]}}};}
   return {data:{care:{...care,total:care.warranties.length,reviews:care.review?[{orderId:'source',...care.review}]:[],events:[]}}};
  }}};
  window.supabase={createClient:()=>client};const intervals=[];window.setInterval=(fn,delay)=>{if(delay===30000)intervals.push(fn);return 1;};window.__poll=async()=>{for(const fn of intervals)await fn();};
 },{theme});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>{
  const url=new URL(r.request().url());if(url.origin!=='https://care.test')throw Error('Unexpected network '+url.origin);
  if(url.pathname.endsWith('/supabase.js'))return r.fulfill({body:'/* mock SDK */',contentType:'application/javascript'});
  const file=resolve('.'+url.pathname);if(!file.startsWith(resolve('.')+sep))return r.abort();try{return r.fulfill({body:readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}catch{return r.abort();}
 });
 const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}/${theme} overflow`);
 await page.goto('https://care.test/order-status.html#'+'a'.repeat(64));await page.locator('.care-content:not([hidden])').waitFor();
 await page.locator('.care-warranty button[type=submit]').click();assert.match(await page.locator('.care-message').innerText(),/Chọn sản phẩm/);
 await page.locator('.care-products [value=line]').check();await page.locator('.care-parts [value=tray]').check();await page.locator('[name=description]').fill('Khay bị nứt ở góc.');
 await page.locator('[name=images]').setInputFiles({name:'fault.png',mimeType:'image/png',buffer:readFileSync('assets/app/platedio-192.png')});await page.waitForFunction(()=>document.querySelector('.care-draft-status')?.textContent.includes('Đã giữ'));
 await page.evaluate(()=>{const el=document.querySelector('[name=description]');el.focus();el.setSelectionRange(3,6);window.__bumpSource();window.__poll();});await page.waitForFunction(()=>document.querySelector('.arrival-date strong')?.textContent.includes('06/11'));assert.equal(await page.locator('[name=description]').evaluate(el=>el===document.activeElement&&el.selectionStart===3&&el.selectionEnd===6),true,'Source polling preserves care focus and caret');await page.locator('#theme-toggle').click();assert.equal(await page.locator('[name=description]').inputValue(),'Khay bị nứt ở góc.','Theme render preserves form');assert.equal(await page.locator('.care-previews img').count(),1);
 await page.reload();await page.locator('.care-content:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('[name=description]')?.value==='Khay bị nứt ở góc.');assert.equal(await page.locator('.care-previews img').count(),1,'Blob draft survives reload');
 await page.waitForFunction(async()=>!!await CustomOrderStore.load('public-order:'+'a'.repeat(64)));await page.evaluate(()=>localStorage.setItem('care-test-offline','1'));await page.reload();await page.locator('.care-content:not([hidden])').waitFor();assert.equal(await page.locator('[name=description]').inputValue(),'Khay bị nứt ở góc.','Offline API reload preserves the cached order and draft');await page.locator('.care-warranty button[type=submit]').click();await page.locator('.care-retry:not([hidden])').waitFor();await page.evaluate(()=>{localStorage.removeItem('care-test-offline');window.__offline=false;window.__dropAck=true;});await page.locator('[data-care-retry]').click();await page.locator('.care-retry:not([hidden])').waitFor();const sentId=await page.evaluate(()=>window.__careCalls.find(x=>x.body?.action==='submit').body.requestId);
 await page.reload();await page.waitForFunction(()=>document.querySelector('.care-requests')?.textContent.includes('Khay bị nứt'));assert.equal(await page.locator('.care-requests [data-care-id]').count(),1,'Lost ACK retry does not duplicate');
 assert.equal(await page.evaluate(()=>window.__careCalls.find(x=>x.body?.action==='submit').body.requestId),sentId,'Retry preserves request ID');await noOverflow();
 await page.locator('[data-rating=experience][data-value="5"]').click();await page.locator('[data-rating=quality][data-value="3"]').click();await page.locator('[name=message]').fill('<img src=x onerror="window.injected=1">');await page.locator('.care-review button[type=submit]').click();await page.locator('.care-reviewed:not([hidden])').waitFor();assert.equal(await page.evaluate(()=>!!window.injected),false);
 if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}-customer.png`),fullPage:true});
 await page.goto('https://care.test/custom-orders.html?care='+sentId);await page.locator('.care-staff-list [data-care-id]').waitFor();assert.equal(await page.locator('[data-decision=approved]').count(),1);await noOverflow();
 await page.locator('[name=decision-note]').fill('Bạn mô tả rõ góc bị nứt.');if(width===1440&&theme==='light'){
 await page.waitForFunction(async cid=>(await CustomOrderStore.load('care-manager:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222'))?.decisions?.[cid]?.note==='Bạn mô tả rõ góc bị nứt.',sentId);
 await page.reload();await page.locator('[data-decision=info]').waitFor();assert.equal(await page.locator('[name=decision-note]').inputValue(),'Bạn mô tả rõ góc bị nứt.','Manager response draft survives reload');
 await page.evaluate(()=>{const care=JSON.parse(localStorage.getItem('care-server'));care.warranties[0].revision++;localStorage.setItem('care-server',JSON.stringify(care));document.getElementById('theme-toggle').focus();window.__poll();});await page.locator('[data-care-reconcile]').waitFor();const decisions=await page.evaluate(()=>window.__careCalls.filter(x=>x.body?.action==='decision').length);await page.locator('[data-decision=info]').click();assert.equal(await page.evaluate(()=>window.__careCalls.filter(x=>x.body?.action==='decision').length),decisions,'Changed revision requires explicit reconciliation');await page.locator('[data-care-reconcile]').click();await page.waitForFunction(()=>!document.querySelector('[data-care-reconcile]'));assert.equal(await page.locator('[name=decision-note]').inputValue(),'Bạn mô tả rõ góc bị nứt.');
}await page.locator('[data-decision=info]').click();await page.waitForFunction(()=>document.querySelector('.care-staff-list')?.textContent.includes('Cần bổ sung'));await page.goto('https://care.test/order-status.html#'+'a'.repeat(64));await page.locator('.care-supplement').waitFor();await page.locator('[name=supplement]').fill('Góc bên trái của khay.');await page.waitForTimeout(100);await page.reload();await page.locator('.care-supplement').waitFor();assert.equal(await page.locator('[name=supplement]').inputValue(),'Góc bên trái của khay.','Supplement draft survives reload');await page.locator('.care-supplement button').first().click();await page.waitForFunction(()=>document.querySelector('.care-requests')?.textContent.includes('Khách bổ sung'));await page.goto('https://care.test/custom-orders.html?care='+sentId);await page.locator('[data-decision=approved]').waitFor();await page.locator('[name=decision-note]').fill('Cửa hàng nhận in thay phần khay.');await page.locator('.care-staff-list input[type=radio][value=tray]').check();await page.locator('[data-decision=approved]').click();await page.waitForFunction(()=>document.querySelector('.care-staff-list')?.textContent.includes('Đã duyệt'));assert.equal(await page.locator('[data-decision=approved]').count(),0);
 if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}-manager.png`),fullPage:true});
 if(width===1440&&theme==='light'){await page.evaluate(()=>{const care=JSON.parse(localStorage.getItem('care-server'));care.warranties.push(...Array.from({length:55},(_,i)=>({id:crypto.randomUUID(),orderId:'source',lineId:'line',modelName:'Phiếu cũ '+i,partName:'Khay',description:'Lịch sử đã xử lý',stage:'collected',revision:1,images:[]})));localStorage.setItem('care-server',JSON.stringify(care));});await page.locator('.care-clear-filter').click();await page.locator('.care-more:not([hidden])').waitFor();await page.locator('.care-more').click();await page.waitForFunction(()=>document.querySelectorAll('.care-staff-list [data-care-id]').length===56);const before=await page.evaluate(()=>window.__careCalls.length);await page.evaluate(()=>window.__poll());await page.waitForFunction(n=>window.__careCalls.length>n,before);assert.equal(await page.locator('.care-staff-list [data-care-id]').count(),56,'Background refresh preserves loaded pages');}
 assert.deepEqual(errors,[]);checks++;console.log(`PASS production care ${width}/${theme}: real pages, persistence/blobs, immutable ACK retry, review, manager approval, source link, layout`);await context.close();
}}finally{await browser.close();}
assert.ok(checks>0,'Selected at least one UI profile');writeFileSync(resolve(out,'summary.json'),JSON.stringify({status:'PASS',checks,runAt,scope:'Real production pages, mocked server; SQL/Edge tested separately, no live writes'},null,2));
