/* Native Print Progress: no live writes, real routes, all views and scroll owners. */
import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const out=resolve('qa-results/progress');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const [width,height] of [[320,780],[390,900],[768,900],[1024,900],[1440,900],[844,390]])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*.supabase.co/**',route=>route.abort());
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof goPage==='function');
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
   currentUser=null;cloudReady=false;
   const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100"><rect width="180" height="100" fill="#bf8050"/><circle cx="90" cy="50" r="32" fill="#eee"/></svg>');
   fils=[{id:'red',name:'Đỏ',hex:'#c44'},{id:'blue',name:'Xanh',hex:'#48c'}];
   models=Array.from({length:3},(_,i)=>({id:'m'+i,name:i===0?'Hộp khăn giấy — Model tên dài để kiểm tra không bị tràn':'Model '+i,images:i===0?[photo]:i===1?['https://qa.invalid/broken.jpg']:[],parts:[{id:'body',name:'Thân',qtyPerModel:1},{id:'foot',name:'Chân dài cần kiểm tra bố cục',qtyPerModel:1}],variants:[{id:'small',name:'Nhỏ'},{id:'large',name:'Lớn'}]}));
   projects=[{id:'project',name:'Dự án kiểm tra'}];
   orders=Array.from({length:20},(_,i)=>({id:'o'+i,note:'Đơn '+i+' — Tên đơn dài để kiểm tra trên điện thoại',projectId:i<3?'project':'',status:i===19?'cancelled':'waiting',createdAt:new Date(Date.UTC(2026,9,9,0,i)).toISOString(),items:[{id:'item'+i,modelId:'m'+i%3,modelName:models[i%3].name,variantId:i%2?'large':'small',qty:4}]}));
   plates=[{id:'plate',name:'Plate đỏ',filamentId:'red'}];
   pitems=orders.flatMap((order,i)=>[1,4,120].map((qty,n)=>({id:'p'+i+'-'+n,orderId:order.id,orderItemId:'item'+i,modelId:'m'+i%3,variantId:i%2?'large':'small',partId:n?'foot':'body',partName:n?'Chân dài cần kiểm tra bố cục':'Thân',filamentId:n%2?'blue':'red',plateId:'plate',qty,qtyDone:i===0?qty:n===1?2:0})));
   operations={qualityIssues:[],deliveries:[],printPlans:[]};normalizeOperations();
   batchReports=[{id:'report',external:true,status:'done',createdAt:new Date().toISOString(),filamentId:'red',manualItems:[{modelId:'m0',modelName:models[0].name,partId:'body',partName:'Thân',qty:3}]},{id:'pending',status:'pending',createdAt:new Date().toISOString(),manualItems:[]}];fulfillmentCloudManualReports=[];
   goPage('progress',{historyMode:'none'});
  },theme);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#ov-print-progress,#pp-sb,.pp-mobile-nav').count(),0,'No legacy overlay or second navigation');
  assert.equal(await page.locator('#print-progress-workspace').count(),1);
  assert.equal(await page.locator('#pp-queue-list [data-oid="o19"]').count(),0,'Cancelled order excluded');
  assert.equal(await page.locator('#pp-queue-list [data-oid="o0"] .pp-mi').count(),0,'Complete order starts collapsed');
  await page.locator('[data-progress-focus="complete:o0"]').click();
  assert.equal(await page.locator('#pp-queue-list [data-oid="o0"] .pp-mi').count(),1);
  const modelToggle=page.locator('[data-progress-focus="model:o1::item1"]');
  await modelToggle.focus();await page.keyboard.press('Enter');
  assert.equal(await modelToggle.getAttribute('aria-expanded'),'true','Keyboard expands model');
  const partInput=page.locator('[data-progress-focus="quantity:p1-1"]');
  await partInput.focus();
  assert.equal(await partInput.evaluate(input=>{const css=getComputedStyle(input),shell=getComputedStyle(input.closest('.progress-quantity'));return css.borderTopWidth==='0px'&&css.boxShadow==='none'&&css.outlineStyle==='none'&&shell.outlineStyle!=='none';}),true,'Stepper has one shell focus ring, not nested input borders');
  await partInput.fill('3');await partInput.press('Tab');await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>pitems.find(p=>p.id==='p1-1').qtyDone),3,'Existing handler persists actual quantity');
  assert.equal(await page.locator('[data-progress-focus="model:o1::item1"]').getAttribute('aria-expanded'),'true');
  await page.evaluate(()=>closeDialog('dlg-mv'));
  const search=page.getByRole('searchbox',{name:'Tìm tiến độ'});
  await search.fill('khan giay');
  assert.ok(await search.evaluate(input=>input===document.activeElement),'Filtering keeps search focus');
  assert.ok(await page.locator('#pp-queue-list .pp-oc').count()>0,'Search folds Vietnamese accents');
  await search.fill('khong co ket qua');assert.equal(await page.locator('#pp-queue-list .pp-oc').count(),0);
  await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();
  const metrics=async()=>page.evaluate(()=>{
   const root=document.getElementById('print-progress-workspace'),summary=root.querySelector('.progress-summary'),list=document.getElementById('pp-queue-list');
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,nested:[...root.querySelectorAll('*')].filter(el=>['auto','scroll'].includes(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1).map(el=>el.className),gap:list.getBoundingClientRect().top-summary.getBoundingClientRect().bottom,touch:[...root.querySelectorAll('.progress-toolbar select,.progress-toolbar .btn,.progress-quantity button,.pp-quality-btn')].filter(el=>el.getClientRects().length).every(el=>el.getBoundingClientRect().height>=43.99),cards:[...root.querySelectorAll('.pp-oc,.pp-group-card,.pp-external-card')].every(el=>el.getBoundingClientRect().right<=innerWidth+1)};
  });
  for(const mode of ['orders','models','plates','external']){
   await page.locator('#pp-view').selectOption(mode);await page.waitForTimeout(150);
   const m=await metrics();assert.equal(m.overflow,false,mode);assert.deepEqual(m.nested,[],mode+' shares app scroll');assert.ok(m.gap<=14&&m.gap>=0,mode+' no viewport blank gap');assert.equal(m.touch,true,mode+' 44px controls');assert.equal(m.cards,true);
   if(mode==='external')assert.equal(await page.locator('#pp-status').isVisible(),false,'Order status is not applied to outside reports');
   if(width===390||width===1440||height<500){await page.evaluate(()=>document.getElementById('pg-content').scrollTo(0,0));await page.screenshot({path:`${out}/${width}-${height}-${theme}-${mode}.png`});}
  }
  await page.evaluate(()=>openPrintProgress({type:'project',id:'project'}));
  assert.equal(await page.locator('#pp-scope-banner').isVisible(),true);
  assert.equal(await page.locator('#pp-queue-list .pp-oc').count(),3,'Project links scope the same native page');
  await page.evaluate(()=>openPrintProgress({type:'order',id:'o1'}));
  assert.equal(await page.locator('#pp-queue-list .pp-oc').count(),1);
  assert.equal(await page.evaluate(()=>canAutoApplyRemoteRefresh()),true,'Viewing progress no longer blocks realtime as an overlay');
  await page.evaluate(()=>{ppScope=null;renderQueue();document.getElementById('pg-content').scrollTop=600;window.progressScroll=document.getElementById('pg-content').scrollTop;window.progressMedia=document.querySelector('[data-oid="o3"] .pp-mi-media img');renderQueue();});
  assert.equal(await page.evaluate(()=>document.getElementById('pg-content').scrollTop===progressScroll),true,'Updates retain app scroll');
  assert.equal(await page.evaluate(()=>!progressMedia||progressMedia===document.querySelector('[data-oid="o3"] .pp-mi-media img')),true,'Unchanged card images stay mounted');
  await page.evaluate(()=>{currentUser={id:'viewer'};canAccess=permission=>permission==='progress.view';renderQueue();});
  assert.equal(await page.locator('#pp-new-order').isVisible(),false);assert.equal(await page.locator('.progress-quantity').count(),0,'Read-only role cannot edit progress');
  await page.evaluate(()=>{currentUser=null;ppScope=null;document.getElementById('pp-search').value='khan giay';setPpFilter('ready');setPpView('models');goPage('orders');});
  await page.goBack();await page.waitForTimeout(150);
  assert.equal(await search.inputValue(),'khan giay','Back restores search');assert.equal(await page.locator('#pp-view').inputValue(),'models');assert.equal(await page.locator('#pp-status').inputValue(),'ready');
  await page.evaluate(()=>{currentUser=null;goPage('orders',{historyMode:'none'});window.siblingRect=document.getElementById('page-orders').getBoundingClientRect().toJSON();goPage('progress',{historyMode:'none'});goPage('orders',{historyMode:'none'});});
  assert.deepEqual(await page.evaluate(()=>{const rect=document.getElementById('page-orders').getBoundingClientRect();return [rect.x,rect.width];}),await page.evaluate(()=>[siblingRect.x,siblingRect.width]),'No layout leakage into adjacent pages');
  await page.evaluate(()=>goPage('progress'));await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof goPage==='function');
  await page.evaluate(()=>{document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');goPage('progress',{historyMode:'replace'});});
  assert.equal(await page.locator('#pp-search').inputValue(),'khan giay','Reload restores the view before authenticated render');assert.equal(await page.locator('#pp-view').inputValue(),'models');
  assert.deepEqual(errors,[]);
  console.log(`PASS native progress ${width}x${height}/${theme}: four views, layout, shared scroll, keyboard, stepper, roles, scopes, DOM preservation`);
  await context.close();
 }
}finally{await browser.close();}
