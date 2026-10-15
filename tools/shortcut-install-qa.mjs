/* Production installation UI under isolated transport; browser events are simulated, never install an OS app. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('qa-results/shortcut-install');mkdirSync(out,{recursive:true});
const base='http://platedio-install.test/',source=readFileSync('plate-studio.html','utf8'),manifest=JSON.parse(readFileSync('manifest.webmanifest','utf8'));
assert.equal(manifest.name,'platedio');assert.equal(manifest.start_url,'./plate-studio.html');assert.equal(manifest.shortcuts[0].url,'./plate-studio.html?capture=1');
for(const size of [192,512]){const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`);assert.ok(icon);const png=readFileSync(icon.src);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
assert.equal(readFileSync('assets/app/platedio-180.png').readUInt32BE(16),180);
for(const asset of ['shortcut-invite.js','shortcut-invite.css','platedio-192.png','platedio-512.png','platedio-180.png'])assert.ok(readFileSync('push-sw.js','utf8').includes('assets/app/'+asset),'Offline shell '+asset);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});let checks=0;
async function setup({width=390,height=844,theme='dark',ios=false,android=false,standalone=false,hold=false,holdCSS=false,query='',storageError=false,preference=null}={}){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 await context.addInitScript(({theme,ios,android,standalone,storageError,preference})=>{
  if(theme==='light')localStorage.setItem('ps_theme','light');if(preference)localStorage.setItem('ps_install_invite_v1',JSON.stringify(preference));
  if(ios)Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  if(android)Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'});
  if(standalone)Object.defineProperty(navigator,'standalone',{value:true});
  if(storageError){const set=Storage.prototype.setItem,get=Storage.prototype.getItem;Storage.prototype.setItem=function(key,value){if(key==='ps_install_invite_v1')throw Error('QA quota');return set.call(this,key,value);};Storage.prototype.getItem=function(key){if(key==='ps_install_invite_v1')throw Error('QA unavailable');return get.call(this,key);};}
 },{theme,ios,android,standalone,storageError,preference});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route(/^https?:/,route=>{
  const url=route.request().url();if(url.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'))return;
  if(!url.startsWith(base))return route.abort();const path=new URL(url).pathname;if(holdCSS&&path.endsWith('/shortcut-invite.css'))return;
  if(path==='/plate-studio.html')return route.fulfill({contentType:'text/html',body:hold?source.replace('window.PlatedioStartup?.ready();','window.qaReady=()=>PlatedioStartup.ready();'):source});
  const file=resolve('.'+path);if(!file.startsWith(resolve('.')+'\\')&&!file.startsWith(resolve('.')+'/'))return route.abort();if(!existsSync(file))return route.abort();
  return route.fulfill({body:readFileSync(file),contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/octet-stream'});
 });
 await page.goto(base+'plate-studio.html'+query,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.PlatedioInstall);
 if(!hold)await page.waitForFunction(()=>PlatedioStartup.state==='ready');
 return {context,page,errors};
}
async function native(page,choice='accepted'){
 await page.evaluate(choice=>{window.qaPromptCalls=0;window.qaGesture=false;const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=()=>{qaPromptCalls++;qaGesture=navigator.userActivation.isActive;if(choice==='error')throw Error('QA prompt unavailable');return Promise.resolve({outcome:choice});};window.qaInstallEvent=event;dispatchEvent(event);},choice);
 assert.equal(await page.evaluate(()=>qaInstallEvent.defaultPrevented),true);
}
async function open(page){await page.evaluate(()=>PlatedioInstall.open());await page.locator('#platedio-install').waitFor({state:'visible'});await page.waitForTimeout(430);}
async function geometry(page,tag){
 const value=await page.locator('#platedio-install').evaluate(el=>{
  const r=el.getBoundingClientRect(),actions=el.querySelector('.pi-actions').getBoundingClientRect(),close=el.querySelector('.pi-close').getBoundingClientRect();
  const clear=['#mobile-nav','.cam-fab'].every(selector=>{const control=document.querySelector(selector);if(!control||!control.getClientRects().length||getComputedStyle(control).display==='none')return true;const c=control.getBoundingClientRect();return r.right<=c.left||r.left>=c.right||r.bottom<=c.top-8||r.top>=c.bottom+8;});
  return {inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,actions:actions.bottom<=r.bottom&&actions.top>=r.top,close:close.top>=r.top&&close.bottom<=r.bottom,touch:[...el.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44),clear,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });assert.ok(value.inside&&value.actions&&value.close&&value.touch&&value.clear&&!value.overflow,tag+JSON.stringify(value));
}
async function clean(result){assert.deepEqual(result.errors,[]);await result.context.close();checks++;}
try{
 for(const [width,height] of [[320,740],[390,844],[640,360],[768,900],[1024,900],[1440,1000]])for(const theme of ['dark','light']){
  const t=await setup({width,height,theme});const {page}=t;await native(page);await open(page);await geometry(page,`${width}/${height}/${theme}`);
  assert.match(await page.locator('.pi-primary').innerText(),/Thêm platedio/);
  if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}-invite.png`)});
  await page.locator('.pi-primary').click();assert.equal(await page.evaluate(()=>qaPromptCalls),1);assert.equal(await page.evaluate(()=>qaGesture),true,'Native prompt runs in the click gesture');
  assert.match(await page.locator('.pi-feedback').innerText(),/đang hoàn tất/i);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ps_install_invite_v1')).installed),undefined,'Accepted is not an installed ACK');
  await page.evaluate(()=>dispatchEvent(new Event('appinstalled')));assert.equal(await page.locator('#platedio-install').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ps_install_invite_v1')).installed),true);
  await clean(t);console.log(`PASS install ${width}x${height}/${theme}: geometry, real click gesture, single-use prompt, accepted versus installed ACK`);
 }
 for(const [width,height] of [[320,740],[390,844],[640,360]])for(const theme of ['dark','light']){
  const t=await setup({width,height,theme,ios:true}),{page}=t;await open(page);await page.locator('.pi-primary').click();await page.locator('.pi-guide li').last().scrollIntoViewIfNeeded();await geometry(page,`Guide ${width}/${height}/${theme}`);
  assert.ok(await page.locator('.pi-guide li').last().evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('.pi-scroll').getBoundingClientRect();return r.bottom<=s.bottom+1;}),'The final instruction can be scrolled into view');
  if(width===320||height===360)await page.screenshot({path:resolve(out,`${width}-${theme}-guide-safe.png`)});await clean(t);console.log(`PASS install guide ${width}x${height}/${theme}: camera/navigation clear, pinned actions/close, scroll to final step`);
 }
 {
  const t=await setup({ios:true,hold:true}),{page}=t;await page.waitForTimeout(3900);assert.equal(await page.locator('#platedio-install').count(),0,'Never opens over loading');
  await page.evaluate(()=>qaReady());await page.waitForFunction(()=>PlatedioStartup.state==='ready');await page.evaluate(()=>{const i=document.createElement('input');i.id='qa-draft';document.body.append(i);i.value='Bản nháp';i.focus();});await page.waitForTimeout(4800);assert.equal(await page.locator('#platedio-install').count(),0,'Typing defers invitation');
  await page.locator('#qa-draft').evaluate(el=>el.blur());await page.locator('#platedio-install').waitFor({state:'visible'});assert.equal(await page.locator('#qa-draft').inputValue(),'Bản nháp');
  await page.locator('.pi-primary').click();assert.equal(await page.locator('.pi-guide').isVisible(),true);assert.equal(await page.locator('.pi-guide li').count(),3);assert.match(await page.locator('.pi-guide').innerText(),/Chia sẻ/);await geometry(page,'iOS guide');
  await page.screenshot({path:resolve(out,'390-ios-guide.png')});await page.locator('.pi-close').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#platedio-install').isVisible(),false);
  await page.reload({waitUntil:'domcontentloaded'});await page.evaluate(()=>qaReady());await page.waitForFunction(()=>PlatedioStartup.state==='ready');await page.waitForTimeout(4000);assert.equal(await page.locator('#platedio-install').count(),0,'Dismiss survives reload');await open(page);assert.equal(await page.locator('#platedio-install').isVisible(),true,'Explicit reopening ignores cooldown');await clean(t);
 }
 {
  const t=await setup({android:true}),{page}=t;await open(page);await page.locator('.pi-primary').click();assert.match(await page.locator('.pi-guide').innerText(),/Thêm vào màn hình chính/);await clean(t);
 }
 for(const kind of ['error','dismissed']){
  const t=await setup(),{page}=t;await native(page,kind);await open(page);await page.locator('.pi-primary').click();assert.equal(await page.evaluate(()=>qaPromptCalls),1);
  if(kind==='error'){assert.equal(await page.locator('.pi-guide').isVisible(),true);assert.match(await page.locator('.pi-feedback').innerText(),/Chưa mở được/);await page.locator('.pi-primary').click();}
  assert.equal(await page.locator('#platedio-install').isVisible(),false);await open(page);assert.match(await page.locator('.pi-primary').innerText(),/Xem cách thêm/);assert.equal(await page.evaluate(()=>qaPromptCalls),1);await clean(t);
 }
 for(const blocker of ['auth','dialog','toast','feedback','menu','camera','staff','options']){
  const t=await setup({ios:true}),{page}=t;
  await page.evaluate(blocker=>{const el=document.createElement('div');el.id='qa-blocker';if(blocker==='dialog'){el.setAttribute('role','dialog');el.textContent='Form đang nhập';}if(blocker==='toast'){el.className='system-notification-popup';el.textContent='Thông báo';}if(blocker==='feedback'){toast('Thông báo thử trong fixture QA',10000);}if(blocker==='menu'){el.setAttribute('role','menu');el.textContent='Menu đang mở';}if(blocker==='camera'){PlatedioInstall.pauseForCapture();}if(blocker==='staff'){document.body.classList.add('staff-report-mode');}if(blocker==='auth'){document.getElementById('auth-ov').style.display='flex';}if(blocker==='options'){updatePageOptions('dashboard');document.getElementById('page-options-tools').open=true;}document.body.append(el);},blocker);
  await page.waitForTimeout(4200);assert.equal(await page.locator('#platedio-install').count(),0,'Defers '+blocker);
  if(blocker!=='camera'){await page.evaluate(()=>{document.getElementById('qa-blocker').remove();document.querySelectorAll('#toast .notification-card').forEach(el=>el.remove());document.body.classList.remove('staff-report-mode');document.getElementById('auth-ov').style.display='none';if(document.getElementById('page-options-tools')?.open)closePageOptions(false);});await page.locator('#platedio-install').waitFor({state:'visible'});}
  await clean(t);
 }
 for(const option of [{standalone:true},{query:'?capture=1'},{preference:{until:Date.now()+86400000}}]){
  const t=await setup({...option,ios:true}),{page}=t;await page.waitForTimeout(4500);assert.equal(await page.locator('#platedio-install').count(),0,'No automatic invite '+JSON.stringify(option));
  if(option.standalone)assert.equal(await page.locator('[data-platedio-install-action]:visible').count(),0);await clean(t);
 }
 {
  const t=await setup({storageError:true}),{page}=t;await native(page,'dismissed');await open(page);await page.locator('.pi-primary').click();await open(page);await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.pi-icon').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.locator('.pi-later').click();assert.equal(await page.locator('#platedio-install').isVisible(),false);await clean(t);
 }
 {
  const t=await setup(),{page}=t;await page.evaluate(()=>toggleMoreSheet());await page.locator('#more-search').fill('thiết bị');await page.waitForTimeout(600);assert.equal(await page.locator('#more-sheet-ov [data-platedio-install-action]').isVisible(),false,'Installation updates cannot undo a menu search');
  await page.locator('#more-search').fill('');await page.waitForTimeout(300);await page.locator('#more-sheet-ov [data-platedio-install-action]').click();await page.locator('#platedio-install').waitFor({state:'visible'});await page.locator('.pi-close').click();assert.equal(await page.locator('#platedio-install').isVisible(),false);await clean(t);console.log('PASS install menu: delayed search/category visibility preserved and real action opens invitation');
 }
 {
  const t=await setup({holdCSS:true}),{page}=t;assert.equal(await page.evaluate(()=>PlatedioStartup.state),'ready','Install CSS cannot gate the usable local shell');await page.evaluate(()=>PlatedioInstall.open());await page.waitForTimeout(700);assert.equal(await page.locator('#platedio-install').count(),0,'Never displays an unstyled invitation');await clean(t);
 }
 {
  const t=await setup(),{page}=t;await open(page);await page.evaluate(()=>{const input=document.createElement('input');input.id='qa-app-input';document.body.append(input);input.focus();});await page.locator('#platedio-install').waitFor({state:'hidden'});assert.equal(await page.locator('#qa-app-input').evaluate(el=>el===document.activeElement),true,'An app form retains focus');await clean(t);
 }
}finally{await browser.close();}
writeFileSync(resolve(out,'summary.json'),JSON.stringify({status:'PASS',checks,scope:'Production UI; native browser events simulated, OS install not performed'},null,2));console.log(`Install QA PASS: ${checks} scenarios; manifest PNGs and offline resources validated.`);
