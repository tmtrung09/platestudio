import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('qa-results/shortcut-invite-demo');mkdirSync(out,{recursive:true});
const source=readFileSync('assets/demos/shortcut-invite.js','utf8');
assert.ok(!/fetch\(|localStorage|indexedDB|supabase|sessionStorage|beforeinstallprompt|\.prompt\(/.test(source),'Approval demo cannot install or persist data');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});let checks=0;
try{for(const [width,height] of [[320,740],[390,844],[640,360],[768,900],[1024,900],[1440,1000]])for(const theme of ['dark','light']){
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));await page.route(/^https?:/,route=>{requests.push(route.request().url());return route.abort();});
 await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('No demo persistence');};});
 await page.goto(process.env.DEMO_URL||pathToFileURL(resolve('assets/demos/shortcut-invite.html')).href,{waitUntil:'load'});
 await page.locator(`button[data-theme="${theme}"]`).click();
 for(const platform of ['iphone','android','desktop']){
  await page.locator(`button[data-platform="${platform}"]`).click();await page.waitForTimeout(520);
  assert.ok(await page.locator('#invite').isVisible());assert.equal(await page.locator('#invite').evaluate(el=>el.inert),false);
  const checkGeometry=async()=>assert.ok(await page.evaluate(()=>{
   const p=document.getElementById('invite'),w=document.querySelector('.workspace'),r=p.getBoundingClientRect(),v=w.getBoundingClientRect();
   const controls=[...document.querySelectorAll('button,select')].filter(el=>el.getBoundingClientRect().height>0);
   return document.documentElement.scrollWidth<=innerWidth+1&&r.left>=v.left&&r.right<=v.right+1&&r.bottom<=v.bottom+1&&controls.every(el=>el.getBoundingClientRect().height>=43.9);
  }),`Geometry ${width}/${height}/${theme}/${platform}`);
  await checkGeometry();
  if(platform==='iphone'&&[390,1440].includes(width))await page.locator('.preview').screenshot({path:resolve(out,`${width}-${theme}-invite.png`)});
  await page.locator('#primary').click();
  if(platform==='iphone'){
   assert.equal(await page.locator('#guide').isVisible(),true);assert.equal(await page.locator('#steps li').count(),3);assert.match(await page.locator('#steps').innerText(),/Chia sẻ/);await checkGeometry();
   if(width===390)await page.locator('.preview').screenshot({path:resolve(out,`${width}-${theme}-guide.png`)});
   await page.locator('#primary').click();await page.waitForTimeout(230);assert.equal(await page.locator('#invite').isVisible(),false);assert.match(await page.locator('#preview-status').innerText(),/không xác nhận/);
  }else{
   assert.equal(await page.locator('#simulation').isVisible(),true);await checkGeometry();assert.equal(await page.locator('#confirm-install').evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#simulation').isVisible(),false);assert.equal(await page.locator('#primary').evaluate(el=>el===document.activeElement),true);
   await page.locator('#primary').click();await page.locator('#confirm-install').click();await page.waitForTimeout(230);assert.equal(await page.locator('#invite').isVisible(),false);assert.match(await page.locator('#preview-status').innerText(),/mô phỏng.*chưa cài đặt thật/);
  }
  assert.equal(await page.locator('#replay').evaluate(el=>el===document.activeElement),true);
  await page.locator('#replay').click();await page.locator('#later').click();await page.locator('#replay').click();await page.waitForTimeout(250);assert.equal(await page.locator('#invite').isVisible(),true,'Replay cancels dismissal');
  await page.locator('#close').focus();await page.keyboard.press('Escape');await page.waitForTimeout(230);assert.equal(await page.locator('#invite').isVisible(),false);
  await page.locator('#scenario').selectOption('unavailable');await page.locator('#primary').click();assert.equal(await page.locator('#guide').isVisible(),true);assert.equal(await page.locator('#simulation').isVisible(),false);await checkGeometry();
  await page.locator('#scenario').selectOption('installed');assert.equal(await page.locator('#invite').isVisible(),false);await page.locator('#replay').click();assert.equal(await page.locator('#invite').isVisible(),false,'Never invites in standalone scenario');
  await page.locator('#scenario').selectOption('invite');checks++;
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.app-icon').evaluate(el=>getComputedStyle(el).animationName),'none');await page.locator('#replay').click();assert.equal(await page.locator('#invite').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await context.close();console.log(`PASS shortcut demo ${width}x${height}/${theme}: 3 platforms, guide/confirmation, dismiss/replay, installed/fallback, focus, reduced motion, no writes/network`);
}}finally{await browser.close();}
writeFileSync(resolve(out,'summary.json'),JSON.stringify({checks,status:'PASS',scope:'Approval demo only; main application unchanged'},null,2));console.log(`Shortcut invite demo PASS: ${checks} platform/viewport/theme scenarios.`);
