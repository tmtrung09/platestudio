import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(resolve(root,'qa-results/liquid-glass'),{recursive:true});
const source=path=>readFileSync(resolve(root,path),'utf8').replace(/\r\n/g,'\n');
assert.equal(source('assets/vendor/liquidGL.js'),source('node_modules/liquid-gl/liquidGL.js'),'Upstream must remain unmodified');
const server=createServer((req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':'text/html');res.end(readFileSync(path));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});let imports=0;
 await page.route('**/*',r=>{if(r.request().url().includes('/vendor/liquidGL.js'))imports++;return r.request().url().startsWith(origin)?r.continue():r.abort();});
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
 await boot();await page.evaluate(()=>PlateLiquidGlass.refresh());await page.waitForFunction(()=>window.__liquidGLRenderer__?.hasTexture,{},{timeout:30000});
 assert(imports>0);assert.equal(await page.evaluate(()=>getComputedStyle(window.__liquidGLRenderer__.canvas).filter),'none');
 assert.equal(await page.evaluate(()=>window.__liquidGLRenderer__.lenses[0].options.specular),true);
 await page.screenshot({path:resolve(root,'qa-results/liquid-glass/native-glass.png')});
 await page.locator('#mnav-more').click();await page.waitForTimeout(500);assert(await page.locator('#more-sheet-ov').evaluate(el=>el.classList.contains('show')));
 await page.evaluate(()=>closeMoreSheet());await page.locator('#glass-preference').uncheck();
 const before=imports;await boot();assert.equal(imports,before);assert.equal(await page.evaluate(()=>!!window.__liquidGLRenderer__),false);
 console.log('PASS: original vendor, default off, settings mobile/desktop themes, focus, persistence, native GPU, menu, off reload.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
