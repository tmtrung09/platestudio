import {waitForAppReady} from './app-ready-qa.mjs';
/* All real routes and the approved artwork; isolated local account and data. */
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const out=resolve('qa-results/page-info-cards');mkdirSync(out,{recursive:true});
const app=readFileSync('plate-studio.html','utf8');
const worker=readFileSync('push-sw.js','utf8');
for(const file of ['page-info-art.js','page-info-cards.js','page-info-cards.css'])assert.ok(worker.includes(`./assets/${file}`),'Artwork is available offline');
for(const file of ['page-info-art.js','page-info-cards.js'])assert.ok(new RegExp(`<script src="assets/${file}[^>]+ async>`).test(app),'Optional graphics load independently of app/camera startup');
const routes=[...app.matchAll(/<div class="page(?: active)?" id="page-([^"]+)"/g)].map(match=>match[1]);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let checks=0;
try{
 for(const [width,height] of [[320,800],[390,900],[640,360],[768,900],[1024,900],[1440,1000]])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<600,isMobile:width<600,reducedMotion:'no-preference'});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.abort());
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'load'});
 await waitForAppReady(page);
  await page.waitForFunction(()=>!!window.PlatePageInfoCards&&typeof goPage==='function');
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;
   document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
   window.qaOriginalOwner=isWorkspaceOwner;window.qaOriginalCanAccess=canAccess;
   isWorkspaceOwner=()=>true;canAccess=()=>true;
   sb=null;currentUser=null;orders=[];models=[];pitems=[];projects=[];batchReports=[];
   normalizeOperations();
   kiotViet.catalog=[{sku:'INFO-QA',name:'Sản phẩm kiểm thử thẻ',stock:0,category:'QA'}];
   kiotMappingDraft={sku:'INFO-QA',query:'',value:'',components:[],visibleCount:60};
  },theme);
  assert.equal(await page.evaluate(()=>PlatePageInfoArt.pages.length),routes.length);
  assert.ok(await page.evaluate(()=>PlatePageInfoArt.pages.every(page=>validHistoryPage(page.id))),'All card routes are recognized on reload');
  for(const route of routes){
   await page.evaluate(route=>{if(route==='order-form')openOrderForm();else goPage(route,{historyMode:'none'});},route);
   await page.waitForTimeout(35);
   const metrics=await page.evaluate(()=>{
    const host=document.querySelector('.page.active'),cards=host.querySelectorAll('.page-info-card'),card=cards[0];
    const copy=card?.querySelector('h1,h2'),picture=card?.querySelector('.page-info-art'),pause=card?.querySelector('.page-info-motion');
    const rect=card?.getBoundingClientRect(),button=pause?.getBoundingClientRect();
    return {page:host.id,cards:cards.length,key:card?.dataset.infoPage,art:picture?.querySelectorAll('svg.scene>*').length,clipped:copy?copy.scrollWidth>copy.clientWidth+1:true,overflow:document.documentElement.scrollWidth>innerWidth+1,button:button?{width:button.width,height:button.height}:null,width:rect?.width,height:rect?.height};
   });
   assert.equal(metrics.page,`page-${route}`,`${route}: route preserved`);
   assert.equal(metrics.cards,1,`${width}/${theme}/${route}: one info card`);
   assert.equal(metrics.key,route);assert.ok(metrics.art>2,`${route}: approved scene present`);
   assert.equal(metrics.clipped,false,`${width}/${theme}/${route}: title fits`);
   assert.equal(metrics.overflow,false,`${width}/${theme}/${route}: viewport overflow`);
   if(route==='delivery-builder')assert.ok(metrics.height<=300,'Delivery intro retains a compact height');
   assert.ok(metrics.button.width>=43.99&&metrics.button.height>=43.99,`${width}/${theme}/${route}: accessible pause target ${JSON.stringify(metrics)}`);checks++;
   if([390,1440].includes(width)&&['dashboard','orders','packaging','access','delivery-builder','printer-monitor'].includes(route)){
    await page.locator('.page.active .page-info-card').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
    await page.screenshot({path:`${out}/${width}-${theme}-${route}.png`});
   }
  }
  await page.evaluate(()=>goPage('orders',{historyMode:'none'}));
  const search=page.locator('#order-smart-search');await search.fill('Bản nháp tìm kiếm');
  await page.evaluate(()=>{window.qaInfoArt=document.querySelector('#page-orders .page-info-art');window.qaInfoInput=document.getElementById('order-smart-search');window.qaInfoData=JSON.stringify({orders,models,pitems,projects,batchReports,operations});renderOrders();});
  assert.ok(await page.evaluate(()=>window.qaInfoArt===document.querySelector('#page-orders .page-info-art')&&document.activeElement===window.qaInfoInput),'Background update preserves SVG, input and focus');
  assert.equal(await search.inputValue(),'Bản nháp tìm kiếm');
  await page.locator('#page-orders .page-info-card').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#page-orders .page-info-card').classList.contains('is-art-visible'));
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#page-orders .page-info-card .animated')].every(el=>getComputedStyle(el).animationPlayState==='running')),'Visible artwork runs');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.page:not(.active) .page-info-card .animated')].every(el=>getComputedStyle(el).animationPlayState==='paused')),'Hidden routes pause their artwork');
  await page.locator('#page-orders .page-info-motion').click();
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#page-orders .page-info-card .animated')].every(el=>getComputedStyle(el).animationPlayState==='paused')));
  await page.evaluate(()=>goPage('printer-monitor',{historyMode:'none'}));
  await page.evaluate(()=>{window.qaPrinterArt=document.querySelector('#page-printer-monitor .page-info-art');PlatePrinterMonitor.render();});
  assert.ok(await page.evaluate(()=>window.qaPrinterArt===document.querySelector('#page-printer-monitor .page-info-art')),'Printer updates preserve artwork identity');
  assert.equal(await page.locator('#page-printer-monitor .page-info-motion').getAttribute('aria-pressed'),'true','Pause follows page navigation');
  await page.locator('#page-printer-monitor .page-info-motion').click();
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#page-printer-monitor .page-info-card .animated')].every(el=>getComputedStyle(el).animationName==='none')),'System reduced motion');
  await page.evaluate(()=>goPage('orders',{historyMode:'none'}));
  assert.ok(await page.evaluate(()=>window.qaInfoData===JSON.stringify({orders,models,pitems,projects,batchReports,operations})),'Cards and motion do not write business data');
  await page.evaluate(()=>{goPage('packaging',{historyMode:'none'});window.qaPackingArt=document.querySelector('#page-packaging .page-info-art');window.qaPackingCount=document.querySelector('.packaging-summary').textContent;renderPackagingPage();});
  await page.waitForFunction(()=>window.qaPackingArt===document.querySelector('#page-packaging .page-info-art'));
  assert.ok(await page.evaluate(()=>window.qaPackingCount===document.querySelector('.packaging-summary').textContent),'Real packaging counts remain intact');
  await page.evaluate(()=>{
   isWorkspaceOwner=window.qaOriginalOwner;canAccess=window.qaOriginalCanAccess;
   currentUser={id:'info-qa-limited',email:'limited@example.invalid'};
   activeWorkspace={id:'info-qa-workspace',owner_user_id:'different-owner',permissions:['models.manage']};
   goPage('models',{historyMode:'none'});goPage('access',{historyMode:'none'});
  });
  assert.notEqual(await page.locator('.page.active').getAttribute('id'),'page-access','Card does not expose owner-only page');
  assert.equal(await page.locator('#page-access .page-info-card').isVisible(),false);
  assert.deepEqual(errors,[],`${width}/${theme}: runtime errors`);await context.close();
 }
 const fallback=await browser.newContext();const page=await fallback.newPage();
 await page.route('https://**/*',route=>route.abort());
 await page.addInitScript(()=>Object.defineProperty(window,'PlatePageInfoArt',{value:undefined,writable:false}));
 await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await waitForAppReady(page);
 await page.waitForFunction(()=>typeof goPage==='function');
 await page.evaluate(()=>{document.getElementById('auth-ov').style.display='none';goPage('orders',{historyMode:'none'});});
 assert.equal(await page.locator('#order-smart-search').count(),1,'Order workflow remains available when artwork dependency is missing');
 assert.ok(await page.evaluate(()=>typeof openBatchReportHub==='function'&&!window.PlatePageInfoCards),'Camera entry is independent of optional artwork');
 await fallback.close();
}finally{await browser.close();}
console.log(`Page info cards PASS: ${checks} actual route/viewport/theme checks, approved scenes, one card per page, touch targets, preserved search/focus/SVG, printer updates, pause/reduced motion and unchanged business data.`);
