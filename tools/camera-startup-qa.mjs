import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {waitForAppReady} from './app-ready-qa.mjs';
const out=resolve('qa-results/camera-startup');mkdirSync(out,{recursive:true});
const url=pathToFileURL(resolve('plate-studio.html')).href,user='qa-camera-start',workspace='qa-camera-workspace',key='ps_camera_start_v1:'+workspace+':'+user;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
async function create(width=390,height=844,query=''){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});await context.route(/^https?:/,route=>route.abort());
 // Installation has its own suite; business fixtures use a dismissed invitation.
 await context.addInitScript(()=>localStorage.setItem('ps_install_invite_v1',JSON.stringify({until:Date.now()+86400000})));
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url+query,{waitUntil:'domcontentloaded'});await waitForAppReady(page);return {context,page,errors};
}
async function seed(page,theme='dark'){
 await page.addStyleTag({content:'#auth-ov{display:none!important}'});
 await page.evaluate(({user,workspace,theme})=>{
  document.documentElement.dataset.theme=theme;currentUser={id:user};activeWorkspace={workspace_id:workspace,owner_user_id:user};cloudReady=true;loadingCloud=false;
  canCaptureBatchReports=()=>true;canAccess=()=>true;brMultiCameraShots=[];
  restoreBatchCameraQueue=async()=>0;drainBatchCameraQueue=async()=>{};
  uploadBatchMultiPhotoInBackground=async shot=>{shot.state='uploaded';};
 },{user,workspace,theme});
}
async function open(page){await page.evaluate(()=>openBatchReportHub());await page.waitForFunction(()=>document.querySelector('#br-multi-cam video')?.videoWidth>0);}
async function bootstrap(page,allowed=true){
 await page.evaluate(({user,workspace,allowed})=>{
  currentUser=null;activeWorkspace=null;cloudReady=false;loadingCloud=false;fastCaptureRouteOpened=false;
  canCaptureBatchReports=()=>allowed;canAccess=()=>allowed;
  ensureCloudWorkspace=async()=>{activeWorkspace={workspace_id:workspace,owner_user_id:user};};registerWorkspaceProfile=async()=>{};
  restoreBatchCameraQueue=async()=>0;drainBatchCameraQueue=async()=>{};
  loadCloudData=()=>{window.qaCloudAwaited=true;return new Promise(resolve=>{window.qaReleaseCloud=resolve;});};
  window.qaStartup=loadCloudSession({user:{id:user}});
 },{user,workspace,allowed});
 await page.waitForFunction(()=>window.qaCloudAwaited===true);
}
try{
 for(const [width,height] of [[320,568],[390,844],[640,360],[844,390],[1440,900]])for(const theme of ['light','dark']){
  const {context,page,errors}=await create(width,height);
  try{
   await seed(page,theme);await open(page);
   const toggle=page.getByRole('switch',{name:'Mở camera khi mở trang web'}),intro=page.locator('.br-camera-start-intro');
   assert.equal(await toggle.getAttribute('aria-checked'),'false','The feature is opt-in');assert.equal(await intro.isVisible(),true);
   assert.equal(await page.getByRole('button',{name:'Đóng camera',exact:true}).evaluate(el=>el===document.activeElement),true,'Introduction never steals camera focus');
   const geometry=await page.evaluate(()=>{
    const modal=document.getElementById('br-multi-cam'),intro=modal.querySelector('.br-camera-start-intro').getBoundingClientRect(),header=modal.querySelector('header').getBoundingClientRect(),console=modal.querySelector('.br-camera-console').getBoundingClientRect(),shot=modal.querySelector('.capture'),r=shot.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {intro:intro.toJSON(),header:header.toJSON(),console:console.toJSON(),captureClear:shot===hit||shot.contains(hit),overflow:modal.scrollWidth>innerWidth+1,controls:[...modal.querySelectorAll('#br-camera-start-toggle,.br-camera-start-intro button')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))};
   });
   assert.ok(geometry.captureClear&&!geometry.overflow,JSON.stringify(geometry));assert.ok(geometry.intro.top>=geometry.header.bottom&&geometry.intro.left>=0&&geometry.intro.right<=width&&geometry.intro.bottom<=height,JSON.stringify(geometry));
   assert.ok(geometry.intro.bottom<=geometry.console.top||geometry.intro.right<=geometry.console.left,'Intro stays away from the capture controls');
   assert.ok(geometry.controls.every(rect=>rect.width>=44&&rect.height>=44),'New controls retain touch targets');
   if([320,640,1440].includes(width))await page.screenshot({path:resolve(out,width+'-'+height+'-'+theme+'-intro.png')});
   await page.evaluate(()=>{window.qaVideo=document.querySelector('#br-multi-cam video');window.qaShutter=document.querySelector('#br-multi-cam .capture');window.qaShots=brMultiCameraShots;});
   await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'true');assert.equal(await intro.isVisible(),false);
   assert.equal(await page.evaluate(()=>qaVideo===document.querySelector('#br-multi-cam video')&&qaShutter===document.querySelector('#br-multi-cam .capture')&&qaShots===brMultiCameraShots),true,'Changing the option preserves video, shutter and captured data');
   assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),{version:1,enabled:true,introSeen:true});
   await toggle.focus();await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-checked'),'false','Space toggles the focused switch');
   await page.keyboard.press('Enter');assert.equal(await toggle.getAttribute('aria-checked'),'true','Enter toggles the focused switch');
   await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-checked'),'false');
   if(width===390&&theme==='dark'){
    await page.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('QA quota','QuotaExceededError');};});
    await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.match(await intro.textContent(),/Chưa lưu được/);
    assert.equal(await page.evaluate(()=>qaVideo===document.querySelector('#br-multi-cam video')&&qaShots===brMultiCameraShots),true);
    await page.screenshot({path:resolve(out,'quota-error.png')});await page.evaluate(()=>{Storage.prototype.setItem=qaSetItem;});
    await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'true');
   }
   if(width===1440&&theme==='dark'){
    await page.evaluate(()=>{activeWorkspace.workspace_id='another-workspace';toggleBatchCameraStartup();});
    assert.equal(await page.evaluate(()=>localStorage.getItem('ps_camera_start_v1:another-workspace:qa-camera-start')),null,'A stale camera cannot write the new workspace preference');
    assert.equal(await toggle.isDisabled(),true);await page.evaluate(workspace=>{activeWorkspace.workspace_id=workspace;syncBatchCameraStartupControl();},workspace);
   }
   await page.getByRole('button',{name:'Đóng camera',exact:true}).click();assert.deepEqual(errors,[]);
   console.log('PASS camera startup UI '+width+'x'+height+'/'+theme+': opt-in, introduction, 44px, capture/focus/DOM, durable toggle and scope');
  }finally{await context.close();}
 }
 {
  const {context,page,errors}=await create();
  try{
   await seed(page);await open(page);
   await page.getByRole('button',{name:'Đóng giới thiệu camera'}).click();assert.equal(await page.getByRole('switch').evaluate(el=>el===document.activeElement),true);
   await page.getByRole('button',{name:'Đóng camera',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});await waitForAppReady(page);await seed(page);await open(page);
   assert.equal(await page.locator('.br-camera-start-intro').isVisible(),false,'Dismissed introduction remains dismissed after a real reload');
   await page.getByRole('switch').click();await page.getByRole('button',{name:'Đóng camera',exact:true}).click();
   await page.reload({waitUntil:'domcontentloaded'});await waitForAppReady(page);await seed(page);await bootstrap(page);
   await page.waitForFunction(()=>document.querySelector('#br-multi-cam video')?.videoWidth>0);
   assert.equal(await page.evaluate(()=>loadingCloud&&!cloudReady&&fastCaptureRouteOpened),true,'Enabled startup opens before an indefinitely held cloud load');
   assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'true');assert.equal(await page.locator('.br-camera-start-intro').isVisible(),false);
   await page.getByRole('switch').click();await page.getByRole('button',{name:'Đóng camera',exact:true}).click();
   await page.evaluate(()=>{dispatchEvent(new Event('focus'));void loadCloudSession({user:{id:'qa-camera-start'}});});await page.waitForTimeout(120);
   assert.equal(await page.locator('#br-multi-cam').count(),0,'Closing camera is not undone by another session callback');
   await page.reload({waitUntil:'domcontentloaded'});await waitForAppReady(page);await seed(page);await bootstrap(page);await page.waitForTimeout(120);
   assert.equal(await page.locator('#br-multi-cam').count(),0,'Disabled startup survives reload');assert.deepEqual(errors,[]);
   console.log('PASS camera startup: real reload, one-time intro, opt-out, fast entry before cloud and no reopen');
  }finally{await context.close();}
 }
 for(const [query,enabled,allowed,expected] of [['',true,false,false],['',false,true,false],['?capture=1',false,true,true]]){
  const {context,page,errors}=await create(390,844,query);
  try{
   await seed(page);await page.evaluate(enabled=>saveBatchCameraStartupPreference(batchCameraStartupScope(),{enabled,introSeen:true}),enabled);await bootstrap(page,allowed);
   if(expected)await page.waitForFunction(()=>document.querySelector('#br-multi-cam video')?.videoWidth>0);else await page.waitForTimeout(120);
   assert.equal(await page.locator('#br-multi-cam').count(),expected?1:0);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 {
  const {context,page,errors}=await create();
  try{
   await seed(page);await page.evaluate(()=>{saveBatchCameraStartupPreference(batchCameraStartupScope(),{enabled:true,introSeen:true});activeWorkspace.workspace_id='another-workspace';window.qaOtherWorkspace=shouldAutoOpenBatchCamera();activeWorkspace.workspace_id='qa-camera-workspace';currentUser={id:'another-user'};window.qaOtherUser=shouldAutoOpenBatchCamera();});
   assert.deepEqual(await page.evaluate(()=>[qaOtherWorkspace,qaOtherUser]),[false,false]);assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 console.log('PASS camera startup policy: permission, default off, explicit capture route and workspace/user isolation');
}finally{await browser.close();}
