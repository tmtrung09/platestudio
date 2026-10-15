import {waitForAppReady} from './app-ready-qa.mjs';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {assertButtonContentCentered} from './button-content-probe.mjs';

// Scan the whole button family, not just the three printer screenshot controls.
const specs=[];
for(const file of ['plate-studio.html','printer-monitor.js']) {
  const source=readFileSync(file,'utf8');
  for(const match of source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)) {
    const button=match[0],classes=button.match(/class=(["'])([^"']*)\1/);
    if(!classes||!/(^|\s)btn(\s|$)/.test(classes[2]))continue;
    const body=button.slice(button.indexOf('>')+1,-9).trim();
    const pure=/^\$\{(?:appIcon|icon)\((['"])([^'"{}]+)\1\)\}$/.exec(body)||/^'\+appIcon\((['"])([^'"{}]+)\1\)\+'$/.exec(body);
    if(!pure)continue;
    assert.ok(classes[2].split(/\s+/).includes('btn-icon-only'),`${file}: unstyled pure-icon button ${pure[2]}`);
    const label=button.match(/aria-label=(["'])([\s\S]*?)\1/);
    assert.ok(label?.[2],`${file}: icon button lacks an accessible name`);
    specs.push({classes:classes[2],kind:pure[2],label:label[2]});
  }
}
assert.ok(specs.length>=18,'Guard includes printer, progress, paging, delivery and SKU actions');
const out=resolve('qa-results/icon-actions');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const profiles=[{width:320,height:740,touch:true},{width:390,height:844,touch:true},{width:640,height:360},{width:640,height:900},{width:1280,height:900}];
async function assertBare(button,state) {
  const measured=await button.evaluate(el=>{
    const s=getComputedStyle(el),r=el.getBoundingClientRect(),svg=el.querySelector('svg'),i=svg.getBoundingClientRect(),before=getComputedStyle(el,'::before'),after=getComputedStyle(el,'::after');
    return {center:Math.abs((r.left+r.right-i.left-i.right)/2)<.51&&Math.abs((r.top+r.bottom-i.top-i.bottom)/2)<.51,touch:r.width>=44&&r.height>=44,bare:s.backgroundImage==='none'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.boxShadow==='none'&&parseFloat(s.borderTopWidth)===0,still:s.transform==='none'&&s.filter==='none',noPseudo:before.display==='none'&&after.display==='none',icon:s.textAlign!==undefined&&getComputedStyle(svg).fill==='none'&&getComputedStyle(svg).stroke!=='none'};
  });
  assert.deepEqual(measured,{center:true,touch:true,bare:true,still:true,noPseudo:true,icon:true},`${state}: centered bare SVG with no inherited glass/glow`);
}
try {
  for(const profile of profiles)for(const theme of ['light','dark']) {
    const context=await browser.newContext({viewport:profile,hasTouch:!!profile.touch,isMobile:!!profile.touch}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));await context.route(/^https?:/,route=>route.abort());
    await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await waitForAppReady(page);
    await page.waitForFunction(()=>typeof appIcon==='function');
    await page.evaluate(({theme,specs})=>{
      document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
      const fixture=document.createElement('section');fixture.id='icon-action-fixture';fixture.className='card';fixture.style.cssText='position:fixed;inset:12px;z-index:2000;overflow:auto;padding:16px;';
      fixture.innerHTML='<h2>Nút icon · dữ liệu kiểm thử</h2><div style="display:flex;flex-wrap:wrap;gap:8px">'+specs.map((spec,index)=>`<button type="button" class="${spec.classes}" data-probe="${index}" aria-label="${esc(spec.label)}">${appIcon(spec.kind)}</button>`).join('')+'</div><button class="btn btn-ghost" id="icon-text-control">'+appIcon('refresh')+' Làm mới</button><button class="btn btn-ac" id="icon-primary-control">Lưu</button><button class="btn btn-ghost" id="icon-stepper-control" aria-label="Tăng số lượng">+</button><p id="icon-action-result"></p>';
      window.iconActionCalls=0;fixture.querySelectorAll('[data-probe]').forEach(button=>button.onclick=()=>{iconActionCalls++;document.getElementById('icon-action-result').textContent='Đã bấm '+iconActionCalls;});document.body.append(fixture);
    },{theme,specs});
    await page.evaluate(()=>{
      const family=document.createElement('div');family.id='button-content-fixture';family.style.cssText='display:grid;gap:8px;margin:12px 0';
      family.innerHTML=['btn-ghost','btn-ac','btn-danger','btn-gr'].map((kind,index)=>`<button type="button" class="btn ${kind}" data-centered style="min-height:44px;min-width:140px;width:100%">${index%2?'Xem máy':'Đã biết'}</button>`).join('')+`<button type="button" class="btn btn-ghost" data-centered style="width:100%;min-height:44px">${appIcon('refresh')}<span>Làm mới</span></button><button type="button" class="btn btn-ac" data-centered style="width:100%;min-height:68px;white-space:normal"><span style="max-width:130px">Xác nhận các thông báo đang chờ xử lý</span></button><div class="production-order-sources"><button class="btn btn-ghost" id="button-left-list" style="width:100%">Đơn cần in</button></div><div class="batch-library-more"><div><button class="btn btn-ghost" id="button-left-menu" style="width:100%">Thao tác khác</button></div></div>`;
      document.getElementById('icon-action-fixture').append(family);
    });
    for(const control of await page.locator('[data-centered]').all()){
      await assertButtonContentCentered(control,'normal');await control.hover();await page.waitForTimeout(180);await assertButtonContentCentered(control,'hover');
      await page.mouse.down();await assertButtonContentCentered(control,'active');await page.mouse.up();await control.focus();await assertButtonContentCentered(control,'focus');
      await control.evaluate(el=>el.disabled=true);await assertButtonContentCentered(control,'disabled');await control.evaluate(el=>el.disabled=false);
    }
    for(const id of ['button-left-list','button-left-menu'])assert.equal(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).justifyContent),'flex-start','Intentional list/menu labels remain left aligned');
    for(const button of await page.locator('[data-probe]').all())await assertBare(button,'normal');
    const button=page.locator('[data-probe="0"]');await button.hover();await assertBare(button,'hover');await page.mouse.down();await assertBare(button,'active');await page.mouse.up();
    await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.ok(await button.evaluate(el=>el===document.activeElement&&getComputedStyle(el).outlineStyle!=='none'&&parseFloat(getComputedStyle(el).outlineWidth)>=2),'Keyboard focus remains visible');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>iconActionCalls),2,'Pointer and keyboard actions still work');
    await button.evaluate(el=>el.disabled=true);await assertBare(button,'disabled');assert.equal(await button.isDisabled(),true);await button.evaluate(el=>el.disabled=false);
    for(const id of ['icon-text-control','icon-primary-control','icon-stepper-control'])assert.ok(await page.locator('#'+id).evaluate(el=>{const s=getComputedStyle(el);return s.backgroundImage!=='none'||s.backgroundColor!=='rgba(0, 0, 0, 0)';}),'Text, primary and quantity controls retain their surface');
    assert.equal(await page.locator('#icon-text-control').textContent(),' Làm mới');
    await page.screenshot({path:resolve(out,`${profile.width}-${profile.height}-${theme}.png`)});assert.deepEqual(errors,[]);await context.close();console.log(`PASS icon actions ${profile.width}x${profile.height} ${theme}: ${specs.length} source actions, centered/bare states, 44px, focus, handlers, unchanged text/primary/stepper`);
  }
}finally{await browser.close();}
