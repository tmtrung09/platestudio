import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const executablePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  for(const width of [390,1280])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:844}});
    await context.route(/^https?:/,route=>route.abort());
    const page=await context.newPage();
    await page.goto(pathToFileURL(resolve('plate-studio.html')).href);
    const checks=await page.evaluate(async theme=>{
      document.documentElement.dataset.theme=theme;
      document.getElementById('auth-ov').style.display='none';
      const checks=[],check=(name,ok)=>checks.push({name,ok:!!ok});
      const rows=new Map(),files=new Set(),now=new Date().toISOString(),old='2020-01-01T12:00:00.000Z';
      let thumbFails=false,dbFails=false,beforeDelete=null,dropReservation=false;
      currentUser={id:'qa-owner'};activeWorkspace={workspace_id:'qa-workspace',owner_user_id:'qa-owner'};cloudReady=true;
      const copy=value=>JSON.parse(JSON.stringify(value));
      const value=(row,key)=>key.startsWith('data->>')?row.data[key.slice(7)]:row[key];
      sb={from(){
        let op='read',patch=null,filters=[],single=false;
        const query={
          select(){return this;},limit(){return this;},order(){return this;},range(){return this;},
          eq(key,v){filters.push(row=>value(row,key)===v);return this;},
          lte(key,v){filters.push(row=>value(row,key)<=v);return this;},
          in(key,vs){filters.push(row=>vs.includes(value(row,key)));return this;},
          contains(key,v){filters.push(row=>Object.entries(v).every(([k,x])=>row[key]?.[k]===x));return this;},
          update(v){op='update';patch=v;return this;},insert(v){op='insert';patch=v;return this;},delete(){op='delete';return this;},
          maybeSingle(){single=true;return this;},
          then(resolve,reject){return Promise.resolve().then(()=>{
            if(op==='delete'&&beforeDelete){const action=beforeDelete;beforeDelete=null;action();}
            if(dbFails&&['insert','update'].includes(op))return {error:new Error('QA database offline')};
            let matches=[...rows.values()].filter(row=>filters.every(fn=>fn(row)));
            if(op==='insert'){rows.set(patch.id,copy(patch));matches=[patch];}
            if(op==='update')matches.forEach(row=>Object.assign(row,copy(patch)));
            if(op==='delete')matches.forEach(row=>rows.delete(row.id));
            return {data:copy(single?(matches[0]||null):matches),error:null,count:matches.length};
          }).then(resolve,reject);}
        };return query;
      },storage:{from(){return {
        async upload(path){
          if(thumbFails&&path.endsWith('-thumb.jpg'))return {error:new Error('QA thumbnail failed')};
          files.add(path);
          // A stale/older client may have removed the reservation while media uploaded.
          if(dropReservation)rows.clear();
          return {error:null};
        },getPublicUrl(path){return {data:{publicUrl:'https://qa.invalid/'+path}};}
      };}}};
      const fresh={id:'fresh',workspace_id:'qa-workspace',updated_at:now,data:{id:'fresh',status:'uploading',createdAt:old,image:null,thumb:null}};
      check('old photo date does not expire a new upload',!staleBatchUploadReservation(fresh));
      check('unknown upload time is never guessed from photo date',!staleBatchUploadReservation(fresh.data));
      const stale=copy(fresh);stale.id=stale.data.id='stale';stale.updated_at=old;
      check('genuinely stale reservation is detected',staleBatchUploadReservation(stale));
      rows.set('fresh',copy(fresh));rows.set('stale',copy(stale));
      const cleaned=await clearStaleBatchUploadReservations([fresh,stale]);
      check('cleanup keeps current uploads, deletes only stale records',rows.has('fresh')&&!rows.has('stale')&&!cleaned.has('fresh')&&cleaned.has('stale'));
      rows.set('stale',copy(stale));beforeDelete=()=>{rows.get('stale').data.status='pending';rows.get('stale').data.image='saved.jpg';rows.get('stale').updated_at=now;};
      const raced=await clearStaleBatchUploadReservations([stale]);
      check('cleanup cannot delete a report finalized by another device',rows.get('stale')?.data.image==='saved.jpg'&&!raced.has('stale'));
      rows.clear();
      const report={id:'missing-reservation',image:'full.jpg',thumb:'thumb.jpg',imageHash:'hash',status:'pending',createdAt:old};
      await finalizeReservedBatchReport(report);
      check('finalization recreates a missing reservation',rows.get(report.id)?.data.image==='full.jpg');
      await finalizeReservedBatchReport({...report,id:'no-hash',imageHash:''});
      check('finalization persists even without crypto/hash',rows.get('no-hash')?.data.status==='pending');
      dbFails=true;let refused=false;
      try{await finalizeReservedBatchReport({...report,id:'unacknowledged'});}catch{refused=true;}
      check('failed final database write cannot acknowledge storage alone',refused&&!rows.has('unacknowledged'));
      dbFails=false;
      rows.set('in-flight',{...copy(fresh),id:'in-flight',data:{...fresh.data,id:'in-flight',imageHash:'in-flight'}});
      let duplicatePending=false;
      try{await reserveBatchReportImage({id:'second-device',imageHash:'in-flight'});}catch{duplicatePending=true;}
      check('another device reservation is not a saved duplicate',duplicatePending&&!rows.has('second-device'));
      rows.delete('in-flight');
      await releaseReservedBatchReport(report.id,{onlyUploading:true});
      check('upload error cleanup preserves an acknowledged report',rows.has(report.id));
      await releaseReservedBatchReport(report.id);
      check('explicit user deletion still removes a completed report',!rows.has(report.id));
      // Exercise both real upload callers and storage finalization; stub only
      // image encoding, unrelated audit/UI and server transport.
      compressPhotoForStorage=async()=>new Blob(['jpeg'],{type:'image/jpeg'});
      canCaptureBatchReports=()=>true;canEditBatchReports=()=>true;canDescribeBatchReports=()=>true;
      ensureBatchActor=()=>({name:'QA'});batchImageHash=async file=>file.name;
      batchReportTimingForFile=async()=>({createdAt:old,capturedAt:old,photoTakenAt:old});
      sv=(key,data)=>saveLocalValue(key,data);recordSystemEvent=()=>{};saveOperations=()=>{};recordAudit=()=>{};updateCamBadge=()=>{};renderBatchMultiCameraTray=()=>{};
      renderBatchReport=()=>{};
      thumbFails=true;dropReservation=true;batchReports=[];rows.clear();
      await createBatchReportFromFile(new File(['old photo'],'library.jpg',{type:'image/jpeg'}));
      const library=batchReports.find(r=>r.imageHash==='library.jpg');
      check('device library upload survives thumbnail failure and lost reservation',library?.image&&library.thumb===library.image&&rows.get(library.id)?.data.status==='pending');
      const shot={id:'camera-shot',file:new File(['photo'],'camera.jpg',{type:'image/jpeg'}),state:'uploading'};
      await uploadBatchMultiPhotoInBackground(shot);
      check('camera uses the same acknowledged save path',shot.state==='uploaded'&&rows.get(shot.id)?.data.image);
      dropReservation=false;thumbFails=false;dbFails=true;
      const failedShot={id:'failed-shot',file:new File(['fail'],'failed.jpg',{type:'image/jpeg'}),state:'uploading'};
      await uploadBatchMultiPhotoInBackground(failedShot);
      check('database failure is never reported as saved',failedShot.state==='error'&&!batchReports.some(r=>r.id===failedShot.id));
      dbFails=false;
      // Reload the server collection into the normal library renderer.
      sb.rpc=async()=>({data:[...rows.values()].map(row=>({...copy(row),total_count:rows.size})),error:null});
      batchReports=[];batchServerPagingAvailable=true;
      await loadBatchReportsFromCloud({reset:true});
      check('fresh server reload retains original photo date and media',batchReports.some(r=>r.id===shot.id&&r.createdAt===old&&r.image));
      cloudReady=false;batchCloudServerPaged=false;FILTERS.batches={...FILTERS.batches,status:'all',search:'',sort:'recorded_desc'};batchReportCurrentPage=1;
      renderBatchReportPage();
      check('saved uploads appear in the normal report list',batchReportVisibleIds.includes(shot.id)&&document.querySelectorAll('.batch-report-media>img').length>0);
      check('uploaded originals exist independently of thumbnails',files.size>=2);
      return checks;
    },theme);
    for(const item of checks)assert.equal(item.ok,true,`${width}/${theme}: ${item.name}`);
    console.log(`PASS batch upload ${width}/${theme}: ${checks.length} checks — old photos, concurrent cleanup, missing reservation, thumbnail fallback, database acknowledgement, normal library`);
    await context.close();
  }
}finally{await browser.close();}
