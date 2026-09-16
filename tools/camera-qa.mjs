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
       const zoom=el.querySelector('#br-camera-zoom'),zoomBounds=zoom.getBoundingClientRect();
       const zoomStyle=getComputedStyle(zoom);
       if(zoomStyle.backgroundColor!=='rgba(0, 0, 0, 0)'||zoomStyle.backgroundImage!=='none'||zoomStyle.boxShadow!=='none')errors.push('Slider inherited a text-field background');
       if(zoomBounds.width<80||zoomBounds.height<44||zoomBounds.right>innerWidth)errors.push('Zoom slider touch target');
       if(Number(getComputedStyle(el.querySelector('.br-multi-cam-top')).zIndex)<=Number(getComputedStyle(el.querySelector('.br-camera-console')).zIndex))errors.push('Landscape blur can cover flash/focus controls');
       if(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)errors.push('Camera overflow');
       for(const banner of document.querySelectorAll('.cloud-activity,.media-upload-guard,.kiot-sync-popup')){
         if(Number(getComputedStyle(banner).zIndex)>=Number(getComputedStyle(el).zIndex))errors.push('Background progress can cover camera controls');
       }
       for(const b of el.querySelectorAll('button')){
         if(!b.getClientRects().length)continue;
         const r=b.getBoundingClientRect();
         if(r.width<44||r.height<44||r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)errors.push('Unreachable control '+b.getAttribute('aria-label'));
       }
       const video=el.querySelector('video'),bounds=video.getBoundingClientRect();
       if(getComputedStyle(video).objectFit!=='cover'||bounds.x!==0||bounds.y!==0||bounds.width!==innerWidth||bounds.height!==innerHeight)errors.push('Camera does not fill the viewport');
       for(const glass of el.querySelectorAll('.br-camera-glass')){
         const style=getComputedStyle(glass),feather=getComputedStyle(glass,'::before');
         if(style.backgroundColor!=='rgba(0, 0, 0, 0)'||style.backdropFilter!=='none'||style.borderTopWidth!=='0px'||style.boxShadow!=='none')errors.push('Hard glass boundary');
         if(!feather.backdropFilter.includes('blur(18px)')||!feather.maskImage.includes('linear-gradient')||!feather.maskImage.includes('rgba(0, 0, 0, 0)')||feather.pointerEvents!=='none')errors.push('Blur must fade out without blocking controls');
       }
       const shutter=el.querySelector('.br-camera-shutter'),center=getComputedStyle(shutter.querySelector('button'));
       if(center.borderTopWidth!=='0px'||center.boxShadow!=='none'||center.backgroundColor!=='rgb(247, 248, 252)')errors.push('Dark gap between shutter and ring');
       const ring=getComputedStyle(shutter,'::before'),light=getComputedStyle(shutter,'::after');
       if(ring.animationName!=='brShutterLight'||ring.pointerEvents!=='none')errors.push('Shutter ring');
       if(light.animationName!=='brShutterLight'||light.animationDuration!=='2.4s'||light.pointerEvents!=='none')errors.push('Missing moving light');
       return errors;
     });
     assert.deepEqual(errors,[],width+'/'+theme);
     if(width===390||width===1440)await page.screenshot({path:join(output,width+'-'+theme+'.png')});
   }
 }
 await page.setViewportSize({width:390,height:844});
 const frameTests=await page.evaluate(()=>{
   return [[1920,1080,390,844],[1080,1920,844,390],[1920,1080,1440,900]].every(([sw,sh,vw,vh])=>{
     const f=batchCameraFrame(sw,sh,vw,vh);
     return Math.abs(f.width/f.height-vw/vh)<.00001&&f.x>=0&&f.y>=0&&Math.abs(f.x*2+f.width-sw)<.001&&Math.abs(f.y*2+f.height-sh)<.001;
   });
 });
 assert.equal(frameTests,true,'Saved image must match the visible centered frame');
 // Zoom is shared by the slider, pinch, preview transform and capture crop.
 await page.locator('#br-camera-zoom').focus();
 await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
 assert.equal(await page.locator('#br-camera-zoom').evaluate(el=>getComputedStyle(el).boxShadow),'none','Range focus must not inherit a text-field fill/glow');
 assert.equal(await page.evaluate(()=>brCameraZoom),1.05,'Keyboard zoom');
 await page.getByRole('button',{name:'Đặt zoom về 1×',exact:true}).click();
 const touch=await page.context().newCDPSession(page);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:100,y:220,id:1},{x:200,y:220,id:2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:70,y:220,id:1},{x:230,y:220,id:2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await page.evaluate(()=>brCameraZoom),1.6,'Pinch out zooms the image, not the page');
 assert.equal(await page.evaluate(()=>visualViewport.scale),1);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:70,y:220,id:1},{x:230,y:220,id:2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:100,y:220,id:1},{x:200,y:220,id:2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 assert.equal(await page.evaluate(()=>brCameraZoom),1,'Pinch in and cancellation');
 await touch.detach();
 const zoomBounds=await page.evaluate(()=>{
   setBatchCameraZoom(99);const max=brCameraZoom;setBatchCameraZoom(-1);const min=brCameraZoom;
   setBatchCameraZoom(2);
   const video=document.querySelector('#br-multi-cam video'),view=video.parentElement.getBoundingClientRect();
   const full=batchCameraFrame(video.videoWidth,video.videoHeight,view.width,view.height);
   const zoomed=batchCameraFrame(video.videoWidth,video.videoHeight,view.width,view.height,brCameraZoom);
   window.expectedCameraCrop=zoomed;
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){
     if(args[0] instanceof HTMLVideoElement)window.actualCameraCrop=args.slice(1,5);
     return draw.apply(this,args);
   };
   return {min,max,crop:zoomed.width===full.width/2&&zoomed.height===full.height/2,preview:getComputedStyle(video).transform};
 });
 assert.deepEqual(zoomBounds,{min:1,max:4,crop:true,preview:'matrix(2, 0, 0, 2, 0, 0)'});
 const lightBefore=await page.locator('.br-camera-shutter').evaluate(el=>getComputedStyle(el,'::after').transform);
 await page.waitForTimeout(180);
 assert.notEqual(await page.locator('.br-camera-shutter').evaluate(el=>getComputedStyle(el,'::after').transform),lightBefore,'Light must actually move');
 await page.locator('.br-multi-cam .capture').click();
 await page.waitForFunction(()=>brMultiCameraShots.length===1&&brMultiCameraShots[0].state==='uploaded');
 assert.equal(await page.evaluate(()=>JSON.stringify(actualCameraCrop)===JSON.stringify([expectedCameraCrop.x,expectedCameraCrop.y,expectedCameraCrop.width,expectedCameraCrop.height])),true,'Capture must use the same zoom crop as preview');
 await page.getByRole('button',{name:'Đặt zoom về 1×',exact:true}).click();
 await page.locator('.br-multi-cam .capture').click();
 await page.waitForFunction(()=>brMultiCameraShots.length===2&&brMultiCameraShots.every(s=>s.state==='uploaded'));
 assert.equal(await page.evaluate(()=>brMultiCameraShots.every(s=>s.file===null)),true,'Release original files after saved');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=','base64');
 const chooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Chọn ảnh từ thư viện',exact:true}).click();
 await (await chooser).setFiles([{name:'library-1.png',mimeType:'image/png',buffer:png},{name:'library-2.png',mimeType:'image/png',buffer:png}]);
 await page.waitForFunction(()=>brMultiCameraShots.length===4&&brMultiCameraShots.every(s=>s.state==='uploaded'));
 await page.screenshot({path:join(output,'saved.png')});
 for(const [width,height] of [[320,568],[844,390]]){
   await page.setViewportSize({width,height});
   assert.equal(await page.locator('.br-camera-console').evaluate(el=>{
     const r=el.getBoundingClientRect(),top=document.querySelector('.br-multi-cam-top').getBoundingClientRect();
     return r.top>=top.bottom&&r.bottom<=innerHeight+1&&r.right<=innerWidth&&el.scrollHeight<=el.clientHeight+1;
   }),true,'Populated camera controls fit '+width);
   await page.screenshot({path:join(output,'saved-'+width+'.png')});
 }
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.br-camera-shutter').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
 assert.equal(await page.locator('.br-camera-shutter').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByRole('button',{name:'Đóng camera',exact:true}).focus();
 await page.keyboard.press('Shift+Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Xong','Trap keyboard focus');
 const oldTrack=await page.evaluate(()=>{setBatchCameraZoom(3);window.oldCameraTrack=brMultiCameraStream.getVideoTracks()[0];return oldCameraTrack.readyState;});
 assert.equal(oldTrack,'live');
 await page.getByRole('button',{name:'Đổi camera',exact:true}).click();
 await page.waitForFunction(()=>brMultiCameraStream?.getVideoTracks()[0]!==oldCameraTrack&&document.querySelector('#br-multi-cam')?.dataset.camera==='live');
 assert.equal(await page.evaluate(()=>oldCameraTrack.readyState),'ended');
 assert.equal(await page.evaluate(()=>brCameraZoom),1,'Switching camera resets zoom');
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
 assert.equal(await page.locator('#br-camera-zoom').isDisabled(),true,'Native camera manages its own zoom');
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
 console.log('Camera QA passed: 8 theme/viewports; direct entry, pinch/slider/keyboard zoom, matching capture crop, consecutive capture, library/native, ring, focus, stream cleanup, close guard, retry and upload failure contracts.');
}finally{await browser.close();}
