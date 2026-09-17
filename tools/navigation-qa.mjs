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
    const dockFilter=document.documentElement.dataset.theme==='light'?'blur(18px) saturate(0.85) contrast(0.2) brightness(1.7)':'blur(18px) saturate(0.85) contrast(0.4) brightness(0.48)';
    if(s.backdropFilter!==dockFilter||(CSS.supports('-webkit-backdrop-filter','blur(1px)')&&s.getPropertyValue('-webkit-backdrop-filter')!==dockFilter))errors.push('Missing theme-aware backdrop contrast guard: '+s.backdropFilter);
    const edgeAlpha=Number(s.borderTopColor.match(/[\d.]+/g)?.at(-1));
    if(edgeAlpha>.5)errors.push('Navigation glass edge is too bright');
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
 // Sample the actual composited pixels under every label, not just CSS tokens.
 // Extreme backgrounds and scrolling reproduce the original transparent-dock bug.
 await page.evaluate(()=>{
  const fixture=document.createElement('div');fixture.id='nav-contrast-fixture';
  fixture.style.cssText='position:fixed;inset:0;z-index:1099;overflow:auto;pointer-events:none';
  for(const background of ['#000','#fff','#f00','#0f0','#00f','repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0 0 / 32px 32px','linear-gradient(100deg,#ff0080,#00ff80,#007bff,#ffdf00)']){
   const section=document.createElement('div');section.style.cssText='height:1000px;background:'+background;fixture.append(section);
  }
  document.body.append(fixture);
 });
 const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(let background=0;background<7;background++){
   await page.evaluate(index=>{document.getElementById('nav-contrast-fixture').scrollTop=index*1000+100;},background);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const labels=await page.evaluate(()=>{
    const nav=document.getElementById('mobile-nav'),bounds=nav.getBoundingClientRect();
    return [...nav.querySelectorAll('.mnav-btn>span')].map(label=>{
     const r=label.getBoundingClientRect();
     return {text:label.textContent,rgb:getComputedStyle(label).color.match(/[\d.]+/g).slice(0,3).map(Number),x:r.x+r.width/2-bounds.x,y:r.y+r.height/2-bounds.y};
    });
   });
   const hide=await page.addStyleTag({content:'#mobile-nav .mnav-btn{visibility:hidden!important}'});
   const pixels=await page.locator('#mobile-nav').screenshot();
   await hide.evaluate(el=>el.remove());
   const samples=await page.evaluate(async({png,labels})=>{
    const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    return labels.map(label=>[-8,0,8].map(dx=>[...ctx.getImageData(Math.round(label.x+dx),Math.round(label.y),1,1).data].slice(0,3)));
   },{png:pixels.toString('base64'),labels});
   labels.forEach((label,i)=>samples[i].forEach(rgb=>assert.ok(ratio(label.rgb,rgb)>=4.5,`${theme}/background ${background}/${label.text}: ${ratio(label.rgb,rgb).toFixed(2)} contrast`)));
   if(background===6)await page.screenshot({path:join(output,`contrast-${theme}.png`)});
  }
 }
 await page.locator('#mnav-dashboard').focus();
 assert.equal(await page.locator('#mnav-dashboard').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
 const scrollMutations=await page.evaluate(async()=>{
  let count=0;const observer=new MutationObserver(records=>count+=records.length);
  observer.observe(document.getElementById('mobile-nav'),{subtree:true,attributes:true,childList:true,characterData:true});
  for(let i=0;i<12;i++){document.getElementById('nav-contrast-fixture').scrollTop=i*400;await new Promise(requestAnimationFrame);}
  observer.disconnect();document.getElementById('nav-contrast-fixture').remove();return count;
 });
 assert.equal(scrollMutations,0,'Backdrop adaptation must not rerender the dock on scroll');
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
  assert.deepEqual(glass,{blur:'blur(18px) saturate(0.95) brightness(0.94)',nested:false,scrim:'none',lens:true});
  assert.equal(await page.locator('#mobile-nav').evaluate(el=>getComputedStyle(el).backdropFilter),'none','Do not composite a second glass layer behind an open menu');
  assert.equal(await page.locator('#more-search').evaluate(el=>getComputedStyle(el).fontSize),'16px','Search must not trigger iOS focus zoom');
  const metal=await page.locator('.more-search').evaluate(el=>{
   const input=el.querySelector('input'),text=getComputedStyle(input),hint=getComputedStyle(input,'::placeholder'),rim=getComputedStyle(el,'::before');
   return {color:text.color,hint:hint.color,opacity:hint.opacity,weight:hint.fontWeight,shadow:hint.textShadow,rim:rim.backgroundImage,mask:rim.maskComposite,pointer:rim.pointerEvents,animation:rim.animationName,icon:getComputedStyle(el.querySelector('svg')).stroke};
  });
  assert.equal(metal.color,theme==='light'?'rgb(48, 65, 88)':'rgb(237, 242, 250)');
  assert.equal(metal.hint,metal.color);assert.equal(metal.icon,metal.color);assert.equal(metal.opacity,'1');assert.equal(metal.weight,'600');
  assert.notEqual(metal.shadow,'none');assert.ok(metal.rim.includes('linear-gradient'));assert.ok(metal.mask.split(',').every(value=>value.trim()==='exclude'));assert.equal(metal.pointer,'none');assert.equal(metal.animation,'none');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'more-auth-btn');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.className),'more-sheet-close');
  await page.locator('#more-search').fill('DON HANG');
  assert.equal(await page.locator('.more-search').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
  assert.equal(await page.locator('.more-search').evaluate(el=>getComputedStyle(el).outlineWidth),'2px');
  assert.equal(await page.locator('#more-search').evaluate(el=>getComputedStyle(el).color),metal.color,'Typed text must stay legible too');
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
    const primary=nav.querySelector('.mnav-primary-action'),iconSamples=[];
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
    const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
    const originalTheme=document.documentElement.dataset.theme,wasActive=primary?.classList.contains('active');
    for(const theme of ['light','dark'])for(const active of [false,true]){
     document.documentElement.dataset.theme=theme;primary?.classList.toggle('active',active);
     if(primary){const s=getComputedStyle(primary.querySelector('.mnav-icon'));iconSamples.push({theme,active,ink:rgba(s.color),background:rgba(s.backgroundColor)});}
    }
    document.documentElement.dataset.theme=originalTheme;primary?.classList.toggle('active',wasActive);
    result.push({role,unique:new Set(buttons.map(b=>b.id)).size===buttons.length,primary:primary?.textContent.trim(),fits:buttons.every(b=>b.getBoundingClientRect().width>=44),deniedHidden:[...document.querySelectorAll('.more-group .more-item')].every(b=>moreNavigationAllowed(b)||b.hidden),iconSamples});
   }
  }finally{currentUser=saved.currentUser;currentMobileNavigationRole=saved.currentMobileNavigationRole;currentAppPermissions=saved.currentAppPermissions;isWorkspaceOwner=saved.isWorkspaceOwner;isDeliveryReceiveOnlyAccount=saved.isDeliveryReceiveOnlyAccount;canAccess=saved.canAccess;renderRoleMobileNavigation();}
  return result;
 });
 assert.deepEqual(roles.map(x=>x.primary),['Tạo đơn','Gia công','Bao bì','Kiểm hàng','Chụp mẻ']);
 assert.ok(roles.every(x=>x.unique&&x.fits&&x.deniedHidden),JSON.stringify(roles));
 for(const role of roles)for(const sample of role.iconSamples){
  assert.equal(sample.background[3],255,`${role.role}/${sample.theme}/${sample.active}: primary icon needs its own contrast surface`);
  assert.ok(ratio(sample.ink.slice(0,3),sample.background.slice(0,3))>=3,`${role.role}/${sample.theme}/${sample.active}: primary icon contrast`);
 }
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
 console.log('Navigation QA: PASS — 6 widths, 2 themes, 5 roles, 7 composited contrast backgrounds, scroll without rerender, primary icon states, search/categories, gestures, focus, actions, bounded glass, reduced transparency/contrast/motion.');
}finally{await browser.close();}
