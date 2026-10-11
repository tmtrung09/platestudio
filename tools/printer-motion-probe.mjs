import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export async function assertPrinterMotion(page,profile,theme,out){
 await page.emulateMedia({reducedMotion:'no-preference'});
 const opening=await page.evaluate(()=>{
  const layout=document.querySelector('.pm-content'),slot=document.querySelector('.pm-detail-slot'),panel=document.querySelector('.pm-detail'),list=document.querySelector('.pm-list');
  window.pmMotionKept={panel,image:document.querySelector('.pm-detail-image'),card:document.querySelector('.pm-machine'),input:document.querySelector('.pm-toolbar input'),operations:JSON.stringify(operations)};
  const before=list.getBoundingClientRect().width;
  document.querySelector('[data-device="machine-0"][data-pm-action="machine"]').click();
  const animations=layout.getAnimations({subtree:true}).filter(a=>[layout,slot,panel].includes(a.effect.target));
  window.pmMotionAnimations=animations;
  const sample=t=>{animations.forEach(a=>{a.pause();a.currentTime=t;});return {width:list.getBoundingClientRect().width,height:slot.getBoundingClientRect().height};};
  const start=sample(0),middle=sample(120),end=sample(330);
  animations.forEach(a=>{a.currentTime=80;a.play();});
  return {before,start,middle,end,properties:animations.map(a=>a.transitionProperty),inert:panel.inert};
 });
 assert.equal(opening.inert,false,'Expanding detail remains keyboard accessible');
 assert.ok(opening.properties.includes(profile.width>=1100?'grid-template-columns':'grid-template-rows'),'Actual layout tracks animate, not only a cosmetic fade');
 if(profile.width>=1100)assert.ok(opening.start.width>opening.middle.width&&opening.middle.width>opening.end.width,'Desktop list genuinely contracts through intermediate widths');
 else assert.ok(opening.start.height<opening.middle.height&&opening.middle.height<opening.end.height,'Mobile detail genuinely expands through intermediate heights');
 assert.ok(await page.evaluate(()=>{
  const before=[...pmMotionAnimations];pmFixture.state.devices['machine-0'].percent=47;PlatePrinterMonitor.receive({...pmFixture,events:[]});
  return before.every(a=>a.playState==='running')&&pmMotionKept.panel===document.querySelector('.pm-detail')&&pmMotionKept.image===document.querySelector('.pm-detail-image')&&pmMotionKept.card===document.querySelector('.pm-machine')&&pmMotionKept.input===document.querySelector('.pm-toolbar input');
 }),'Telemetry preserves running motion, DOM, focus controls and image frames');
 await page.waitForTimeout(400);
 await page.screenshot({path:resolve(out,`${profile.width}-${profile.height}-${theme}-motion-open.png`)});
 const closing=await page.evaluate(()=>{
  const layout=document.querySelector('.pm-content'),slot=document.querySelector('.pm-detail-slot'),panel=document.querySelector('.pm-detail'),list=document.querySelector('.pm-list');
  panel.querySelector('[data-pm-action="close-detail"]').click();
  const animations=layout.getAnimations({subtree:true}).filter(a=>[layout,slot,panel].includes(a.effect.target));
  const sample=t=>{animations.forEach(a=>{a.pause();a.currentTime=t;});return {width:list.getBoundingClientRect().width,height:slot.getBoundingClientRect().height};};
  const start=sample(0),middle=sample(120),end=sample(330);
  animations.forEach(a=>{a.currentTime=0;a.play();});
  const inaccessible=panel.inert&&panel.getAttribute('aria-hidden')==='true';
  PlatePrinterMonitor.receive({...pmFixture,events:[]});
  return {start,middle,end,inaccessible,retained:!panel.hidden,animationsAlive:animations.every(a=>a.playState==='running')};
 });
 assert.equal(closing.inaccessible,true,'Collapsing detail leaves Tab order immediately');
 assert.equal(closing.retained,true,'Panel stays mounted during collapse');
 assert.equal(closing.animationsAlive,true,'Background updates do not interrupt collapse');
 if(profile.width>=1100)assert.ok(closing.start.width<closing.middle.width&&closing.middle.width<closing.end.width,'Desktop list genuinely expands back');
 else assert.ok(closing.start.height>closing.middle.height&&closing.middle.height>closing.end.height,'Mobile detail genuinely collapses');
 await page.waitForTimeout(400);assert.equal(await page.locator('.pm-detail').isVisible(),false);
 await page.evaluate(()=>{
  const open=document.querySelector('[data-device="machine-0"][data-pm-action="machine"]');
  open.click();document.querySelector('[data-pm-action="close-detail"]').click();open.click();
 });
 await page.waitForTimeout(400);
 assert.ok(await page.locator('.pm-detail').evaluate(el=>!el.hidden&&!el.inert&&el.getAttribute('aria-hidden')==='false'),'Rapid open/close/open cancels stale close timer');
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 assert.ok(await page.evaluate(()=>document.activeElement===document.querySelector('[data-device="machine-0"][data-pm-action="machine"]')),'Animated Escape returns focus');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.ok(await page.evaluate(()=>{
  document.querySelector('[data-device="machine-0"][data-pm-action="machine"]').click();
  const layout=document.querySelector('.pm-content'),panel=document.querySelector('.pm-detail');
  const opened=!panel.hidden&&layout.getAnimations({subtree:true}).length===0;
  panel.querySelector('[data-pm-action="close-detail"]').click();
  return opened&&panel.hidden&&layout.getAnimations({subtree:true}).length===0;
 }),'Reduced motion applies final layout immediately with no animations');
 await page.emulateMedia({reducedMotion:'no-preference'});
 assert.ok(await page.evaluate(()=>{
  document.querySelector('[data-device="machine-0"][data-pm-action="machine"]').click();
  const allowed=canAccess;canAccess=()=>false;PlatePrinterMonitor.render();
  const hidden=document.querySelector('.pm-detail').hidden;canAccess=allowed;PlatePrinterMonitor.render();
  return hidden&&JSON.stringify(operations)===pmMotionKept.operations;
 }),'Permission loss hides detail immediately; motion never writes business data');
 await page.evaluate(()=>{
  document.querySelector('[data-device="machine-0"][data-pm-action="machine"]').click();
  document.querySelector('[data-pm-action="close-detail"]').click();
  const body=document.querySelector('.pg-content');window.pmMotionScrollTo=body.scrollTo;
  window.pmMotionScrollCalls=0;body.scrollTo=()=>pmMotionScrollCalls++;curPage='dashboard';
 });
 await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>{
  const calls=pmMotionScrollCalls;document.querySelector('.pg-content').scrollTo=pmMotionScrollTo;
  curPage='printer-monitor';PlatePrinterMonitor.render();return calls;
 }),0,'A completed collapse never scrolls a different page');
 await page.emulateMedia({reducedMotion:'reduce'});
 console.log(`PASS printer motion ${profile.width}/${theme}: intermediate geometry, reverse, rapid clicks, telemetry, focus, reduced motion and permissions`);
}
