/* Standalone approval gallery. Checks every real page without opening the app. */
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const source=readFileSync(resolve('plate-studio.html'),'utf8');
const actualPages=[...source.matchAll(/<div class="page(?: active)?" id="page-([^"]+)"/g)].map(match=>match[1]).sort();
const out=resolve('qa-results/page-info-cards-demo');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let checks=0;
try{
 for(const width of [320,390,768,1024,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:960},hasTouch:width<600,isMobile:width<600,reducedMotion:'no-preference'});
  const page=await context.newPage();const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.goto(pathToFileURL(resolve('assets/demos/page-info-cards.html')).href,{waitUntil:'load'});
  assert.deepEqual(await page.evaluate(()=>PAGE_CARD_DEMOS.map(page=>page.id).sort()),actualPages,'Demo covers every actual page');
  assert.equal(await page.evaluate(()=>new Set(PAGE_CARD_DEMOS.map(page=>page.art)).size),24,'A different scene for each page');
  await page.locator(`[data-theme-choice="${theme}"]`).click();
  for(const id of actualPages){
   const layout=await page.evaluate(id=>{
    selectPage(id);
    const hero=document.querySelector('#product-preview .info-hero'),title=hero.querySelector('h3'),action=hero.querySelector('button'),rect=hero.getBoundingClientRect(),button=action.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:title.scrollWidth>title.clientWidth+1,scene:hero.querySelectorAll('svg.scene>*').length,animated:[...hero.querySelectorAll('.animated')].filter(el=>getComputedStyle(el).animationName!=='none').length,heroWidth:rect.width,buttonWidth:button.width,buttonHeight:button.height};
   },id);
   assert.equal(layout.overflow,false,`${width}/${theme}/${id}: page overflow`);
   assert.equal(layout.clipped,false,`${width}/${theme}/${id}: clipped heading`);
   assert.ok(layout.scene>2&&layout.animated>0,`${id}: actual animated scene`);
   assert.ok(layout.buttonHeight>=44&&layout.buttonWidth>=44,`${id}: action touch target`);checks++;
  }
  await page.locator('#page-search').fill('nhan hang');
  assert.equal(await page.locator('.directory-page').count(),1,'Accent-insensitive page lookup');
  await page.locator('.directory-page').click();
  assert.equal(await page.locator('#product-preview .info-hero').getAttribute('data-page-id'),'delivery-receive');
  await page.locator('#page-search').fill('khong co trang');assert.equal(await page.locator('#directory-empty').isVisible(),true);
  await page.locator('#page-search').fill('');
  await page.evaluate(()=>selectPage('delivery-builder'));
  await page.locator('#product-preview .hero-action').click();assert.equal(await page.locator('#demo-toast').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#demo-toast').isVisible(),false);
  await page.locator('[data-device-choice="mobile"]').click();
  await page.waitForTimeout(250);
  assert.ok((await page.locator('#product-preview').boundingBox()).width<=390.1);
  await page.locator('[data-device-choice="desktop"]').click();
  await page.evaluate(()=>window.qaHero=document.querySelector('#product-preview .info-hero'));
  await page.locator('#motion-toggle').click();
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#product-preview .animated')].every(el=>getComputedStyle(el).animationPlayState==='paused')));
  await page.locator('#motion-toggle').click();
  assert.ok(await page.evaluate(()=>window.qaHero===document.querySelector('#product-preview .info-hero')),'Pausing does not rebuild the scene');
  await page.locator('#product-preview').scrollIntoViewIfNeeded();await page.waitForTimeout(100);
  const before=await page.locator('#product-preview .truck-trip').evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(250);
  const after=await page.locator('#product-preview .truck-trip').evaluate(el=>getComputedStyle(el).transform);
  assert.notEqual(before,after,'Delivery artwork actually moves');
  if([390,1440].includes(width)){
   for(const id of ['delivery-builder','packaging','access']){
    await page.evaluate(id=>selectPage(id),id);await page.locator('#product-preview').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
    await page.screenshot({path:`${out}/${width}-${theme}-${id}.png`});
   }
  }
  await page.locator('[data-view-choice="all"]').click();
  assert.equal(await page.locator('#all-pages .info-hero').count(),24);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Gallery stays within viewport');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#all-pages .hero-copy h3,#all-pages .hero-copy p')].every(el=>el.scrollWidth<=el.clientWidth+1)),'Every gallery title and description fits');
  if(width===1440){await page.screenshot({path:`${out}/gallery-${theme}.png`,fullPage:true});await page.screenshot({path:`${out}/gallery-${theme}-viewport.png`});}
  await page.locator('[data-open-page="orders"]').click();
  assert.equal(await page.locator('#single-view').isVisible(),true);assert.equal(await page.locator('#product-preview .info-hero').getAttribute('data-page-id'),'orders');
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>selectPage('delivery-builder'));
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#product-preview .animated')].every(el=>getComputedStyle(el).animationName==='none')),'System reduced motion disables animation');
  assert.equal(await page.evaluate(()=>localStorage.length),0,'Demo does not write storage');
  assert.deepEqual(requests,[],'No external service requests');assert.deepEqual(errors,[],`${width}/${theme}: runtime errors`);
  await context.close();
 }
}finally{await browser.close();}
console.log(`Page info card demo PASS: ${checks} page/viewport/theme checks, 24 distinct animated scenes, motion/pause/reduced motion, mobile, gallery/search, safe demo actions, no external services or storage writes.`);
