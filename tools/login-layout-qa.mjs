import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';
const root=resolve('.'),out=resolve('qa-results/login-layout'),base='https://login-layout.test/';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let checks=0;
async function centered(page,label){
 const geometry=await page.locator('.la-segmented').evaluate(group=>{
  const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2};};
  return {group:box(group),thumb:box(group.querySelector('.la-seg-thumb')),buttons:[...group.querySelectorAll('button')].map(button=>{const range=document.createRange();range.selectNodeContents(button);const r=range.getBoundingClientRect();return {button:box(button),text:{cx:r.left+r.width/2,cy:r.top+r.height/2},selected:button.classList.contains('la-active')};})};
 });
 for(const {button,text,selected} of geometry.buttons){
  assert.ok(Math.abs(text.cx-button.cx)<=1.5&&Math.abs(text.cy-button.cy)<=2,`${label}: label centered in button`);
  assert.ok(button.height>=44,`${label}: touch target at least 44px`);
  assert.ok(button.top>=geometry.group.top&&button.bottom<=geometry.group.bottom,`${label}: button fits segmented control`);
  if(selected)assert.ok(Math.abs(text.cx-geometry.thumb.cx)<=2&&Math.abs(text.cy-geometry.thumb.cy)<=2,`${label}: selected label centered in thumb`);
  checks++;
 }
}
try{for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(theme=>{localStorage.setItem('ps_theme',theme);},theme);
 const page=await context.newPage();
 await page.route(/^https?:/,route=>{
  const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
  const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+sep)||!existsSync(file))return route.abort();
  return route.fulfill({body:readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});
 });
 await page.goto(base+'plate-studio.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.PlatedioStartup?.state==='ready');await page.evaluate(()=>showAuth());
 for(const mode of ['signin','signup']){
  const button=page.locator(`.la-seg-btn[data-mode="${mode}"]`);await button.click();
  await page.locator('.la-seg-thumb').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  await centered(page,`${width}/${theme}/${mode}/normal`);
  await button.hover();await centered(page,`${width}/${theme}/${mode}/hover`);
  await button.focus();await centered(page,`${width}/${theme}/${mode}/focus`);
  const bounds=await button.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
  try{await centered(page,`${width}/${theme}/${mode}/active`);}finally{await page.mouse.up();}
  await button.evaluate(el=>el.disabled=true);await centered(page,`${width}/${theme}/${mode}/disabled`);await button.evaluate(el=>el.disabled=false);
  if([390,1440].includes(width))await page.locator('.la-segmented').screenshot({path:resolve(out,`${width}-${theme}-${mode}.png`)});
 }
 await context.close();console.log(`PASS login layout ${width}/${theme}: both labels centered, thumb aligned, 44px targets; normal/hover/focus/active/disabled`);
}}finally{await browser.close();}
console.log(`PASS login segmented control: ${checks} text/target geometry checks.`);
