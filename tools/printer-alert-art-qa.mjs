import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve as pathResolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {chromium} from 'playwright-core';
import {issueFor} from '../printer-core.mjs';
import {waitForAppReady} from './app-ready-qa.mjs';
import {assertButtonContentCentered} from './button-content-probe.mjs';

const script=readFileSync('assets/printer-alert-art.js','utf8');
const sandbox={window:{},document:{currentScript:{src:'https://qa.invalid/assets/printer-alert-art.js'}},URL};
vm.runInNewContext(script,sandbox);
const art=sandbox.window.PlatePrinterAlertArt;
const catalog=JSON.parse(readFileSync('supabase/functions/bambu-monitor/hms-en.json','utf8'));
const issue=code=>issueFor('error',code,'P1S',catalog);
const event={id:'isolated-art',type:'printer_paused',title:'Máy thử · Tạm dừng'};
let checks=0;
for(const [code,wanted] of [['03004006','nozzle-clog'],['03008016','nozzle-clog'],['07008006','feed-failed'],['12008004','retract-failed'],['03008015','runout'],['03008003','spaghetti']]){
 assert.equal(art.resolve(event,[issue(code)]),wanted,`${code}: authoritative catalog scenario`);checks++;
}
for(const original of ['Nozzle temperature is abnormal.','The extruder might be clogged.','External spool may be tangled or jammed.','Possible spaghetti failure was detected.','The build plate may have an adhesion problem.','Unknown error.']){
 assert.equal(art.resolve(event,[{severity:'error',original,code:'UNKNOWN'}]),'error','Possibility/unknown cannot become a specific diagnosis');checks++;
}
assert.equal(art.resolve(event,[{...issue('03004006'),severity:'warning'}]),'error');
assert.equal(art.resolve(event,[issue('03004006'),issue('03008015')]),'error','Conflicting specific faults retain all codes in a generic scene');
assert.equal(art.resolve({...event,type:'printer_finished'},[issue('03004006')]),'complete','Completed jobs never inherit a stale fault illustration');
checks+=3;
const out=pathResolve('qa-results/printer-alert-art');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const width of [320,390,1280])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:width===1280?900:844},reducedMotion:'no-preference'});
  await context.route(/^https?:/,r=>r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(pathResolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
  await waitForAppReady(page);await page.waitForFunction(()=>!!window.PlatePrinterAlertArt);
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.getElementById('auth-ov')?.remove();},theme);
  for(const model of ['A1','P1S','P2S','H2S'])for(const code of ['03004006','07008006','12008004','03008015','03008003','UNKNOWN','complete']){
   const item=code==='UNKNOWN'?{severity:'error',code,text:'Nguyên nhân chưa được xác định.'}:code==='complete'?null:issue(code);
   await page.evaluate(({model,item,event,complete})=>{
    document.getElementById('printer-required-alert')?.remove();
    const overlay=document.createElement('div');overlay.id='printer-required-alert';
    overlay.innerHTML='<section class="pm-alert-card" role="alertdialog" aria-modal="true" aria-labelledby="pm-alert-title"><header><span class="pm-alert-icon">'+appIcon('pause')+'</span><div><h2 id="pm-alert-title"></h2></div></header><p id="pm-alert-detail"></p><small id="pm-alert-time">20:24 · dữ liệu QA</small><div class="pm-alert-issues"></div><small class="pm-alert-queue"></small><p class="pm-alert-status"></p><footer><button class="btn btn-ghost" data-alert-ack>Đã biết</button><button class="btn btn-ac" data-alert-view>Xem máy</button></footer></section>';
    document.body.append(overlay);const card=overlay.firstElementChild;
    card.querySelector('h2').textContent=event.title;card.querySelector('#pm-alert-detail').textContent='Tên file rất dài để kiểm tra xuống hàng an toàn — 0.2mm layer, 2 walls, 15% infill.3mf';
    window.qaArtArgs={event:{...event,type:complete?'printer_finished':event.type},device:{id:'QA',model,name:'Máy in — biệt danh dài nhiều chữ để kiểm tra xuống dòng'},issues:item?[item]:[]};
    PlatePrinterAlertArt.update(card,qaArtArgs);
   },{model,item,event,complete:code==='complete'});
   const card=page.locator('.pm-alert-card');
   if(code==='03004006')await card.locator('.pn-photo-hotend').evaluate(image=>image.decode());
   const geometry=await card.evaluate(card=>{
    const r=card.getBoundingClientRect(),title=card.querySelector('.pn-title').getBoundingClientRect(),hero=card.querySelector('.pn-art').getBoundingClientRect();
    const scope=card.dataset.focus;const visible=s=>{const e=card.querySelector(s);return e&&!!e.getClientRects().length&&getComputedStyle(e).display!=='none';};
    return {inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,overflow:card.scrollWidth>card.clientWidth+1,title:title.left>=hero.left&&title.right<=hero.right+1,focus:scope,noUnrelated:scope==='nozzle'?!visible('.pn-path-scene')&& !visible('.pn-machine-slot'):scope==='reel'?!visible('.pn-feeder-unit')&&!visible('.pn-hotend-unit'):true};
   });
   assert.ok(geometry.inside&&!geometry.overflow&&geometry.title&&geometry.noUnrelated,JSON.stringify({width,theme,model,code,...geometry}));checks++;
   if(['07008006','12008004'].includes(code)){
    assert.ok(await card.locator('.pn-flow-direction svg').evaluate(e=>getComputedStyle(e).fill==='none'&&getComputedStyle(e).stroke!=='none'),'Feed/retract direction remains visibly drawn');checks++;
   }
   for(const button of await card.locator('footer .btn').all())await assertButtonContentCentered(button);
   await card.locator('[data-alert-motion]').click();
   assert.equal(await card.evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'Pause stops every scene and text layer');checks++;
   assert.ok(await card.locator('.pn-title').evaluate(e=>[...e.children].every(n=>getComputedStyle(n).clipPath==='none')),'Pausing during entry never leaves the title clipped');checks++;
   if(model==='P1S'&&code==='03004006'){
    await page.evaluate(()=>{window.qaKeptArt=document.querySelector('.pn-art');window.qaKeptImg=document.querySelector('.pn-photo-hotend');PlatePrinterAlertArt.update(document.querySelector('.pm-alert-card'),qaArtArgs);});
    assert.ok(await page.evaluate(()=>qaKeptArt===document.querySelector('.pn-art')&&qaKeptImg===document.querySelector('.pn-photo-hotend')),'Unchanged telemetry preserves image and animation DOM');checks++;
    await page.screenshot({path:pathResolve(out,`${width}-${theme}-nozzle.png`)});
   }
  }
  await context.close();assert.deepEqual(errors,[],'No runtime errors in the integrated component');
 }
 const context=await browser.newContext({viewport:{width:640,height:360},reducedMotion:'reduce'}),page=await context.newPage();
 await context.route(/^https?:/,r=>r.abort());await page.goto(pathToFileURL(pathResolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});await waitForAppReady(page);
 await page.evaluate(()=>{
  document.getElementById('auth-ov')?.remove();const overlay=document.createElement('div');overlay.id='printer-required-alert';overlay.innerHTML='<section class="pm-alert-card"><header><h2>Máy · Lỗi</h2></header><p id="pm-alert-detail">Mẻ in thử</p><small id="pm-alert-time"></small><footer><button data-alert-ack>Đã biết</button><button>Xem máy</button></footer></section>';document.body.append(overlay);PlatePrinterAlertArt.update(overlay.firstElementChild,{event:{type:'printer_paused'},device:{model:'P1S'},issues:[{severity:'error',code:'03004006'}]});
 });
 assert.equal(await page.locator('.pm-alert-card').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'OS reduced motion stops every layer');
 assert.ok(await page.locator('.pm-alert-card footer').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Short landscape retains reachable sticky actions');checks+=2;
 await context.close();
 console.log(`PASS printer alert art: ${checks} catalog safety, model/fault framing, layout, motion, original-copy and DOM preservation checks`);
}finally{await browser.close();}
