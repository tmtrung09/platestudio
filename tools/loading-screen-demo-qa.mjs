import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('qa-results/loading-screen-demo');mkdirSync(out,{recursive:true});
const source=readFileSync('assets/demos/loading-screen.js','utf8');
assert.ok(!/fetch\(|localStorage|indexedDB|supabase|sessionStorage/.test(source),'Demo has no service or storage dependencies');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let checks=0;
try{for(const [width,height] of [[320,740],[390,844],[640,360],[768,900],[1024,900],[1440,1000]])for(const theme of ['dark','light']){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'}),page=await context.newPage();const errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));await page.route(/^https?:/,route=>{requests.push(route.request().url());return route.abort();});
 await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('Demo must not write storage');};});
 await page.goto(pathToFileURL(resolve('assets/demos/loading-screen.html')).href,{waitUntil:'load'});
 await page.locator(`[data-theme-choice="${theme}"]`).click();
 for(const device of ['desktop','mobile']){
  await page.locator(`[data-device-choice="${device}"]`).click();await page.waitForTimeout(350);
  await page.locator('.wordmark').scrollIntoViewIfNeeded();
  const geometry=await page.evaluate(()=>{const word=document.querySelector('.wordmark'),art=document.querySelector('.loading-art'),view=document.getElementById('preview-viewport'),style=getComputedStyle(word),wr=word.getBoundingClientRect(),ar=art.getBoundingClientRect(),vr=view.getBoundingClientRect();return {name:word.textContent.trim(),weight:Number(style.fontWeight),italic:style.fontStyle,below:wr.top>=ar.bottom-2,center:Math.abs((wr.left+wr.right)/2-(vr.left+vr.right)/2),contained:wr.left>=vr.left&&wr.right<=vr.right&&wr.bottom<vr.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1,controls:[...document.querySelectorAll('button:not([hidden])')].filter(button=>button.getBoundingClientRect().height>0).every(button=>button.getBoundingClientRect().height>=43.99),animation:getComputedStyle(document.querySelector('.print-head')).animationName};});
  assert.equal(geometry.name,'platedio');assert.ok(geometry.weight>=900&&geometry.italic==='italic');assert.ok(geometry.below&&geometry.center<=3&&geometry.contained&&!geometry.overflow&&geometry.controls,JSON.stringify({width,height,theme,device,geometry}));assert.notEqual(geometry.animation,'none');
  checks++;
  if([390,1440].includes(width)&&device==='desktop')await page.locator('.preview-shell').screenshot({path:resolve(out,`${width}-${theme}-loading.png`)});
 }
 await page.locator('#motion-toggle').click();assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.moving')].every(el=>getComputedStyle(el).animationPlayState==='paused')),'Pause applies to scene and status dots');
 await page.locator('#motion-toggle').click();await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.moving')].every(el=>getComputedStyle(el).animationName==='none')),'Reduced motion suppresses all decorative animations');await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('#slow-demo').click();assert.equal(await page.locator('#preview-viewport').getAttribute('data-state'),'slow');assert.equal(await page.locator('#preview-viewport').getAttribute('aria-busy'),'true');assert.equal(await page.locator('#ready-page').evaluate(el=>el.inert),true);assert.equal(await page.locator('#retry-demo').isVisible(),true);assert.equal(await page.locator('[role="progressbar"]').count(),0,'No fabricated percentage');
 await page.locator('#retry-demo').click();assert.equal(await page.locator('#play-demo').evaluate(el=>el===document.activeElement),true,'Retry preserves focus outside the disappearing overlay');
 await page.waitForFunction(()=>document.getElementById('preview-viewport').dataset.state==='ready');await page.waitForTimeout(380);
 assert.equal(await page.locator('#loading-screen').isVisible(),false);assert.equal(await page.locator('#loading-screen').evaluate(el=>el.inert),true);assert.equal(await page.locator('#preview-viewport').getAttribute('aria-busy'),'false');assert.equal(await page.locator('#ready-page').evaluate(el=>el.inert),false);assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.moving')].every(el=>getComputedStyle(el).animationPlayState==='paused')),'Completed loader stops its animations');
 await page.locator('#play-demo').click();await page.locator('#slow-demo').click();await page.waitForTimeout(3000);assert.equal(await page.locator('#preview-viewport').getAttribute('data-state'),'slow','Slow simulation cancels the earlier readiness timer');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await context.close();console.log(`PASS loading demo ${width}x${height}/${theme}: desktop/mobile, strong italic wordmark, bounded art, readiness/slow/retry, focus, pause, reduced motion, no network/storage`);
}}finally{await browser.close();}
writeFileSync(resolve(out,'summary.json'),JSON.stringify({checks,status:'PASS',scope:'Standalone approval demo; main application unchanged'},null,2));
console.log(`Loading screen demo PASS: ${checks} viewport/theme/device checks.`);
