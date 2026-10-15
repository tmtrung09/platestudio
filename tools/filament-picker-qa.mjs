import {waitForAppReady} from './app-ready-qa.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('qa-results/filament-picker');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
function contrast(a,b){const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);return (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);}
try{for(const width of [320,390,640,1280])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:width===640?360:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route(/^https?:/,r=>r.abort());
 await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await waitForAppReady(page);await page.waitForFunction(()=>!!window.FilamentPickers);
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');currentUser=null;cloudReady=false;canAccess=()=>true;
  operations={};models=[];orders=[];plates=[];pitems=[];
  fils=Array.from({length:320},(_,i)=>({id:'f-'+i,brand:i===1?'Generic':'Timory',name:i===1?'Xám xi măng':i===2?'Marble Hồng – tên màu dài để kiểm tra bố cục':'Màu thử '+i,hex:i===1?'#676767':i===2?'#dd88aa':'#ffeecc',mat:i%2?'PETG':'PLA'}));
  sv(K.fils,fils);openNightPlanEditor('lucifer');
 },theme);
 await page.locator('.pp-manual>summary').click();await page.locator('#pp-manual-name').fill('Bình decor');await page.locator('#pp-manual-note').fill('Giữ ghi chú khi chọn màu');
 const toggle=page.locator('#pp-manual-color').locator('..').locator('.br-color-picker-toggle');assert.equal(await toggle.count(),1);
 assert.equal(await page.locator('#pp-manual-color').isVisible(),false,'Long native filament dropdown cannot be the visible control');
 assert.equal(await toggle.textContent(),'Chưa chỉ định','Never select a default filament implicitly');
 await page.evaluate(()=>{window.keptName=document.getElementById('pp-manual-name');window.keptNote=document.getElementById('pp-manual-note');window.keptManual=document.querySelector('.pp-manual');});
 await toggle.click();const menu=page.locator('body>.filament-menu'),search=menu.getByRole('searchbox',{name:'Tìm màu nhựa'});await menu.waitFor({state:'visible'});
 assert.equal(await menu.locator('[role="option"]').count(),80,'Bound large libraries without hiding the remaining choices');await menu.getByRole('button',{name:'Xem thêm màu'}).click();assert.equal(await menu.locator('[role="option"]').count(),160);
 await search.fill('xi mang');assert.equal(await menu.locator('[role="option"]').count(),1,'Vietnamese accent-insensitive search');assert.match(await menu.textContent(),/1 lựa chọn/);
 const icons=await menu.evaluate(el=>[...el.querySelectorAll('svg')].map(icon=>{const s=getComputedStyle(icon);return {fill:s.fill,stroke:s.stroke,width:icon.getBoundingClientRect().width};}));assert.ok(icons.every(icon=>icon.fill==='none'&&icon.stroke!=='none'&&icon.width===16),'Search and close icons are outlined, visible and compact');
 const closeStyle=await menu.getByRole('button',{name:'Đóng chọn màu'}).evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,border:s.borderTopWidth,shadow:s.boxShadow};});assert.equal(closeStyle.bg,'rgba(0, 0, 0, 0)');assert.equal(closeStyle.border,'0px');assert.equal(closeStyle.shadow,'none','Bare icon close has no button shell');
 const geometry=await menu.evaluate(el=>{const r=el.getBoundingClientRect();return {inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,touch:[...el.querySelectorAll('input,button')].filter(n=>n.getClientRects().length).every(n=>n.getBoundingClientRect().height>=44),background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el.querySelector('b')).color};});assert.equal(geometry.inside,true);assert.equal(geometry.touch,true);assert.ok(contrast(geometry.text,geometry.background)>=4.5,'Readable color options in both themes');
 await page.screenshot({path:resolve(out,`${width}-${theme}-search.png`)});
 await search.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await page.locator('#pp-manual-color').inputValue(),'f-1');assert.equal(await page.evaluate(()=>printPlanEditState.manual.filamentId),'f-1');assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
 assert.ok(await page.evaluate(()=>keptName===document.getElementById('pp-manual-name')&&keptNote===document.getElementById('pp-manual-note')&&keptManual===document.querySelector('.pp-manual')),'Changing color keeps form DOM, drafts and unrelated fields');assert.equal(await page.locator('#pp-manual-note').inputValue(),'Giữ ghi chú khi chọn màu');
 await toggle.click();await search.fill('#dd88aa');assert.match(await menu.textContent(),/Marble Hồng/,'Search hexadecimal metadata');await search.fill('PETG');assert.match(await menu.textContent(),/160 lựa chọn/,'Search material metadata');await search.fill('not-found-xyz');assert.match(await menu.textContent(),/Không tìm thấy màu/);assert.match(await menu.textContent(),/0 lựa chọn/);
 await page.keyboard.press('Escape');assert.equal(await menu.count(),0);assert.ok(await page.locator('.pp-manual').isVisible(),'Escape closes only the picker, not the editor');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 await toggle.click();await menu.locator('[data-value=""]').click();assert.equal(await page.evaluate(()=>printPlanEditState.manual.filamentId),'','Optional color remains clearable');
 // Existing rendering paths must install the same primitive, not just the reported instance.
 await page.evaluate(()=>{
  window.pickerFamily=document.createElement('div');pickerFamily.id='picker-family-qa';
  const options='<option value="">Chưa chọn</option>'+fils.map(f=>`<option value="${f.id}">${f.brand} · ${f.name}</option>`).join('');
  pickerFamily.innerHTML=`<div class="ms-slot"><select>${options}</select></div><label class="br-plan-color"><select>${options}</select></label><div class="of-cr-color-row"><select>${options}</select></div><select onchange="setAiDraftFilament(this.value)">${options}</select>`+batchManualColorPickerHtml(0,'f-1');
  document.querySelector('.pp-manual-form').append(pickerFamily);FilamentPickers.init(pickerFamily);
 });assert.equal(await page.locator('#picker-family-qa .filament-picker').count(),5,'Shared primitive covers slot, review, order, AI and manual report families');
 await page.evaluate(()=>{const slot=document.querySelector('#picker-family-qa .ms-slot select');slot.disabled=true;FilamentPickers.init(pickerFamily);});assert.equal(await page.locator('#picker-family-qa .ms-slot button.br-color-picker-toggle').isDisabled(),true,'Offline slot remains disabled');
 await page.locator('#picker-family-qa .br-plan-color .br-color-picker-toggle').click();await page.evaluate(()=>pickerFamily.remove());await page.waitForTimeout(20);assert.equal(await page.locator('body>.filament-menu').count(),0,'Detached form cannot leave an orphan menu');
 await page.evaluate(()=>{const native=document.createElement('select');native.id='native-theme-qa';native.innerHTML='<option>Trạng thái</option>';document.body.append(native);});
 const native=await page.locator('#native-theme-qa option').evaluate(el=>{const s=getComputedStyle(el);return {text:s.color,bg:s.backgroundColor,scheme:getComputedStyle(el.parentElement).colorScheme};});assert.ok(contrast(native.text,native.bg)>=4.5,'All native option fallbacks have safe contrast');assert.equal(native.scheme,theme);
 await page.evaluate(()=>{const button=document.createElement('button');button.id='filament-outside-qa';button.textContent='Ngoài bộ chọn';button.style.cssText='position:fixed;right:0;top:0;width:100px;height:44px;z-index:13000';document.body.append(button);});
 await toggle.click();await page.locator('#filament-outside-qa').click();assert.equal(await page.locator('body>.filament-menu').count(),0,'Outside click closes without stealing focus');assert.equal(await page.locator('#filament-outside-qa').evaluate(el=>el===document.activeElement),true);await page.evaluate(()=>document.getElementById('filament-outside-qa').remove());
 await page.evaluate(()=>{fils=[];document.getElementById('pp-manual-color').innerHTML='<option value="">Chưa chỉ định</option>';FilamentPickers.init(document.querySelector('.pp-manual'));});await toggle.click();await search.fill('green');assert.match(await menu.textContent(),/Không tìm thấy màu/);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS filament picker ${width}/${theme}: 320 colors, swatches/search/count, shared families, contrast, keyboard/touch, portal, preserved draft, disabled/empty`);
}}finally{await browser.close();}
