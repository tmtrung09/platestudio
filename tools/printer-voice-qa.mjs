import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {waitForAppReady} from './app-ready-qa.mjs';
const existing=readFileSync('tools/printer-ui-qa.mjs','utf8');
const start=existing.indexOf('async function seed('),end=existing.indexOf('try{for(const profile',start);
assert.ok(start>=0&&end>start,'Reuse the printer UI isolated fixture');
const baseSeed=Function('return '+existing.slice(start,end).trim())();
async function seed(page,...args){await baseSeed(page,...args);await page.evaluate(()=>{
 const upstream=fetch;window.voiceRequests=0;
 window.fetch=async(url,options)=>{
  if(String(url).includes('/printer-voice/enya-preview.wav'))return new Response('Thông báo minh họa: Enya. Đây là bản nghe thử đã duyệt.',{headers:{'Content-Type':'audio/wav'}});
  if(!String(url).includes('/printer-voice'))return upstream(url,options);
  voiceRequests++;
  if(tts.fetchFail)return new Response(JSON.stringify({error:'Dịch vụ Enya tạm thời chưa sẵn sàng.'}),{status:503,headers:{'Content-Type':'application/json'}});
  if(tts.hold)await new Promise((resolve,reject)=>{tts.release=resolve;options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
  const body=JSON.parse(options.body),event=body.mode==='preview'?{type:'preview'}:PlatePrinterMonitor.events().find(event=>event.id===body.eventId),device=pmFixture.state.devices[event?.printerId];
  const text=PlatePrinterVoicePolicy.textFor({event,issues:device?.issues||[],name:body.name});
  return new Response(text,{headers:{'Content-Type':'audio/wav'}});
 };
});}
const out=resolve('qa-results/printer-voice');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
async function mock(page,{unsupported=false}={}){
 await page.addInitScript(({unsupported})=>{
  window.tts={calls:[],cancels:0,chimes:0,speaking:false,blobs:new Map(),sequence:[]};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{get speaking(){return tts.speaking;},speak(){throw Error('Rejected system voice must never be used');}}});
  URL.createObjectURL=blob=>{const key='blob:qa-'+tts.blobs.size;tts.blobs.set(key,blob);return key;};URL.revokeObjectURL=()=>{};
  window.Audio=unsupported?undefined:class {
   constructor(src){this.src=src;this.stopped=false;}
   async play(){
    if(tts.block)throw new DOMException('Autoplay blocked','NotAllowedError');
    if(this.src.includes('boarding-chime.wav')){
     tts.chimes++;tts.sequence.push({kind:'chime',at:performance.now()});tts.item=this;this.onplaying?.();
     tts.endChime=()=>{if(!this.stopped)this.onended?.();};
     if(tts.introError){this.onerror?.();throw new DOMException('Missing cue','NotSupportedError');}
     if(!tts.holdChime)queueMicrotask(tts.endChime);return;
    }
    const text=tts.blobs.has(this.src)?await tts.blobs.get(this.src).text():'Thông báo minh họa: Enya';
    if(this.stopped)return;tts.item=this;tts.speaking=true;tts.calls.push(text);tts.sequence.push({kind:'voice',at:performance.now()});this.onplaying?.();
   }
   pause(){this.stopped=true;tts.cancels++;tts.speaking=false;}
   removeAttribute(){this.src='';}load(){}
  };
  tts.finish=()=>{tts.speaking=false;tts.item?.onended?.();};
 },{unsupported});
}
let serial=2000;
async function send(page,type,{id='machine-0',phase,issues,runId}={}){
 await page.evaluate(({type,id,phase,issues,runId,serial})=>{
  const d=pmFixture.state.devices[id],at=new Date().toISOString();
  d.phase=phase||({printer_finished:'FINISH',printer_resumed:'RUNNING',printer_started:'RUNNING',printer_paused:'PAUSE',printer_failed:'FAILED'}[type]);
  d.lastReport=at;d.online=true;d.issues=issues||[];
  d.run={...d.run,id:runId||d.run.id,result:type==='printer_finished'?'finished':type==='printer_failed'?'failed':'running'};
  const event={id:'voice-'+serial,type,deviceId:id,jobKey:d.run.id,title:d.name+' · Trạng thái',createdAt:at};
  PlatePrinterMonitor.receive({...pmFixture,events:[{seq:serial,data:event}]});
 },{type,id,phase,issues,runId,serial:serial++});
}
async function open(page){await page.evaluate(()=>openSystemNotifications());return page.locator('[data-printer-voice-settings]');}
const alert=page=>page.getByRole('alertdialog');
const calls=page=>page.evaluate(()=>tts.calls);
const fault={severity:'error',code:'03004006',original:'The nozzle is clogged.',text:'Đầu phun bị tắc.'};
try{
 for(const width of [320,640,1280])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:width===640?360:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await context.route(/^https?:/,route=>route.abort());await mock(page);
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href);await waitForAppReady(page);await seed(page,theme);
  const settings=await open(page);
  assert.equal(await settings.isVisible(),true);assert.equal(await settings.locator('[data-voice-toggle]').getAttribute('aria-pressed'),'false');
  await settings.locator('[data-voice-toggle]').click();await page.waitForFunction(()=>tts.calls.length===1);assert.match((await calls(page)).at(-1),/Enya/);
  assert.equal(await page.evaluate(()=>tts.chimes),1);assert.ok(await page.evaluate(()=>tts.sequence[1].at-tts.sequence[0].at>=170),'The cue and short gap precede Enya');
  await page.evaluate(()=>tts.finish());
  await settings.locator('[data-voice-test]').click();await page.waitForFunction(()=>tts.calls.length===2);assert.match((await calls(page)).at(-1),/^Thông báo minh họa[.:]/);
  assert.ok(await settings.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&[...el.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)),'Settings fit and have touch targets');
  await page.screenshot({path:resolve(out,`${width}-${theme}-settings.png`)});
  await page.locator('.notification-sound').scrollIntoViewIfNeeded();assert.equal(await page.locator('.notification-sound').isVisible(),true,'Existing sound controls remain reachable in a short viewport');
  await page.evaluate(()=>{tts.finish();closeSystemNotifications(false);});
  await send(page,'printer_finished');await alert(page).waitFor();await page.waitForFunction(()=>tts.calls.length===3);
  assert.match((await calls(page)).at(-1),/Mỹ Mỹ.*đã in xong/);assert.doesNotMatch((await calls(page)).at(-1),/Flower_Coasters|QC đạt|03004006/);
  assert.ok(await alert(page).evaluate(el=>el.scrollWidth<=el.clientWidth+1&&[...el.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)),'Spoken alert stays responsive');
  await page.screenshot({path:resolve(out,`${width}-${theme}-alert.png`)});
  assert.ok(await page.evaluate(()=>{const node=document.querySelector('.printer-voice-alert small').firstChild;PlatePrinterMonitor.render();return node===document.querySelector('.printer-voice-alert small').firstChild;}),'Telemetry does not repeat unchanged live-region text');
  if(width===1280&&theme==='light'){
   await send(page,'printer_finished',{id:'machine-1'});await page.waitForTimeout(150);assert.equal((await calls(page)).length,3,'Queued notice cannot interrupt current speech');
   await alert(page).getByRole('button',{name:'Đã biết',exact:true}).click();await page.waitForFunction(()=>tts.calls.length===4);
   assert.match((await calls(page)).at(-1),/Máy 1 đã in xong/);assert.ok(await page.evaluate(()=>tts.cancels>=1),'Acknowledgment stops old speech before next notice');
   await send(page,'printer_resumed',{id:'machine-1'});await alert(page).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false,'Resume cancels obsolete speech');
   await send(page,'printer_paused',{issues:[{severity:'warning',code:'warn'}]});await page.waitForTimeout(150);assert.equal((await calls(page)).length,4,'Manual pause and warning stay silent');
   await send(page,'printer_resumed');await send(page,'printer_paused',{issues:[fault]});await alert(page).waitFor();await page.waitForFunction(()=>tts.calls.length===5);assert.match((await calls(page)).at(-1),/Đầu phun bị tắc/);
   await page.evaluate(()=>{pmFixture.state.devices['machine-0'].issues=[{severity:'error',code:'unknown',text:'Có thể đầu phun bị tắc.',original:'The nozzle might be clogged.'}];PlatePrinterMonitor.receive({...pmFixture,events:[]});});
   assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false,'Updated cause stops outdated description');
   const priorCauseCount=(await calls(page)).length;await alert(page).getByRole('button',{name:'Đọc lại',exact:true}).click();await page.waitForFunction(n=>tts.calls.length>n,priorCauseCount);assert.doesNotMatch((await calls(page)).at(-1),/Đầu phun bị tắc/,'Uncertain cause cannot be spoken as fact');
   await page.keyboard.press('Escape');await alert(page).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false);
   // A blocked utterance must be retryable and must not count as heard.
   await page.evaluate(()=>tts.block=true);await send(page,'printer_finished',{id:'machine-2'});await alert(page).waitFor();await page.waitForFunction(()=>document.querySelector('.printer-voice-alert small')?.textContent.includes('Trình duyệt'));
   await page.evaluate(()=>tts.block=false);await alert(page).getByRole('button',{name:'Đọc thông báo',exact:true}).click();await page.waitForFunction(()=>tts.speaking);assert.equal(await page.evaluate(()=>speechSynthesis.speaking),true);await page.evaluate(()=>tts.finish());
   const before=(await calls(page)).length;
   // Re-present the same current event after reload, without acknowledging it.
   await page.reload();await waitForAppReady(page);await seed(page,theme,{'machine-2':{phase:'FINISH',run:{result:'finished'}}});await alert(page).waitFor();
   await page.mouse.click(1,1);await page.waitForTimeout(100);assert.equal((await calls(page)).length,0,'Reload retains the already-spoken transition');
   assert.equal(await (await open(page)).count(),1); // programmatic opening does not acknowledge the modal
   await page.keyboard.press('Escape');await alert(page).waitFor({state:'detached'});await page.evaluate(()=>closeSystemNotifications(false));
   assert.ok(before>=7);
   // New job is a new eligible announcement; permission removal cancels immediately.
   await send(page,'printer_finished',{id:'machine-2',runId:'voice-new-run'});await alert(page).waitFor();await page.waitForFunction(()=>speechSynthesis.speaking);
   await page.evaluate(()=>{canAccess=()=>false;PlatePrinterMonitor.render();});await alert(page).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false);
  }else{await page.keyboard.press('Escape');await alert(page).waitFor({state:'detached'});assert.doesNotMatch(await (await open(page)).textContent(),/Đang đọc thông báo/,'Closing clears the speech status');}
  assert.deepEqual(errors,[]);await context.close();
 }
 for(const kind of ['loading','network','intro','unsupported','gesture','scope']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await context.route(/^https?:/,route=>route.abort());await mock(page,{unsupported:kind==='unsupported'});
  await page.goto(pathToFileURL(resolve('plate-studio.html')).href);await waitForAppReady(page);await seed(page,'light');const settings=await open(page);
  if(kind==='unsupported')assert.equal(await settings.locator('[data-voice-toggle]').isDisabled(),true);
  else if(kind==='gesture'||kind==='scope'){
   await page.evaluate(()=>{const key='ps_printer_voice_v1_'+encodeURIComponent('11111111-1111-4111-8111-111111111111:qa-user');localStorage.setItem(key,'1');window.dispatchEvent(new StorageEvent('storage',{key}));closeSystemNotifications(false);});
   await send(page,'printer_finished');await alert(page).waitFor();assert.equal((await calls(page)).length,0,'A stored preference cannot bypass browser activation');
   await alert(page).getByRole('button',{name:'Đọc thông báo',exact:true}).click();await page.waitForFunction(()=>tts.calls.length===1&&tts.speaking);assert.equal((await calls(page)).length,1,'A manual tap reads exactly once');assert.equal(await page.evaluate(()=>speechSynthesis.speaking),true);
   if(kind==='scope'){
    await page.evaluate(()=>{activeWorkspace.workspace_id='22222222-2222-4222-8222-222222222222';PlatePrinterMonitor.render();});await alert(page).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false,'Changing workspace cancels old speech');
   }else{
    await page.evaluate(()=>{const key='ps_printer_voice_v1_'+encodeURIComponent('11111111-1111-4111-8111-111111111111:qa-user');localStorage.setItem(key,'0');window.dispatchEvent(new StorageEvent('storage',{key}));});assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false,'Turning voice off in another tab cancels current speech');
    assert.equal(await alert(page).isVisible(),true,'Muting voice does not acknowledge the notice');
   }
  }else if(kind==='network'){
   await settings.locator('[data-voice-toggle]').click();await page.waitForFunction(()=>tts.speaking);await page.evaluate(()=>{tts.finish();tts.fetchFail=true;});
   await settings.locator('[data-voice-test]').click();await page.waitForFunction(()=>tts.calls.length===2);
   assert.match(await settings.locator('[data-voice-status]').innerText(),/bản mẫu Enya đã lưu/,'Preview fallback is the approved recording and identifies the service error');
   await page.evaluate(()=>{tts.finish();closeSystemNotifications(false);});await send(page,'printer_paused',{issues:[fault]});await alert(page).waitFor();
   await alert(page).getByText('Dịch vụ Enya tạm thời chưa sẵn sàng.',{exact:true}).waitFor();assert.equal((await calls(page)).length,2,'Provider failure cannot substitute system speech or acknowledge the alert');
   await page.evaluate(()=>tts.fetchFail=false);await alert(page).getByRole('button',{name:'Đọc thông báo',exact:true}).click();await page.waitForFunction(()=>tts.speaking&&tts.calls.length===3);
  }else if(kind==='intro'){
   await settings.locator('[data-voice-toggle]').click();await page.waitForFunction(()=>tts.speaking);await page.evaluate(()=>{tts.finish();tts.holdChime=true;closeSystemNotifications(false);});
   await send(page,'printer_finished');await alert(page).waitFor();await page.waitForFunction(()=>tts.chimes===2);
   assert.equal((await calls(page)).length,1,'Intro alone cannot count as voice');
   assert.equal(await alert(page).getByRole('button',{name:'Dừng đọc',exact:true}).isVisible(),true);
   await page.evaluate(()=>{window.lateChimeEnd=tts.item.onended;});await page.keyboard.press('Escape');await alert(page).waitFor({state:'detached'});await page.evaluate(()=>lateChimeEnd());await page.waitForTimeout(250);assert.equal((await calls(page)).length,1,'A dismissed intro cannot start late speech');
   const remembered=await page.evaluate(()=>JSON.parse(localStorage.getItem('ps_printer_voice_v1_'+encodeURIComponent('11111111-1111-4111-8111-111111111111:qa-user')+':spoken')||'[]'));assert.equal(remembered.length,0,'Chime does not mark the announcement heard');
   await page.evaluate(()=>{tts.holdChime=false;tts.introError=true;});await send(page,'printer_finished',{runId:'chime-fallback-run'});await alert(page).waitFor();await page.waitForFunction(()=>tts.calls.length===2);assert.equal(await page.evaluate(()=>tts.speaking),true,'Missing cue file cannot suppress the prepared Enya voice');
   await page.keyboard.press('Escape');await alert(page).waitFor({state:'detached'});await page.evaluate(()=>{tts.introError=false;tts.holdChime=true;});await send(page,'printer_finished',{runId:'chime-resume-run'});await alert(page).waitFor();await page.waitForFunction(()=>tts.chimes===4);
   await send(page,'printer_resumed');await alert(page).waitFor({state:'detached'});await page.evaluate(()=>tts.endChime());await page.waitForTimeout(250);assert.equal((await calls(page)).length,2,'Machine resume cancels both intro and queued voice');
   await send(page,'printer_finished',{runId:'chime-gap-run'});await alert(page).waitFor();await page.waitForFunction(()=>tts.chimes===5);
   await page.evaluate(()=>{tts.endChime();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(250);assert.equal((await calls(page)).length,2,'Hiding during the gap cancels the scheduled voice');
  }else{
   await settings.locator('[data-voice-toggle]').click();await page.waitForFunction(()=>tts.speaking);await page.evaluate(()=>{tts.finish();tts.hold=true;closeSystemNotifications(false);});
   const chimesBefore=await page.evaluate(()=>tts.chimes);
   await send(page,'printer_paused',{issues:[fault]});await alert(page).waitFor();await page.waitForFunction(()=>!!tts.release);
   assert.equal(await page.evaluate(()=>tts.chimes),chimesBefore,'No chime while the actual sentence is still loading');
   const count=(await calls(page)).length;await send(page,'printer_resumed');await alert(page).waitFor({state:'detached'});await page.evaluate(()=>tts.release());await page.waitForTimeout(100);assert.equal((await calls(page)).length,count,'A late audio response cannot speak an obsolete notice');
   await page.evaluate(()=>{tts.hold=false;});await send(page,'printer_finished');await alert(page).waitFor();await page.waitForFunction(()=>speechSynthesis.speaking);
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false,'Hidden page cancels speech');
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
   await alert(page).getByRole('button',{name:'Đọc lại',exact:true}).click();await page.waitForFunction(()=>tts.speaking);assert.equal(await page.evaluate(()=>speechSynthesis.speaking),true,'Returning to the page retains manual replay of a valid notice');
  }
  await context.close();
 }
 console.log('PASS printer voice: 6 layouts/themes; chime then pause then Enya; cancellation during intro/gap/voice; missing cue fallback; queue, causes, retry, reload, slow audio and permissions. Playback mocked; real media verified by printer-chime-qa.');
}finally{await browser.close();}
