/* Real inline startup; isolated HTML transport, held optional network, no cloud writes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readFileSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('qa-results/startup');mkdirSync(out,{recursive:true});
const source=readFileSync('plate-studio.html','utf8'),base='http://platedio-startup.test/';
for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(match[1]);
assert.ok(source.indexOf('id="platedio-startup-style"')<source.indexOf('<!-- THANH TIẾN TRÌNH'));
assert.ok(source.includes('window.PlatedioStartup?.ready();'),'Real local-shell readiness signal');
assert.ok(!source.includes('assets/demos/loading-screen'),'Production never imports the approval viewer');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let checks=0;
async function setup({width=390,height=844,theme='dark',reducedMotion='no-preference',hold=false,query='',fail=false}={}){
 const context=await browser.newContext({viewport:{width,height},reducedMotion,serviceWorkers:'block'});
 await context.addInitScript(theme=>{if(theme==='light')localStorage.setItem('ps_theme','light');},theme);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 let html=hold?source.replace('window.PlatedioStartup?.ready();','window.qaReadySignal=()=>window.PlatedioStartup.ready();'):source;
 if(fail)html=html.replace('window.qaReadySignal=()=>window.PlatedioStartup.ready();','throw new Error("QA injected startup failure");');
 await page.route(/^https?:/,route=>{
  const url=route.request().url();
  // Deliberately leave optional Supabase loading pending: it cannot gate startup.
  if(url.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'))return;
  if(!url.startsWith(base))return route.abort();
  const pathname=new URL(url).pathname;
  if(pathname==='/plate-studio.html')return route.fulfill({contentType:'text/html',body:html});
  const file=resolve('.'+pathname);if(!file.startsWith(resolve('.')+'/')&&!file.startsWith(resolve('.')+'\\'))return route.abort();
  if(!existsSync(file))return route.abort();
  return route.fulfill({body:readFileSync(file),contentType:pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 await page.goto(base+'plate-studio.html'+query,{waitUntil:'domcontentloaded'});
 return {context,page,errors};
}
try{
 for(const [width,height] of [[320,740],[390,844],[640,360],[768,900],[1024,900],[1440,1000]])for(const theme of ['dark','light']){
  const {context,page,errors}=await setup({width,height,theme,hold:true});
  await page.waitForFunction(()=>PlatedioStartup.state==='loading',null,{timeout:5000});
  assert.equal(await page.evaluate(()=>PlatedioStartup.state),'loading');
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),true);
  assert.equal(await page.locator('#more-sheet-ov').evaluate(el=>el.inert),true);
  const bounds=await page.locator('#platedio-startup').evaluate(el=>{const rect=el.getBoundingClientRect(),word=el.querySelector('.wordmark'),wr=word.getBoundingClientRect(),style=getComputedStyle(word);return {width:rect.width,height:rect.height,word:word.textContent.trim(),font:style.fontStyle,weight:Number(style.fontWeight),inside:wr.left>=0&&wr.right<=innerWidth&&wr.top>=0&&wr.bottom<=innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.ok(bounds.width===width&&bounds.height===height&&bounds.word==='platedio'&&bounds.font==='italic'&&bounds.weight>=900&&bounds.inside&&!bounds.overflow,JSON.stringify(bounds));
  if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}-startup.png`)});
  await page.evaluate(()=>{window.qaBrand=document.querySelector('#sidebar .sb-brand');qaReadySignal();});
  await page.waitForFunction(()=>PlatedioStartup.state==='exiting');assert.equal(await page.locator('.shell').evaluate(el=>el.inert),true);
  await page.waitForFunction(()=>PlatedioStartup.state==='revealing');assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false);assert.equal(await page.locator('#platedio-startup').isVisible(),false);
  const node=width<=860?page.locator('.platedio-mobile-brand'):page.locator('#sidebar .sb-brand');
  assert.ok(await node.isVisible(),'Correct brand for viewport');
  const position=await node.boundingBox();assert.ok(position.x>=0&&position.x+position.width<=width&&position.y>=0&&position.y<60,'Brand at top left');
  if(width>860)await page.evaluate(()=>window.qaBrandAnimation=qaBrand.querySelector('.platedio-brand-reveal').getAnimations()[0]);
  await page.evaluate(()=>renderSb());assert.equal(await page.evaluate(()=>qaBrand===document.querySelector('#sidebar .sb-brand')),true,'Sidebar refresh keeps the same brand and its animation');
  if(width>860)assert.equal(await page.evaluate(()=>qaBrand.querySelector('.platedio-brand-reveal').getAnimations().includes(qaBrandAnimation)),true,'A sidebar update does not restart the reveal timeline');
  await page.waitForFunction(()=>PlatedioStartup.state==='ready');
  await page.evaluate(()=>{renderSb();goPage('orders',{historyMode:'none'});renderSb();});
  assert.equal(await page.evaluate(()=>PlatedioStartup.state),'ready','Background renders and navigation never replay startup');
  assert.equal(await page.locator('#more-sheet-ov').evaluate(el=>el.inert),true,'Preexisting inert state remains owned by its component');
  assert.equal(await node.locator('.platedio-brand-reveal').evaluate(el=>el.getAnimations().filter(animation=>animation.playState==='running').length),0,'Brand has no perpetual motion');
  if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}-ready.png`)});
  if(width>860){
   await page.evaluate(()=>{if(sbPinned)toggleSbPin();});await page.mouse.move(width-2,height-2);await page.waitForTimeout(250);
   const compact=await page.locator('#sidebar .sb-brand-mark').evaluate(el=>{const icon=el.getBoundingClientRect(),sidebar=document.getElementById('sidebar').getBoundingClientRect();return {inside:icon.left>=sidebar.left&&icon.right<=sidebar.right,hidden:getComputedStyle(document.querySelector('#sidebar .sb-brand-copy')).display==='none'};});assert.ok(compact.inside&&compact.hidden,'Collapsed sidebar shows only the bounded cube');
   await page.locator('#sidebar').hover();await page.waitForTimeout(300);assert.equal(await page.locator('#sidebar .sb-brand-title').isVisible(),true,'Expanded hover reveals the wordmark');
  }
  await page.evaluate(()=>{window.qaOrdinaryReceiver=isDeliveryReceiveOnlyAccount;isDeliveryReceiveOnlyAccount=()=>true;renderSb();});
  assert.match(await page.locator('#sidebar .sb-brand').getAttribute('onclick'),/delivery-receive/);
  assert.equal(await page.evaluate(()=>qaBrand===document.querySelector('#sidebar .sb-brand')),true,'Receiving-only role preserves its own brand action and identity');
  assert.deepEqual(errors,[]);await context.close();checks++;
  console.log(`PASS startup ${width}x${height}/${theme}: inline art, entry/exit, usable local shell, top-left brand, preserved DOM, roles, no replay or network gate`);
 }
 for(const reducedMotion of ['no-preference','reduce']){
  const {context,page,errors}=await setup({reducedMotion});
  await page.waitForFunction(()=>['revealing','ready'].includes(PlatedioStartup.state),null,{timeout:2500});
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false,'Real readiness releases while optional cloud script is still pending');
  assert.equal(await page.locator('#platedio-startup').isVisible(),false);
  await page.waitForFunction(()=>PlatedioStartup.state==='ready');
  await page.evaluate(()=>showAuth());await page.waitForTimeout(120);assert.equal(await page.locator('#auth-email').evaluate(el=>el===document.activeElement),true,'Sign-in focus remains usable');
  assert.deepEqual(errors,[]);await context.close();checks++;
 }
 {
  const {context,page}=await setup({hold:true,query:'?capture=1'});
  await page.evaluate(()=>qaReadySignal());assert.equal(await page.evaluate(()=>PlatedioStartup.state),'ready','Direct capture has no decorative delay');
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false);await context.close();checks++;
 }
 {
  const {context,page}=await setup({hold:true});
  await page.evaluate(()=>{canCaptureBatchReports=()=>true;window.qaOpenCamera=openBatchMultiCamera;openBatchMultiCamera=()=>{};openBatchReportHub();});
  assert.equal(await page.evaluate(()=>PlatedioStartup.state),'ready','Opening camera releases startup before camera acquisition');
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false);await context.close();checks++;
 }
 {
  const {context,page}=await setup({hold:true});await page.waitForTimeout(600);await page.evaluate(()=>qaReadySignal());await page.waitForFunction(()=>PlatedioStartup.state==='exiting');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>PlatedioStartup.state==='ready');assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false,'Reduced motion during exit cannot strand an inert app');
  await context.close();checks++;
 }
 {
  const {context,page}=await setup({hold:true,fail:true});
  await page.waitForFunction(()=>PlatedioStartup.state==='stalled',null,{timeout:15000});assert.equal(await page.locator('#platedio-startup-retry').isVisible(),true);const rect=await page.locator('#platedio-startup-retry').boundingBox();assert.ok(rect.width>=44&&rect.height>=44);
  await context.close();checks++;
 }
}finally{await browser.close();}
writeFileSync(resolve(out,'summary.json'),JSON.stringify({checks,status:'PASS',scope:'Real production startup, isolated network/data'},null,2));
console.log(`Startup QA PASS: ${checks} scenarios.`);
