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
try{for(const [width,height] of [[320,740],[390,844],[600,800],[768,950],[844,390],[1440,950]])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,serviceWorkers:'block',reducedMotion:'reduce'});
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
  await page.waitForFunction(()=>!document.querySelector('#la-title.la-swap'));
  await page.locator('#la-title').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  await page.locator('#auth-email').focus();await page.locator('#auth-email').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const surface=await page.locator('#auth-ov').evaluate(auth=>{
   const rect=selector=>auth.querySelector(selector).getBoundingClientRect().toJSON(),background=el=>getComputedStyle(el).backgroundColor;
   const rgb=background(auth).match(/\d+/g).map(Number);
   const luminance=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
   const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   const input=auth.querySelector('#auth-email'),style=getComputedStyle(input);
   window.qaLoginContrast={text:contrast(style.color,style.backgroundColor),placeholder:contrast(getComputedStyle(input,'::placeholder').color,style.backgroundColor),edge:contrast(style.borderTopColor,style.backgroundColor),colors:[style.color,style.backgroundColor,style.borderTopColor]};
   return {backgrounds:[auth,...auth.querySelectorAll('.la-layout,.la-story,.la-form-side')].map(background),green:rgb[1]>rgb[0]&&rgb[1]>rgb[2],title:rect('#la-title'),art:rect('.la-story-art'),brand:rect('.la-brand-mark'),footer:getComputedStyle(auth.querySelector('.la-story-footer')).display,oldCopy:auth.textContent.includes('Từ mong muốn'),headings:auth.querySelectorAll('h1').length,italic:getComputedStyle(auth.querySelector('#la-title em')).fontStyle,opacity:getComputedStyle(auth.querySelector('#la-title')).opacity,inputSize:parseFloat(getComputedStyle(auth.querySelector('#auth-email')).fontSize),overflow:auth.scrollWidth>auth.clientWidth+1};
  });
  assert.ok(surface.backgrounds.every(color=>color===surface.backgrounds[0])&&surface.green,'One continuous forest surface');
  assert.equal(surface.headings,1);assert.equal(surface.oldCopy,false);assert.equal(surface.italic,'italic');assert.equal(surface.overflow,false);
  assert.equal(surface.opacity,'1');if(width<900)assert.ok(surface.inputSize>=16);
  const contrast=await page.evaluate(()=>qaLoginContrast);assert.ok(contrast.text>=4.5&&contrast.placeholder>=4.5&&contrast.edge>=3,`Readable fields: ${JSON.stringify(contrast)}`);
  assert.match(await page.locator('#la-title').innerText(),mode==='signup'?/Tạo tài khoản/:/Chào trở lại/);
  if(width<=600){
   assert.equal(surface.footer,'none');assert.ok(surface.inputSize>=16);
   assert.ok(surface.art.right<=width&&surface.art.left>width/2&&surface.art.top<30,'Printer at upper right');
   assert.ok(surface.art.bottom<=surface.title.top+1&&surface.art.left>=surface.brand.right,'Art does not cover title or brand');
  }
  await centered(page,`${width}/${theme}/${mode}/normal`);
  await button.hover();await centered(page,`${width}/${theme}/${mode}/hover`);
  await button.focus();await centered(page,`${width}/${theme}/${mode}/focus`);
  const bounds=await button.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
  try{await centered(page,`${width}/${theme}/${mode}/active`);}finally{await page.mouse.up();}
  await button.evaluate(el=>el.disabled=true);await centered(page,`${width}/${theme}/${mode}/disabled`);await button.evaluate(el=>el.disabled=false);
  if([390,1440].includes(width))await page.locator('.la-segmented').screenshot({path:resolve(out,`${width}-${theme}-${mode}.png`)});
  await page.locator('#la-cta-btn').scrollIntoViewIfNeeded();assert.equal(await page.locator('#la-cta-btn').isVisible(),true);
  if([390,1440].includes(width)){await page.waitForFunction(()=>!document.querySelector('#la-title.la-swap'));await page.locator('#la-title').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));await page.locator('#auth-ov').evaluate(el=>el.scrollTop=0);await page.screenshot({path:resolve(out,`${width}-${theme}-${mode}-page.png`)});}
 }
 await context.close();console.log(`PASS login layout ${width}/${theme}: both labels centered, thumb aligned, 44px targets; normal/hover/focus/active/disabled`);
}}finally{await browser.close();}
console.log(`PASS login segmented control: ${checks} text/target geometry checks.`);
