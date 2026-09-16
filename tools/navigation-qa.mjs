/** Mobile navigation regression: isolated session, no cloud writes. */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const output=join(root,'qa-results','navigation');mkdirSync(output,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({executablePath,headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await page.goto(pathToFileURL(join(root,'plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof renderRoleMobileNavigation==='function');
 await page.addStyleTag({content:'#auth-ov{display:none!important}'});
 await page.evaluate(()=>{goPage('dashboard',{historyMode:'none'});renderRoleMobileNavigation();});
 assert.notEqual(await page.locator('#mnav-dashboard svg').innerHTML(),await page.locator('#mnav-more svg').innerHTML(),'Home and Menu need distinct icons');
 for(const width of [320,360,390,430,768,1024]){
  await page.setViewportSize({width,height:844});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
   const errors=await page.evaluate(width=>{
    const nav=document.getElementById('mobile-nav'),s=getComputedStyle(nav),errors=[];
    if(width>860)return s.display==='none'?[]:['Desktop navigation is not hidden'];
    const r=nav.getBoundingClientRect();
    if(r.height>82||r.left<0||r.right>innerWidth)errors.push('Dock bounds');
    const blur=Number(s.backdropFilter.match(/blur\((\d+)px\)/)?.[1]||0);
    if(blur!==18||s.backdropFilter.includes('url('))errors.push('Glass must use a bounded CSS blur, not a displacement filter');
    const alpha=color=>color.startsWith('rgba')?Number(color.match(/[\d.]+/g).at(-1)):1;
    for(const selector of ['#mobile-nav','.more-sheet-ov','.more-sheet','.more-sheet-head','.more-sheet-footer','.more-search','.more-group .more-item','.more-sheet-close','.more-categories button[aria-pressed="false"]']){
     const style=getComputedStyle(document.querySelector(selector));
     if(alpha(style.backgroundColor)!==0||style.backgroundImage.split(',').some(layer=>layer.trim()!=='none'))errors.push('Tint/gradient masks the blur: '+selector);
    }
    const lens=getComputedStyle(nav,'::before');
    if(alpha(lens.backgroundColor)!==0||lens.backgroundImage!=='none')errors.push('Lens still paints an opaque fill');
    if([...nav.querySelectorAll('*')].some(el=>getComputedStyle(el).backdropFilter!=='none'))errors.push('Nested backdrop filters in dock');
    if(getComputedStyle(nav,'::before').pointerEvents!=='none')errors.push('Glass lens intercepts taps');
    const buttons=[...nav.querySelectorAll('button')];
    if(buttons.length!==5)errors.push('Expected five destinations');
    for(const b of buttons){const a=b.getBoundingClientRect(),label=b.querySelector('span');
     if(a.width<44||a.height<44||a.top<r.top||a.bottom>r.bottom)errors.push('Small/raised button '+b.textContent);
     if(label.scrollWidth>label.clientWidth+1)errors.push('Clipped label '+b.textContent);
    }
    const button=buttons[0];renderRoleMobileNavigation();
    if(button!==nav.querySelector('button'))errors.push('Unnecessary DOM replacement');
    return errors;
   },width);
   assert.deepEqual(errors,[],`${width}/${theme}`);
  }
 }
 await page.setViewportSize({width:390,height:844});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.setAttribute('data-theme',theme);goPage('fulfillment',{historyMode:'none'});},theme);
  await page.waitForTimeout(350);
  await page.screenshot({path:join(output,`dock-${theme}.png`)});
  await page.locator('#mnav-more').click();
  await page.waitForTimeout(260);
  assert.equal(await page.locator('#mnav-more').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#more-sheet-ov').evaluate(el=>el.inert),false);
  await page.screenshot({path:join(output,`menu-${theme}.png`)});
  const layout=await page.evaluate(()=>{
   const sheet=document.querySelector('.more-sheet'),r=sheet.getBoundingClientRect();
   const footer=document.querySelector('.more-sheet-footer').getBoundingClientRect();
   return {fits:sheet.scrollWidth<=sheet.clientWidth&&r.bottom<=innerHeight+1&&r.top>=0,footer:footer.bottom<=r.bottom,
    animated:[...sheet.querySelectorAll('*')].some(el=>getComputedStyle(el).animationIterationCount==='infinite'),
    focus:document.activeElement===sheet};
  });
  assert.deepEqual(layout,{fits:true,footer:true,animated:false,focus:true});
  const glass=await page.evaluate(()=>{
   const sheet=document.querySelector('.more-sheet'),nav=document.getElementById('mobile-nav');
   return {blur:getComputedStyle(sheet).backdropFilter,nested:[...sheet.querySelectorAll('*')].some(el=>getComputedStyle(el).backdropFilter!=='none'),scrim:getComputedStyle(document.getElementById('more-sheet-ov')).backdropFilter,lens:Number(nav.style.getPropertyValue('--mobile-active-index'))=== [...nav.querySelectorAll('button')].findIndex(b=>b.id==='mnav-more')};
  });
  assert.deepEqual(glass,{blur:'blur(18px) saturate(1.35)',nested:false,scrim:'none',lens:true});
  assert.equal(await page.locator('#mobile-nav').evaluate(el=>getComputedStyle(el).backdropFilter),'none','Do not composite a second glass layer behind an open menu');
  assert.equal(await page.locator('#more-search').evaluate(el=>getComputedStyle(el).fontSize),'16px','Search must not trigger iOS focus zoom');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'more-auth-btn');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.className),'more-sheet-close');
  await page.locator('#more-search').fill('DON HANG');
  assert.ok(await page.locator('.more-group .more-item:visible').count()>=2,'Accent-insensitive search');
  await page.locator('#more-search').fill('zz-no-result');
  assert.equal(await page.locator('#more-empty').isVisible(),true);
  await page.locator('.more-search-clear').click();
  await page.locator('[data-more-category="delivery"]').click();
  assert.equal(await page.locator('[data-more-group]:visible').count(),1);
  assert.equal(await page.locator('[data-more-group="delivery"]').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#more-sheet-ov').evaluate(el=>el.inert),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'mnav-more');
 }
 // A horizontal swipe must not dismiss; downward drag must. Cancel resets styles.
 await page.locator('#mnav-more').click();await page.waitForTimeout(260);
 const gesture=async(dx,dy,cancel=false)=>page.evaluate(({dx,dy,cancel})=>{
  const target=document.querySelector('.more-sheet-title-row');
  const touch=(x,y)=>new Touch({identifier:1,target,clientX:x,clientY:y});
  target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(80,180)]}));
  target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[touch(80+dx,180+dy)]}));
  target.dispatchEvent(new TouchEvent(cancel?'touchcancel':'touchend',{bubbles:true,touches:[]}));
  return document.getElementById('more-sheet-ov').classList.contains('show');
 },{dx,dy,cancel});
 assert.equal(await gesture(120,8),true);assert.equal(await gesture(0,110,true),true);assert.equal(await gesture(0,110),false);
 // Short visual viewport: landscape/keyboard must leave a scrollable result area.
 for(const viewport of [{width:390,height:500},{width:740,height:320}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>toggleMoreSheet());await page.waitForTimeout(250);
  assert.ok(await page.locator('.more-sheet-scroll').evaluate(el=>el.clientHeight>=60),'Menu results disappear in short viewport');
  await page.evaluate(()=>closeMoreSheet());
 }
 await page.setViewportSize({width:390,height:844});
 // Action executes once, after closing the sheet; use a read-only route.
 await page.locator('#mnav-more').click();
 await page.locator('#more-search').fill('don hang');
 await page.evaluate(()=>{window.__navCalls=0;window.__realGoPage=goPage;goPage=(...args)=>{window.__navCalls++;return window.__realGoPage(...args);};});
 await page.locator('.more-item[data-sidebar-page="orders"]').click();
 await page.waitForTimeout(350);
 assert.equal(await page.evaluate(()=>window.__navCalls),1);
 assert.equal(await page.locator('#mnav-more').getAttribute('aria-current'),'page');
 await page.evaluate(()=>{goPage=window.__realGoPage;});
 // Real role/grant computation is exercised by workflow QA; mock grants here to
 // verify all dock shapes and that search cannot expose a denied menu control.
 const roles=await page.evaluate(()=>{
  const saved={currentUser,currentMobileNavigationRole,currentAppPermissions,isWorkspaceOwner,isDeliveryReceiveOnlyAccount,canAccess};
  const cases=[['owner',['orders.manage','models.manage','progress.view']],['workshop',['assembly.qc','progress.view','batches.view']],['packaging',['packaging.manage']],['store',['delivery.receive','kiot.import','assembly.qc']],['custom',['batches.report']]];
  const result=[];
  try{
   currentUser={id:'isolated-nav-qa'};isDeliveryReceiveOnlyAccount=()=>false;
   for(const [role,grants] of cases){
    currentMobileNavigationRole=()=>role;currentAppPermissions=()=>grants;isWorkspaceOwner=()=>role==='owner';canAccess=p=>role==='owner'||grants.includes(p);
    renderRoleMobileNavigation();filterMoreNavigation();
    const nav=document.getElementById('mobile-nav'),buttons=[...nav.querySelectorAll('button')];
    result.push({role,unique:new Set(buttons.map(b=>b.id)).size===buttons.length,primary:nav.querySelector('.mnav-primary-action')?.textContent.trim(),fits:buttons.every(b=>b.getBoundingClientRect().width>=44),deniedHidden:[...document.querySelectorAll('.more-group .more-item')].every(b=>moreNavigationAllowed(b)||b.hidden)});
   }
  }finally{currentUser=saved.currentUser;currentMobileNavigationRole=saved.currentMobileNavigationRole;currentAppPermissions=saved.currentAppPermissions;isWorkspaceOwner=saved.isWorkspaceOwner;isDeliveryReceiveOnlyAccount=saved.isDeliveryReceiveOnlyAccount;canAccess=saved.canAccess;renderRoleMobileNavigation();}
  return result;
 });
 assert.deepEqual(roles.map(x=>x.primary),['Tạo đơn','Gia công','Bao bì','Kiểm hàng','Chụp mẻ']);
 assert.ok(roles.every(x=>x.unique&&x.fits&&x.deniedHidden),JSON.stringify(roles));
 // Respect OS accessibility choices in both themes, not just reduce animation.
 const cdp=await page.context().newCDPSession(page);
 for(const feature of ['prefers-reduced-transparency','prefers-contrast']){
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:feature,value:feature==='prefers-contrast'?'more':'reduce'}]});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
   const fallback=await page.evaluate(()=>['#mobile-nav','.more-sheet'].map(selector=>{const s=getComputedStyle(document.querySelector(selector));return {blur:s.backdropFilter,opaque:!s.backgroundColor.startsWith('rgba')};}));
   assert.deepEqual(fallback,[{blur:'none',opaque:true},{blur:'none',opaque:true}],feature+'/'+theme);
  }
 }
 await cdp.send('Emulation.setEmulatedMedia',{features:[]});await cdp.detach();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>toggleMoreSheet());
 assert.equal(await page.locator('.more-sheet').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 assert.equal(await page.locator('#mobile-nav').evaluate(el=>getComputedStyle(el,'::before').transitionDuration),'0s');
 console.log('Navigation QA: PASS — 6 widths, 2 themes, 5 roles, search/categories, gestures, focus, actions, bounded glass, reduced transparency/contrast/motion.');
}finally{await browser.close();}
