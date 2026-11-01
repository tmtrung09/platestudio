import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {waitForAppReady} from './app-ready-qa.mjs';
import {checkSurfaces} from './surface-contract-qa.mjs';
// QA_SURFACE_BASE points at a deployed build; the same read-only fixtures and
// assertions then exercise its real assets, with all other origins blocked.
const liveBase=process.env.QA_SURFACE_BASE,out=resolve(liveBase?'qa-results/surfaces/live-native':'qa-results/surfaces');mkdirSync(out,{recursive:true});
const source=readFileSync('plate-studio.html','utf8'),routes=[...source.matchAll(/<div class="page(?: active)?" id="page-([^"]+)"/g)].map(m=>m[1]);
assert.ok(readFileSync('push-sw.js','utf8').includes('./assets/app/surfaces.css'),'Surface theme is cached for offline reload');
for(const file of ['plate-studio.html','custom-orders.html','order-status.html'])assert.ok(readFileSync(file,'utf8').includes('assets/app/surfaces.css'),file+' uses the shared surface theme');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];let status='FAIL';
try{for(const width of [320,390,844,1440].filter(width=>!process.env.QA_SURFACE_WIDTH||width===Number(process.env.QA_SURFACE_WIDTH)))for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:width===844?390:950},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage();
 await context.route(/^https?:/,route=>liveBase&&new URL(route.request().url()).origin===new URL(liveBase).origin?route.continue():route.abort());
 await page.goto(liveBase?new URL('plate-studio.html?ps_release='+(process.env.QA_SURFACE_REVISION||''),liveBase).href:pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});await waitForAppReady(page);
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
  isWorkspaceOwner=()=>true;canAccess=()=>true;sb=null;currentUser=null;cloudReady=false;
  models=Array.from({length:60},(_,i)=>({id:'surface-'+i,name:'Bàn phím tên '+i,parts:[{id:'part-'+i,name:'Khay',qtyPerModel:1,filamentIds:[]}],variants:[],images:[],cats:['QA']}));
  orders=[];projects=[];plates=[];pitems=[];batchReports=[];normalizeOperations();
 },theme);
 for(const route of routes){
  await page.evaluate(route=>route==='order-form'?openOrderForm():goPage(route,{historyMode:'none'}),route);
  await page.waitForTimeout(60);const count=await checkSurfaces(page,`${width}/${theme}/${route}`,'.page.active');results.push({width,theme,route,count});
  if([390,1440].includes(width)&&['dashboard','models','orders','fulfillment','sales','inventory','printer-monitor'].includes(route)){await page.evaluate(()=>document.activeElement?.blur());await page.waitForTimeout(350);await page.screenshot({path:resolve(out,`${width}-${theme}-${route}.png`)});}
 }
 await page.evaluate(()=>goPage('models',{historyMode:'none'}));
 await checkSurfaces(page,`${width}/${theme}/shared navigation`);
 const search=page.locator('#model-smart-search');await search.fill('ban phim ten');assert.ok(await page.locator('#model-grid .model-card').count()>0);
 await search.focus();assert.equal(await search.evaluate(el=>document.activeElement===el),true);
 const focus=await search.evaluate(el=>{const holder=el.closest('.page-smart-search')||el,s=getComputedStyle(holder);return {width:parseFloat(s.outlineWidth),style:s.outlineStyle,inner:holder!==el?getComputedStyle(el).outlineWidth:null};});
 assert.ok(focus.width>=2&&focus.style==='solid','Visible keyboard focus remains');if(focus.inner!==null)assert.equal(focus.inner,'0px','Composite search has one focus ring');
 await search.fill('');await page.locator('#page-models .btn-ac').first().focus();await page.keyboard.press('Tab');
 await page.evaluate(()=>{modelSelectionMode=true;toggleModelSelected('surface-0');document.activeElement?.blur();});
 const selected=page.locator('.model-card.is-selected');assert.equal(await selected.count(),1);assert.equal(await selected.locator('input[type=checkbox]').isChecked(),true);
 await page.waitForFunction(()=>{const el=document.querySelector('.model-card.is-selected');return el&&getComputedStyle(el).outlineWidth==='0px';},null,{timeout:5000});
 const selectedStyle=await page.evaluate(()=>{const el=document.querySelector('.model-card.is-selected');return {bg:getComputedStyle(el).backgroundColor,other:getComputedStyle(document.querySelector('.model-card:not(.is-selected)')).backgroundColor,outline:getComputedStyle(el).outlineWidth};});assert.notEqual(selectedStyle.bg,selectedStyle.other);assert.equal(selectedStyle.outline,'0px','Selection uses fill and checkbox instead of a permanent ring');
 await page.evaluate(()=>viewModel('surface-0'));await checkSurfaces(page,'model detail dialog','#dlg-mv');await page.evaluate(()=>closeDialog('dlg-mv'));
 await page.evaluate(()=>openEditModel('surface-0'));await checkSurfaces(page,'model edit dialog','#dlg-model');await page.evaluate(()=>closeDialog('dlg-model'));
 const fields=await page.evaluate(()=>{
  const panel=document.createElement('section');panel.id='surface-state-qa';panel.className='card';panel.style.cssText='position:fixed;top:60px;right:12px;z-index:20000;width:min(300px,calc(100vw - 24px));max-height:calc(100dvh - 80px);overflow:auto';panel.innerHTML='<label class="field">Tên<input id="surface-input" value="Bản nháp" aria-invalid="true"></label><button class="btn btn-ghost" disabled>Đang lưu</button><input type="checkbox" aria-label="Chọn"><input type="range" aria-label="Mức"><span class="cdot" style="background:#ca38ff"></span>';document.body.append(panel);
  const input=panel.querySelector('input'),checkbox=panel.querySelector('[type=checkbox]'),range=panel.querySelector('[type=range]');return {error:getComputedStyle(input).backgroundColor,card:getComputedStyle(panel).backgroundColor,disabled:panel.querySelector('button').disabled,swatch:getComputedStyle(panel.querySelector('.cdot')).backgroundColor,checkbox:checkbox.type,range:range.type};
 });assert.notEqual(fields.error,fields.card);assert.equal(fields.disabled,true);assert.equal(fields.swatch,'rgb(202, 56, 255)');assert.equal(fields.checkbox,'checkbox');assert.equal(fields.range,'range');await checkSurfaces(page,'error/disabled/data colors','#surface-state-qa');
 await page.locator('#surface-state-qa').evaluate(el=>el.insertAdjacentHTML('beforeend','<button class="ftag active">Đã chọn</button><button class="cpick-brand on">Hãng đang chọn</button>'));
 for(const selector of ['.ftag.active','.cpick-brand.on']){
  const chip=page.locator('#surface-state-qa '+selector);await chip.hover();const ratio=await chip.evaluate(el=>{const s=getComputedStyle(el),lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0),a=lum(s.color),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert.ok(ratio>=4.5,`${theme}/${selector}: selected/hover text stays readable on its fill`);
 }
 await page.emulateMedia({forcedColors:'active'});await page.locator('#surface-input').focus();
 const forced=await page.locator('#surface-state-qa').evaluate(el=>({outline:parseFloat(getComputedStyle(el.querySelector('#surface-input')).outlineWidth),swatch:getComputedStyle(el.querySelector('.cdot')).backgroundColor}));assert.ok(forced.outline>=3,'System high contrast keeps an explicit focus affordance');assert.equal(forced.swatch,'rgb(202, 56, 255)','Data pigments survive forced colors');
 await context.close();console.log(`PASS surfaces ${width}/${theme}: ${routes.length} native routes, flat controls/cards, filled states, single keyboard focus, original data colors`);
}status='PASS';}finally{await browser.close();writeFileSync(resolve(out,'summary.json'),JSON.stringify({status,checks:results.length,results},null,2));}
