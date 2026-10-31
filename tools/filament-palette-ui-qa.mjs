import {chromium} from 'playwright-core';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {waitForAppReady} from './app-ready-qa.mjs';
const fixture=JSON.parse(readFileSync('qa-results/filament-palette/fixture.json','utf8'));
const out=resolve('qa-results/filament-palette');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [390,1440])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route(/^https?:/,r=>r.abort());
 await page.goto(pathToFileURL(resolve('plate-studio.html')).href);await waitForAppReady(page);await page.waitForFunction(()=>!!window.FilamentPickers);
 await page.evaluate(({fixture,theme})=>{
  document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');currentUser=null;cloudReady=false;canAccess=()=>true;
  fils=fixture;brands=[...new Set(fils.map(f=>f.brand))];models=[];orders=[];pitems=[];plates=[];sv(K.fils,fils);goPage('filaments');
 },{fixture,theme});
 const search=page.locator('#filament-smart-search');await search.fill('oai huong');assert.match(await page.locator('#fil-grid').innerText(),/Tím oải hương/);
 // "tim" also matches the supplier alias Timory; use the full color identity for editing.
 await search.fill('TINMORRY Purple');
 await page.waitForFunction(()=>document.querySelector('#fil-grid').textContent.includes('Pupple'));assert.match(await page.locator('#fil-grid').innerText(),/Tím/);
 assert.equal(await page.locator('#fil-grid .card').count(),1);assert.match(await page.locator('#cnt-fils').textContent(),/^1\//);
 await page.locator('#fil-grid').getByRole('button',{name:'Sửa',exact:true}).click();assert.equal(await page.locator('#fl-htxt').inputValue(),'#ca38ff');
 const source=page.locator('#dlg-fil a');assert.match(await source.getAttribute('href'),/^https:\/\/tinmorry.net\//);assert.equal(await source.getAttribute('rel'),'noopener noreferrer');assert.match(await source.textContent(),/Lấy mẫu từ ảnh/);
 await source.evaluate(el=>Promise.all(el.closest('.dlg').getAnimations().map(a=>a.finished)));
 assert.match(await page.locator('#dlg-fil').innerText(),/#9E99D3/);assert.equal(await source.evaluate(el=>el.getBoundingClientRect().height>=44),true);
 await page.locator('#fl-note').fill('Ghi chú sau khi nhập bảng màu');await page.locator('#dlg-fil').getByRole('button',{name:'Lưu',exact:true}).click();
 await page.reload();await waitForAppReady(page);await page.evaluate(()=>{document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');canAccess=()=>true;goPage('filaments');});
 const saved=await page.evaluate(()=>fils.find(f=>f.id==='purple-existing'));assert.equal(saved.hex,'#ca38ff');assert.equal(saved.name,'Pupple');assert.equal(saved.nameVi,'Tím');assert.equal(saved.paletteRefs.length,1);assert.equal(saved.note,'Ghi chú sau khi nhập bảng màu');assert.deepEqual(saved.spools,[{id:'spool-existing',grams:123}]);
 await search.fill('MT635');assert.match(await page.locator('#fil-grid').innerText(),/Xanh băng/);assert.match(await page.locator('#fil-grid').innerText(),/Ice blue/);
 await search.fill('R3D');assert.match(await page.locator('#cnt-fils').textContent(),/^21\//);
 await search.fill('khong-co-mau-nay');assert.match(await page.locator('#fil-grid').textContent(),/Không có màu nhựa/);assert.match(await page.locator('#cnt-fils').textContent(),/^0\//);
 await search.fill('CAILAB');assert.match(await page.locator('#cnt-fils').textContent(),/^23\//);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:resolve(out,`${width}-${theme}-library.png`),fullPage:true});
 assert.deepEqual(errors,[]);await context.close();console.log('PASS palette library',width,theme,'Vietnamese/code/canonical brand search, source provenance, preserved HEX/metadata/stock after edit and reload, no overflow');
}}finally{await browser.close();}
