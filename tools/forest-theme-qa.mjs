import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {waitForAppReady} from './app-ready-qa.mjs';
const baseline=process.env.QA_FOREST_BASELINE==='1',out=resolve('qa-results/forest-theme');mkdirSync(out,{recursive:true});
const routes=[...readFileSync('plate-studio.html','utf8').matchAll(/<div class="page(?: active)?" id="page-([^"]+)"/g)].map(m=>m[1]);
assert.ok(readFileSync('push-sw.js','utf8').includes('./assets/app/forest-theme.css'),'Shared theme survives offline reload');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[],pixelChecks=[];
const profiles=[[320,740],[390,844],[430,932],[844,390],[1440,900]].filter(([width])=>!process.env.QA_FOREST_WIDTH||width===Number(process.env.QA_FOREST_WIDTH));
assert.ok(profiles.length,'Requested viewport exists');
async function compositedLabels(page,theme){
 const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const route of ['models','fulfillment']){
  await page.evaluate(route=>goPage(route,{historyMode:'none'}),route);await page.waitForTimeout(650);
  const selector=route==='models'?'.model-category-name,.model-category-count':'.fulfillment-process-tab>span,.fulfillment-process-tab>b';
  const labels=await page.locator(selector).evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,rgb:getComputedStyle(el).color.match(/[\d.]+/g).slice(0,3).map(Number),x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};}).filter(r=>r.w>0&&r.h>0&&r.x>0&&r.x<innerWidth&&r.y>0&&r.y<innerHeight));
  assert.ok(labels.length>=2,`${route}: real category/tab labels present`);
  const originalStyles=await page.locator(selector).evaluateAll(nodes=>nodes.map(el=>{const value=el.getAttribute('style');el.style.setProperty('color','transparent','important');el.style.setProperty('text-shadow','none','important');return value;}));
  const png=await page.screenshot();
  await page.locator(selector).evaluateAll((nodes,styles)=>nodes.forEach((el,index)=>styles[index]===null?el.removeAttribute('style'):el.setAttribute('style',styles[index])),originalStyles);
  const pixels=await page.evaluate(async({png,labels})=>{
   const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   return labels.map(label=>[-2,0,2].map(dx=>[...ctx.getImageData(Math.round(label.x+dx),Math.round(label.y),1,1).data].slice(0,3)));
  },{png:png.toString('base64'),labels});
  const values=labels.map((label,index)=>({text:label.text,ratio:Math.min(...pixels[index].map(color=>ratio(label.rgb,color)))}));
  for(const value of values)assert.ok(value.ratio>=4.5,`${theme}/${route}: composited label contrast ${JSON.stringify(value)}`);
  pixelChecks.push({theme,route,values});
 }
}
try{
 for(const [width,height] of profiles)for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<860,hasTouch:width<860,reducedMotion:'reduce'}),page=await context.newPage();
  await page.route('https://**/*',r=>r.abort());
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href,{waitUntil:'load'});await waitForAppReady(page);
  await page.waitForFunction(()=>window.PlatePageInfoCards&&typeof goPage==='function');
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;document.head.insertAdjacentHTML('beforeend','<style>#auth-ov{display:none!important}</style>');
   isWorkspaceOwner=()=>true;canAccess=()=>true;sb=null;currentUser=null;orders=[];pitems=[];projects=[];batchReports=[];
   models=Array.from({length:200},(_,i)=>({id:`forest-${i}`,name:`Khay bàn phím khách yêu cầu tên dài số ${i}`,images:[],parts:[],variants:i%2?[{id:'v',name:'Biến thể dài kiểm thử'}]:[],cats:['QA']}));
   normalizeOperations();
  },theme);
  for(const route of routes){
   await page.evaluate(route=>route==='order-form'?openOrderForm():goPage(route,{historyMode:'none'}),route);
   await page.waitForTimeout(45);
   const metrics=await page.evaluate(()=>{
    const host=document.querySelector('.page.active'),canvas=getComputedStyle(document.body).backgroundColor;
    const info=host.querySelector('.page-info-card'),art=info?.querySelector('.page-info-art')?.getBoundingClientRect();
    const rgb=color=>color.match(/[\d.]+/g)?.slice(0,3).map(Number),lum=color=>rgb(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const probe=document.createElement('i');host.append(probe);
    const accents=['--ac','--pu','--gr'].map(token=>{probe.style.color=`var(${token})`;return getComputedStyle(probe).color;});probe.remove();
    const weakAccents=[...host.querySelectorAll('button,.of-p-qty-badge,.delivery-step-num,.order-filter-badge,.fulfillment-flow-step>span')].filter(el=>{
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(!r.width||!r.height||!el.textContent.trim()||!accents.includes(s.backgroundColor))return false;
     const a=lum(s.color),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5;
    }).map(el=>el.textContent.trim().slice(0,60));
    const clipped=[...host.querySelectorAll('.sect-hd button,.sect-hd select,.model-library-actions button')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left<-.5||r.right>innerWidth+.5);}).map(el=>el.textContent.trim());
    const overlaps=art&&[...info.querySelectorAll('h1,h2,p,.btn:not(.page-info-motion)')].some(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&r.left<art.right&&r.right>art.left&&r.top<art.bottom&&r.bottom>art.top;});
    let surface=host;while(surface.parentElement&&getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)')surface=surface.parentElement;
    return {canvas,page:getComputedStyle(surface).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1,clipped,weakAccents,artOverlaps:!!overlaps,hero:info?.getBoundingClientRect().height};
   });
   results.push({width,height,theme,route,...metrics});
   if(!baseline){
    const palette=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return ['--bg','--s','--ac','--pu','--am','--re','--bl'].map(t=>s.getPropertyValue(t).trim());});
    assert.equal(new Set(palette).size,palette.length,`${route}: surfaces and contextual accents stay distinct`);
    assert.equal(metrics.canvas,theme==='dark'?'rgb(21, 27, 29)':'rgb(243, 242, 237)',`${route}: approved neutral canvas`);
    assert.equal(metrics.canvas,metrics.page,`${route}: one continuous canvas`);
    assert.equal(metrics.overflow,false,`${width}/${theme}/${route}: horizontal overflow`);
    assert.deepEqual(metrics.clipped,[],`${width}/${theme}/${route}: toolbar actions reachable`);
    assert.deepEqual(metrics.weakAccents,[],`${width}/${theme}/${route}: accent controls and counters meet 4.5:1`);
    assert.equal(metrics.artOverlaps,false,`${width}/${theme}/${route}: art clear of content`);
   }
   if([390,1440].includes(width)&&['dashboard','models','fulfillment','sales'].includes(route)){await page.waitForTimeout(350);await page.screenshot({path:`${out}/${baseline?'before':'after'}-${width}-${theme}-${route}.png`});}
  }
  if(!baseline){
   if(width===1440)await compositedLabels(page,theme);
   await page.evaluate(()=>goPage('models',{historyMode:'none'}));await page.waitForTimeout(350);
   const search=page.locator('#model-smart-search');await search.evaluate(el=>window.qaForestInput=el);
   await search.fill('khay ban phim');
   assert.ok(await page.locator('#model-grid .model-card').count()>0,'Unaccented search still finds fixture models');
   assert.equal(await search.evaluate(el=>el===window.qaForestInput&&document.activeElement===el),true,'Search preserves DOM and focus');
   if(width<860)assert.ok(await search.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'Mobile input avoids Safari auto zoom');
   if(width<860)assert.ok(await page.locator('#model-sort').evaluate(el=>el.getBoundingClientRect().height>=44),'Library sort control has a 44px touch target');
   const primary=page.locator('#page-models .btn-ac').first();
   for(const state of ['normal','hover','focus','active','disabled']){
    if(state==='hover')await primary.hover();if(state==='focus')await primary.focus();
    if(state==='active'){await primary.evaluate(el=>el.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();},{capture:true,once:true}));await primary.hover();await page.mouse.down();}
    if(state==='disabled')await primary.evaluate(el=>el.disabled=true);
    const contrast=await primary.evaluate(el=>{
     const css=getComputedStyle(el),luminance=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
     const a=luminance(css.color),b=luminance(css.backgroundColor),r=el.getBoundingClientRect();return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),width:r.width,height:r.height};
    });
    assert.ok(contrast.ratio>=4.5,`${width}/${theme}/${state}: primary text contrast`);
    assert.ok(contrast.width>=44&&contrast.height>=44,`${width}/${theme}/${state}: primary touch target`);
    if(state==='active')await page.mouse.up();if(state==='disabled')await primary.evaluate(el=>el.disabled=false);
   }
   const camera=await page.locator('#cam-fab').evaluate(el=>{
    const r=el.getBoundingClientRect();if(!r.width||!r.height)return true;
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return el===hit||el.contains(hit);
   });assert.equal(camera,true,`${width}/${theme}: camera control remains reachable`);
  }
  await context.close();
 }
}finally{await browser.close();writeFileSync(`${out}/${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));if(!baseline)writeFileSync(`${out}/composited-contrast.json`,JSON.stringify(pixelChecks,null,2));}
console.log(`Forest ${baseline?'baseline':'QA PASS'}: ${results.length} route/viewport/theme checks`);
