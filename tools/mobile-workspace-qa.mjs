import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {waitForAppReady} from './app-ready-qa.mjs';
const liveBase=process.env.QA_MWS_BASE?new URL(process.env.QA_MWS_BASE):null;
const target=liveBase?new URL('plate-studio.html',liveBase):pathToFileURL(resolve('plate-studio.html'));
if(liveBase&&process.env.QA_MWS_REVISION)target.searchParams.set('ps_release',process.env.QA_MWS_REVISION);
const out=resolve(liveBase?'qa-results/mobile-workspace-live':'qa-results/mobile-workspace');mkdirSync(out,{recursive:true});
const source=readFileSync('assets/app/mobile-workspace.js','utf8');
assert.ok(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bindexedDB\b|localStorage|sessionStorage|\.rpc\(/.test(source),'Presentation cannot create a second persistence or network path');
for(const file of ['plate-studio.html','custom-orders.html','order-status.html'])assert.ok(readFileSync(file,'utf8').includes('assets/app/mobile-workspace.js'),file+' must use the shared mobile layer');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let status='FAIL';const results=[];
const profiles=[[320,740,true],[390,844,true],[640,360,false],[844,390,true],[1024,768,true],[1440,1000,false]].filter(([width])=>!process.env.QA_MWS_WIDTH||String(width)===process.env.QA_MWS_WIDTH);
try{for(const [width,height,touch] of profiles)for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 await context.route(/^https?:/,route=>liveBase&&new URL(route.request().url()).origin===liveBase.origin?route.continue():route.abort());page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);
 await page.goto(target.href,{waitUntil:'domcontentloaded'});await waitForAppReady(page);
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
  isWorkspaceOwner=()=>true;canAccess=()=>true;sb=null;currentUser=null;cloudReady=false;maybeStartPageGuide=()=>{};
  models=Array.from({length:12},(_,i)=>({id:'mobile-'+i,name:'Bàn phím tên '+i,parts:[{id:'part-'+i,name:'Khay',qtyPerModel:1,filamentIds:[]}],variants:[],images:[],cats:['QA']}));
  orders=[];projects=[];plates=[];pitems=[];batchReports=[];normalizeOperations();
  kiotViet={catalog:[{sku:'MOBILE',name:'Bàn phím tên',stock:3}],mappings:[],skippedSkus:[],mappingRevisions:{},sales:[],salesImports:[],snapshots:[],aiInsights:[]};
 },theme);
 const inventory=await page.evaluate(()=>({core:Object.keys(PAGE_META).sort(),mobile:Object.keys(PlateMobileRoutes.native).sort()}));assert.deepEqual(inventory.mobile,inventory.core,'All native routes must have an explicit presentation policy');
 const mobile=width<=860||touch&&width<=1100;
 for(const route of inventory.core){
  await page.evaluate(route=>route==='order-form'?openOrderForm():route==='kiotviet-map'?openKiotMappingDialog('MOBILE'):goPage(route,{historyMode:'none'}),route);await page.waitForTimeout(80);
  if(mobile)await page.waitForFunction(route=>document.querySelector('.page.active')?.dataset.mobileRoute===route,route);
  const shape=await page.evaluate(()=>{const el=document.querySelector('.page.active');return {active:PlateMobileWorkspace.active(),route:el.dataset.mobileRoute,family:el.dataset.mobileFamily,overflow:document.documentElement.scrollWidth>innerWidth+1,duplicates:PlateMobileWorkspace.inspect().duplicateIds};});
  assert.equal(shape.active,mobile);if(mobile){assert.equal(shape.route,route);assert.ok(shape.family,route+' family is present');}assert.equal(shape.overflow,false,`${width}/${theme}/${route}: viewport overflow`);assert.deepEqual(shape.duplicates,[],route+' no duplicate widget IDs');
  results.push({width,theme,route,mobile});
  if(route==='dashboard')assert.equal(await page.locator('#dash-search').isVisible(),false,'Retired desktop dashboard widgets remain hidden rather than resurfacing after projection');
  if(route==='order-form')assert.ok(await page.locator('#ov-order-form .of-p-thumb>svg').evaluateAll(icons=>icons.length>0&&icons.every(icon=>{const box=icon.getBoundingClientRect();return box.width<=48&&box.height<=48&&getComputedStyle(icon).fill==='none';})),'Missing-image SVGs retain a bounded outline on desktop and mobile');
  assert.ok(await page.locator('.page.active .production-navigation-slot').count()<=1,'One production navigation owner per page, including permission rebuilds');
  if(mobile&&route==='orders')assert.equal(await page.locator('#ftbtn-orders').isVisible(),true,'The order filter is a primary library action, reachable without opening secondary tools');
  if(mobile&&route==='fulfillment')assert.equal(await page.locator('.page.active').evaluate(el=>el.querySelector('.fulfillment-command-bar').getBoundingClientRect().bottom<=el.querySelector('#fulfillment-page').getBoundingClientRect().top+1),true,'Fulfillment search and primary actions precede the focused workspace');
  if(mobile)assert.equal(await page.locator('.page.active').evaluate(el=>{const copy=el.querySelector('.mws-identity'),art=el.querySelector(':scope > .page-heading > .page-info-art');return !copy||!art||[...copy.children].every(child=>child.getBoundingClientRect().right<=art.getBoundingClientRect().left+1&&child.scrollWidth<=child.clientWidth+1);}),true,route+' heading text remains readable beside the artwork');
  if(mobile&&route==='models'){
   const targets=await page.locator('.model-signal-button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect(),s=getComputedStyle(button);return {width:r.width,height:r.height,minWidth:s.minWidth,minHeight:s.minHeight};}));
   assert.ok(targets.every(r=>r.width>=43.99&&r.height>=43.99),'Stock information buttons retain 44px touch regions (subpixel tolerance 0.01px): '+JSON.stringify(targets));
  }
  if(mobile&&route==='dashboard'&&await page.locator('.mws-disclosure').count()){
   assert.equal(await page.locator('.mws-disclosure .dashboard-role-kpi').first().isVisible(),false);
   await page.locator('.mws-disclosure>summary').click();assert.equal(await page.locator('.mws-disclosure .dashboard-role-kpi').first().isVisible(),true,'Statistics remain reachable through the mobile disclosure');await page.locator('.mws-disclosure>summary').click();
  }
  if(width===390&&['dashboard','models','sales','printer-monitor','order-form','kiotviet','fulfillment'].includes(route)){await page.evaluate(()=>{document.activeElement?.blur();document.getElementById('pg-content').scrollTo({top:0,behavior:'instant'});});await page.waitForTimeout(350);await page.screenshot({path:resolve(out,`${width}-${theme}-${route}.png`)});}
 }
 await page.evaluate(()=>goPage('models',{historyMode:'none'}));await page.locator('#model-smart-search').fill('ban phim');
 await page.locator('#model-smart-search').evaluate(el=>{window.mwsSearch=el;el.focus();el.setSelectionRange(2,2);window.mwsSources=JSON.stringify({models,orders,kiotViet});const all=allPageLayoutPrefs();all.local={models:{order:[document.getElementById('model-grid').dataset.layoutSlot||'model-grid-0'],hidden:[]}};localStorage.setItem('ps_page_layout_prefs',JSON.stringify(all));window.mwsDesktopPrefs=JSON.stringify(all.local);});
 const before=await page.evaluate(()=>({input:document.getElementById('model-smart-search'),count:document.querySelectorAll('#model-grid .model-card').length}));assert.ok(before.count>0);
 await page.setViewportSize({width:mobile?1440:390,height:900});await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>[mwsSearch===document.getElementById('model-smart-search'),document.querySelectorAll('#model-smart-search').length,JSON.stringify({models,orders,kiotViet})===mwsSources]),[true,1,true],'Changing presentation preserves source widgets and data');
 await page.setViewportSize({width,height});await page.waitForTimeout(100);
 assert.equal(await page.locator('#model-smart-search').inputValue(),'ban phim');
 assert.equal(await page.evaluate(()=>JSON.stringify(allPageLayoutPrefs().local)),await page.evaluate(()=>mwsDesktopPrefs),'Mobile layout cannot normalize away desktop layout preferences');
 if(mobile){
  await page.evaluate(()=>{closeModelSignal();document.getElementById('pg-content').scrollTop=350;});await page.waitForFunction(()=>document.getElementById('global-scroll-top').classList.contains('is-visible'));
  await page.locator('#page-options-toggle').click();assert.equal(await page.locator('#page-options-panel>#global-scroll-top').isVisible(),true,'Scroll-to-top stays available in page tools without floating over form actions');
  await page.locator('#global-scroll-top').click();await page.waitForFunction(()=>document.getElementById('pg-content').scrollTop<2);assert.equal(await page.locator('#page-options-tools').evaluate(el=>el.open),false);
 }else assert.equal(await page.locator('#global-scroll-top').evaluate(el=>el.parentElement===document.body),true,'Desktop restores its existing scroll control');
 await page.evaluate(()=>viewModel('mobile-0'));await page.waitForTimeout(80);
 if(mobile){assert.equal(await page.locator('#dlg-mv .mws-dialog').count(),1);assert.equal(await page.locator('#dlg-mv .mws-dialog-body').count(),1);}
 await page.evaluate(()=>closeDialog('dlg-mv'));
 if(mobile){
  await page.evaluate(()=>openOrderForm('mobile-0'));await page.waitForFunction(()=>document.querySelector('.mws-order-steps'));
  await page.locator('[data-mws-order="catalog"]').click();await page.locator('.mws-order-actions button').click();assert.equal(await page.locator('#of-o-note').evaluate(el=>el===document.activeElement),true,'Primary next action focuses the new task step');await page.locator('#of-o-note').fill('Nháp điện thoại giữ nguyên');
  await page.evaluate(()=>{window.mobileOrderNote=document.getElementById('of-o-note');window.mobileCartSnapshot=JSON.stringify(cart);});
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(100);await page.setViewportSize({width,height});await page.waitForTimeout(100);
  assert.equal(await page.locator('#of-o-note').inputValue(),'Nháp điện thoại giữ nguyên');assert.deepEqual(await page.evaluate(()=>[mobileOrderNote===document.getElementById('of-o-note'),JSON.stringify(cart)===mobileCartSnapshot]),[true,true],'Order fields and cart survive mobile/desktop changes without copying or resubmitting');
  await page.evaluate(()=>{window.mwsOriginalViewport=visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:280,offsetTop:0}});PlateMobileWorkspace.sync();});
  await page.waitForFunction(()=>document.documentElement.dataset.mobileShortView==='true');
  assert.equal(await page.locator('#page-order-form').evaluate(el=>getComputedStyle(el).overflowY),'visible','A keyboard-reduced visual viewport uses page scrolling rather than clipping the requirements');
  await page.locator('#of-o-note').fill('Nháp khi mở bàn phím');assert.equal(await page.evaluate(()=>mobileOrderNote===document.activeElement),true);
  await page.evaluate(()=>{Object.defineProperty(window,'visualViewport',{configurable:true,value:mwsOriginalViewport});PlateMobileWorkspace.sync();});
  await page.waitForTimeout(50);assert.equal(await page.locator('#of-o-note').inputValue(),'Nháp khi mở bàn phím');
 }
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS global mobile ${width}/${theme}: ${inventory.core.length} routes, all families, navigation, single widget ownership and preserved data across presentation changes`);
}status='PASS';}finally{await browser.close();writeFileSync(resolve(out,'summary.json'),JSON.stringify({status,checks:results.length,results},null,2));}
