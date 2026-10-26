/** Real menu rendering and permissions; all traffic stays in an isolated fixture. */
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {waitForAppReady} from './app-ready-qa.mjs';
const root=resolve('.'),out=resolve('qa-results/custom-orders-navigation'),base='https://custom-order-navigation.test/';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try{
 for(const viewport of [{width:320,height:740},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1024,height:900},{width:1440,height:900}])for(const theme of ['light','dark']){
  const mobile=viewport.width<=860,context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile,serviceWorkers:'block',reducedMotion:'reduce'});
  const errors=[];let destinations=0;
  await context.route(/^https?:/,route=>{
   const url=new URL(route.request().url());
   if(url.origin!==new URL(base).origin)return route.abort();
   if(url.pathname==='/custom-orders.html'){destinations++;return route.fulfill({contentType:'text/html',body:'<main data-custom-destination>Isolated custom order destination</main>'});}
   const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep)||!existsSync(path))return route.abort();
   return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'})[extname(path)]||'application/octet-stream'});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'plate-studio.html',{waitUntil:'domcontentloaded'});await waitForAppReady(page);
  await page.addStyleTag({content:'#auth-ov{display:none!important}'});
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;goPage('dashboard',{historyMode:'none'});},theme);
  const cases=[['owner',[],true],['manager',['orders.manage'],true],['creator',['custom_orders.create'],true],['viewer',['custom_orders.view'],true],['unrelated',['models.manage'],false],['revoked',[],false],['signed-out',[],false]];
  for(const [role,permissions,allowed] of cases){
   await page.evaluate(({role,permissions})=>{
    currentUser=role==='signed-out'?null:{id:'navigation-qa',email:'navigation@example.test'};
    activeWorkspace={workspace_id:'isolated-navigation',owner_user_id:role==='owner'?'navigation-qa':'another-owner',role:role==='creator'||role==='viewer'?'store_custom':'custom',permissions};
    renderSb();applyWorkspaceNavigationPermissions();filterMoreNavigation();
   },{role,permissions});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const sidebar=page.locator('#sidebar .sb-scroll [data-custom-orders-entry]'),menu=page.locator('#more-sheet-ov [data-custom-orders-entry]');
   assert.equal(await sidebar.count(),1,'Custom entry survives the real sidebar renderer');
   assert.equal(await menu.count(),1,'Mobile Menu contains a custom entry');
   const states=await page.evaluate(()=>[...document.querySelectorAll('[data-custom-orders-entry]')].map(el=>({allowed:el.style.display!=='none',menu:el.closest('#more-sheet-ov')?moreNavigationAllowed(el):null})));
   assert.ok(states.every(state=>state.allowed===allowed&&(state.menu===null||state.menu===allowed)),role+': permission boundary');
   if(!allowed){
    // Even a stale/programmatic action must stop after revocation or sign-out.
    await page.evaluate(()=>openCustomOrders());assert.equal(destinations,0,'Denied action cannot navigate');
   }
  }
  // Re-grant without rebuilding the sidebar: live permission refresh must work.
  await page.evaluate(()=>{currentUser={id:'navigation-qa'};activeWorkspace={workspace_id:'isolated-navigation',owner_user_id:'another-owner',role:'custom',permissions:['custom_orders.view']};applyWorkspaceNavigationPermissions();});
  if(mobile){
   await page.locator('#mnav-more').click();await page.locator('#more-search').fill('DON CUSTOM');
   assert.equal(await page.locator('.more-group .more-item:visible').count(),1,'Menu search finds the actual feature');
  }else{
   await page.evaluate(()=>{if(document.querySelector('#sidebar .sb-nav-group-toggle')&&sidebarGroupCollapsed('work'))toggleSidebarGroup('work');if(!sbPinned)toggleSbPin();});
  }
  const entry=page.locator(mobile?'#more-sheet-ov [data-custom-orders-entry]':'#sidebar .sb-scroll [data-custom-orders-entry]');
  await entry.scrollIntoViewIfNeeded();await entry.focus();
  assert.equal(await entry.isVisible(),true,'Authorized entry is reachable');
  const geometry=await entry.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right,left:r.left,svg:!!el.querySelector('svg'),focus:document.activeElement===el};});
  assert.ok(geometry.width>=44&&geometry.height>=44&&geometry.left>=0&&geometry.right<=viewport.width+1&&geometry.svg&&geometry.focus,JSON.stringify({viewport,theme,geometry}));
  await page.screenshot({path:resolve(out,`${viewport.width}-${theme}.png`)});
  if(theme==='dark')await page.keyboard.press('Enter');else await entry.click();
  await page.locator('[data-custom-destination]').waitFor();
  assert.equal(page.url(),base+'custom-orders.html');assert.equal(destinations,1,'One action opens the correct page once');assert.deepEqual(errors,[]);
  results.push({viewport,theme,roles:cases.length,destinations,status:'PASS'});await context.close();
 }
 writeFileSync(resolve(out,'results.json'),JSON.stringify({status:'PASS',profiles:results},null,2));
 console.log(`Custom order navigation QA: PASS — ${results.length} viewport/theme profiles, 7 permission states, real sidebar rebuild, re-grant, search, 44px targets, focus, click/Enter and destination.`);
}finally{await browser.close();}
