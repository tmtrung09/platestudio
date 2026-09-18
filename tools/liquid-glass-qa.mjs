import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(resolve(root,'qa-results/liquid-glass'),{recursive:true});
const source=path=>readFileSync(resolve(root,path),'utf8').replace(/\r\n/g,'\n');
assert.equal(source('assets/vendor/ybouane-liquidglass.js'),source('node_modules/@ybouane/liquidglass/dist/index.js'),'Upstream must remain unmodified');
const server=createServer((req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':'text/html');res.end(readFileSync(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});let imports=0;
 await page.route('**/*',r=>{if(r.request().url().includes('/vendor/ybouane-liquidglass.js'))imports++;return r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort();});
 const boot=async()=>{await page.goto(origin+'/plate-studio.html');await page.waitForFunction(()=>window.PlateLiquidGlass&&typeof goPage==='function');await page.evaluate(()=>{document.getElementById('auth-ov').style.display='none';goPage('settings');renderRoleMobileNavigation();});};
 await boot();assert.equal(imports,0,'Disabled preference must not download GPU library');
 for(const width of [320,390,1280])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:844});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.equal(await page.locator('#page-settings h1').count(),1);
  const box=await page.locator('.glass-setting-row').boundingBox();assert(box.width<=width&&box.x>=0);
  await page.screenshot({path:resolve(root,`qa-results/liquid-glass/settings-${width}-${theme}.png`)});
  await page.locator('#glass-preference').focus();assert(await page.locator('#glass-preference').evaluate(el=>el===document.activeElement));
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#glass-preference').check();assert.equal(await page.evaluate(()=>localStorage.getItem('ps_liquid_gl')),'on');assert.equal(imports,0,'No forced reload during work');
 await boot();await page.evaluate(()=>PlateLiquidGlass.refresh());await page.waitForFunction(()=>PlateLiquidGlass.status.loaded,{},{timeout:30000});
 assert(imports>0);assert.equal(await page.locator('.plate-glass-lens canvas').count(),1);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.plate-glass-lens canvas')).filter),'none');
 assert.equal(await page.evaluate(()=>!!window.__liquidGLRenderer__),false,'Old engine must not load');
 // Nested scroll + lazy content mutations must not force lens layout or rasterization.
 await page.waitForTimeout(1800);
 await page.evaluate(()=>{
  const nav=document.getElementById('mobile-nav');
  window.glassScrollProbe={reads:0,start:PlateLiquidGlass.status.captures};
  const rect=nav.getBoundingClientRect.bind(nav);
  nav.getBoundingClientRect=()=>{glassScrollProbe.reads++;return rect();};
 });
 for(let i=0;i<8;i++){
  await page.evaluate(()=>{
   const host=document.getElementById('pg-content');host.dispatchEvent(new Event('scroll'));
   const mark=document.createElement('span');host.append(mark);mark.remove();
  });
  await page.waitForTimeout(240);
 }
 assert.deepEqual(await page.evaluate(()=>({reads:glassScrollProbe.reads,captures:PlateLiquidGlass.status.captures-glassScrollProbe.start})),{reads:0,captures:0},'No lens layout or background captures during scrolling, even across short pauses');
 await page.waitForFunction(()=>PlateLiquidGlass.status.captures-glassScrollProbe.start===1,{},{timeout:10000});
 await page.waitForTimeout(800);
 assert.equal(await page.evaluate(()=>PlateLiquidGlass.status.captures-glassScrollProbe.start),1,'Coalesce the entire scroll burst into one background refresh');
 await page.screenshot({path:resolve(root,'qa-results/liquid-glass/native-glass.png')});
 // Real nested scrolling must sample the new viewport, not the top of a stale clone.
 await page.evaluate(()=>{
  const page=document.getElementById('page-settings');window.savedSettings=page.innerHTML;
  page.innerHTML='<div style="height:3200px;background:linear-gradient(#d02020 0 50%,#2040dd 50% 100%)"></div>';
 });
 await page.waitForTimeout(1700);
 const pixel=()=>page.locator('.plate-glass-lens canvas').evaluate(c=>[...c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data]);
 const topPixel=await pixel();assert(topPixel[0]>topPixel[2],'Top of long content is red behind the glass');
 await page.evaluate(()=>{const el=document.getElementById('pg-content');el.style.scrollBehavior='auto';el.scrollTop=1700;});
 await page.waitForTimeout(2000);
 const bottomPixel=await pixel();assert(bottomPixel[2]>bottomPixel[0],'Scrolled viewport is blue behind the glass');
 await page.evaluate(()=>{document.getElementById('page-settings').innerHTML=savedSettings;document.getElementById('pg-content').scrollTop=0;PlateLiquidGlass.renderSettings();});
 await page.waitForTimeout(1200);
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(1200);
  const color=await pixel();assert(theme==='dark'?color[0]<100:color[0]>150,'Glass background follows theme instead of falling back to white');
  await page.screenshot({path:resolve(root,`qa-results/liquid-glass/ybouane-${theme}.png`)});
 }
 await page.evaluate(()=>{const camera=document.createElement('div');camera.id='br-multi-cam';document.body.append(camera);});
 await page.waitForFunction(()=>!PlateLiquidGlass.status.loaded);
 assert.equal(await page.locator('.plate-glass-lens').count(),0,'Camera suspends GPU glass');
 await page.evaluate(()=>document.getElementById('br-multi-cam').remove());await page.waitForFunction(()=>PlateLiquidGlass.status.loaded);
 await page.locator('#mnav-more').click();await page.waitForTimeout(500);assert(await page.locator('#more-sheet-ov').evaluate(el=>el.classList.contains('show')));
 await page.waitForFunction(()=>document.querySelector('.more-sheet').hasAttribute('data-liquid-ready'));
 assert.equal(await page.locator('.plate-glass-lens canvas').count(),1,'Menu shares the same renderer');
 await page.screenshot({path:resolve(root,'qa-results/liquid-glass/new-menu.png')});
 await page.setViewportSize({width:1280,height:900});await page.waitForFunction(()=>!PlateLiquidGlass.status.loaded);
 assert.equal(await page.locator('.plate-glass-lens').count(),0,'Desktop releases mobile GPU resources');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>PlateLiquidGlass.status.loaded);
 await page.evaluate(()=>closeMoreSheet());await page.locator('#glass-preference').uncheck();
 const before=imports;await boot();assert.equal(imports,before);assert.equal(await page.locator('.plate-glass-lens').count(),0);
 console.log('PASS: ybouane original bundle, opt-in, themes, scroll coalescing and viewport pixels, shared menu, camera/desktop cleanup, persistence.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
