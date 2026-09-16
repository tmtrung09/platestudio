/** Unified camera regression. Fake camera, isolated browser, no cloud writes. */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const output=join(root,'qa-results','camera');mkdirSync(output,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p=>p&&existsSync(p));
const source=readFileSync(join(root,'plate-studio.html'),'utf8');
for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(match[1]);
const browser=await chromium.launch({executablePath,headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 // Nothing in this suite can send a report to a real server.
 await page.route(/https?:.*\/(rest|storage|functions)\/v1\//,route=>route.abort());
 await page.goto(pathToFileURL(join(root,'plate-studio.html')).href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof openBatchMultiCamera==='function');
 await page.addStyleTag({content:'#auth-ov{display:none!important}'});
 await page.evaluate(()=>{
   canCaptureBatchReports=()=>true;
   window.realCameraUploader=uploadBatchMultiPhotoInBackground;
   window.realGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   window.cameraUploads=[];
   uploadBatchMultiPhotoInBackground=async shot=>{cameraUploads.push(shot.file.name);shot.state='uploaded';shot.reportId=shot.id;};
 });
 await page.evaluate(()=>openBatchReportHub());
 await page.waitForFunction(()=>document.querySelector('#br-multi-cam video')?.videoWidth>0);
 assert.notEqual(await page.locator('#ov-batch-report').evaluate(el=>getComputedStyle(el).display),'flex','Entry opens camera directly, not the old picker');
 assert.equal(await page.locator('#br-multi-cam .capture').count(),1);
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
   await page.setViewportSize({width,height});
   for(const theme of ['light','dark']){
     await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
     const errors=await page.evaluate(()=>{
       const el=document.getElementById('br-multi-cam'),errors=[];
       if(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)errors.push('Camera overflow');
       for(const b of el.querySelectorAll('button')){
         if(!b.getClientRects().length)continue;
         const r=b.getBoundingClientRect();
         if(r.width<44||r.height<44||r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)errors.push('Unreachable control '+b.getAttribute('aria-label'));
       }
       if(getComputedStyle(el.querySelector('video')).objectFit!=='contain')errors.push('Cropped capture preview');
       for(const glass of el.querySelectorAll('.br-camera-glass')){
         const style=getComputedStyle(glass);
         if(style.backgroundColor!=='rgba(0, 0, 0, 0)'||!style.backdropFilter.includes('blur(18px)'))errors.push('Opaque glass');
       }
       const ring=getComputedStyle(el.querySelector('.br-camera-shutter'),'::before');
       if(ring.animationName!=='brShutterLight'||ring.pointerEvents!=='none')errors.push('Shutter ring');
       return errors;
     });
     assert.deepEqual(errors,[],width+'/'+theme);
     if(width===390||width===1440)await page.screenshot({path:join(output,width+'-'+theme+'.png')});
   }
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.br-multi-cam .capture').click();
 await page.waitForFunction(()=>brMultiCameraShots.length===1&&brMultiCameraShots[0].state==='uploaded');
 await page.locator('.br-multi-cam .capture').click();
 await page.waitForFunction(()=>brMultiCameraShots.length===2&&brMultiCameraShots.every(s=>s.state==='uploaded'));
 assert.equal(await page.evaluate(()=>brMultiCameraShots.every(s=>s.file===null)),true,'Release original files after saved');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=','base64');
 const chooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Chọn ảnh từ thư viện',exact:true}).click();
 await (await chooser).setFiles([{name:'library-1.png',mimeType:'image/png',buffer:png},{name:'library-2.png',mimeType:'image/png',buffer:png}]);
 await page.waitForFunction(()=>brMultiCameraShots.length===4&&brMultiCameraShots.every(s=>s.state==='uploaded'));
 await page.screenshot({path:join(output,'saved.png')});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.br-camera-shutter').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByRole('button',{name:'Đóng camera',exact:true}).focus();
 await page.keyboard.press('Shift+Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Xong','Trap keyboard focus');
 const oldTrack=await page.evaluate(()=>{window.oldCameraTrack=brMultiCameraStream.getVideoTracks()[0];return oldCameraTrack.readyState;});
 assert.equal(oldTrack,'live');
 await page.getByRole('button',{name:'Đổi camera',exact:true}).click();
 await page.waitForFunction(()=>brMultiCameraStream?.getVideoTracks()[0]!==oldCameraTrack&&document.querySelector('#br-multi-cam')?.dataset.camera==='live');
 assert.equal(await page.evaluate(()=>oldCameraTrack.readyState),'ended');
 await page.evaluate(()=>closeBatchMultiCamera());
 assert.equal(await page.locator('#br-multi-cam').count(),0);
 assert.equal(await page.evaluate(()=>document.getElementById('ov-batch-report').inert),false);
 // Late permission resolution must stop its stream after the dialog has closed.
 await page.evaluate(()=>{
   navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.resolveCamera=resolve);
   void openBatchReportHub();
 });
 await page.getByRole('button',{name:'Đóng camera',exact:true}).click();
 await page.evaluate(()=>{window.stoppedLate=false;resolveCamera({getTracks:()=>[{stop:()=>stoppedLate=true}]});});
 await page.waitForFunction(()=>stoppedLate);
 // Permission denial retains native capture, library and retry in the same dialog.
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new Error('denied');};return openBatchReportHub();});
 assert.equal(await page.locator('#br-multi-cam').getAttribute('data-camera'),'fallback');
 const nativeChooser=page.waitForEvent('filechooser');
 await page.locator('.br-multi-cam .capture').click();
 await (await nativeChooser).setFiles({name:'native.png',mimeType:'image/png',buffer:png});
 await page.waitForFunction(()=>brMultiCameraShots.length===1&&brMultiCameraShots[0].state==='uploaded');
 // Slow upload blocks closing; failed uploads stay retryable, never show saved.
 await page.evaluate(()=>{
   uploadBatchMultiPhotoInBackground=shot=>new Promise(resolve=>window.finishCameraUpload=()=>{shot.state='error';resolve();});
   queueBatchCameraFiles([new File(['x'],'retry.jpg',{type:'image/jpeg'})]);
 });
 await page.waitForFunction(()=>typeof finishCameraUpload==='function');
 assert.equal(await page.evaluate(()=>closeBatchMultiCamera()),false);
 assert.equal(await page.locator('.br-multi-cam-count').getAttribute('data-state'),'busy');
 await page.evaluate(()=>finishCameraUpload());
 await page.waitForFunction(()=>document.querySelector('.br-multi-cam-count').dataset.state==='error');
 assert.equal(await page.evaluate(()=>brMultiCameraShots.at(-1).file instanceof File),true);
 page.once('dialog',d=>d.dismiss());
 await page.getByRole('button',{name:'Đóng camera',exact:true}).click();
 assert.equal(await page.locator('#br-multi-cam').count(),1);
 await page.evaluate(()=>{uploadBatchMultiPhotoInBackground=async shot=>{shot.state='uploaded';};});
 await page.getByRole('button',{name:'Thử lưu lại ảnh 2',exact:true}).click();
 await page.waitForFunction(()=>brMultiCameraShots.every(s=>s.state==='uploaded'));
 await page.evaluate(()=>closeBatchMultiCamera());
 // Exercise the real upload handler with stubbed storage/DB contracts.
 const result=await page.evaluate(async()=>{
   currentUser={id:'camera-qa'};cloudReady=true;
   batchImageHash=async()=> 'qa-hash';findLocalBatchReportByHash=()=>null;
   ensureBatchActor=()=>({name:'QA'});batchReportTimingForFile=async()=>({});
   reserveBatchReportImage=async()=>null;releaseReservedBatchReport=async()=>true;
   uploadBatchReportMedia=async()=>{throw new Error('network unavailable');};
   const shot={id:'qa-shot',file:new File(['x'],'test.jpg'),state:'uploading'};
   await realCameraUploader(shot);
   const failed=shot.state==='error'&&!brImageHashUploads.has('qa-hash');
   brImageHashUploads.add('qa-hash');shot.state='uploading';await realCameraUploader(shot);
   const inFlight=shot.state==='error'&&brImageHashUploads.has('qa-hash');
   brImageHashUploads.delete('qa-hash');
   return {failed,inFlight};
 });
 assert.deepEqual(result,{failed:true,inFlight:true});
 // Staff edge-function failures must not become a false "saved" state.
 const staff=await browser.newPage();
 await staff.route(/https?:.*\/(rest|storage|functions)\/v1\//,route=>route.abort());
 await staff.goto(pathToFileURL(join(root,'plate-studio.html')).href+'?staff=camera-qa',{waitUntil:'domcontentloaded'});
 await staff.waitForFunction(()=>typeof uploadBatchMultiPhotoInBackground==='function');
 const staffResult=await staff.evaluate(async()=>{
   const original=createStaffBatchReportFromFile;
   currentUser={id:'staff-qa'};cloudReady=true;
   batchImageHash=async()=> 'staff-hash';ensureBatchActor=()=>({name:'QA'});
   batchReportTimingForFile=async()=>({});compressPhotoForStorage=async()=>new Blob(['qa'],{type:'image/jpeg'});
   sb={functions:{invoke:async()=>({data:{},error:null})}};
   const file=new File(['qa'],'qa.jpg',{type:'image/jpeg'});
   const invalid=await original(file);
   const serverAck=invalid===undefined&&brUploadStatus[0].state==='error';
   createStaffBatchReportFromFile=async()=>undefined;
   const shot={id:'staff-shot',file,state:'uploading'};await uploadBatchMultiPhotoInBackground(shot);
   const missing=shot.state==='error';
   createStaffBatchReportFromFile=async()=>({pending:true});shot.state='uploading';await uploadBatchMultiPhotoInBackground(shot);
   const pending=shot.state==='error';
   createStaffBatchReportFromFile=async()=>({duplicate:true});shot.state='uploading';await uploadBatchMultiPhotoInBackground(shot);
   const unconfirmedDuplicate=shot.state==='error';
   createStaffBatchReportFromFile=async()=>({id:'saved-report'});shot.state='uploading';await uploadBatchMultiPhotoInBackground(shot);
   return {serverAck,missing,pending,unconfirmedDuplicate,saved:shot.state==='uploaded'};
 });
 assert.deepEqual(staffResult,{serverAck:true,missing:true,pending:true,unconfirmedDuplicate:true,saved:true});
 await staff.close();
 console.log('Camera QA passed: 8 theme/viewports; direct entry, consecutive capture, library/native, ring, focus, stream cleanup, close guard, retry and upload failure contracts.');
}finally{await browser.close();}
