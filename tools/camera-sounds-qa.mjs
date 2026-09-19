import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const executablePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(existsSync);
const wav=seconds=>{const samples=8000*seconds,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);return b;};
mkdirSync('qa-results/camera-sounds',{recursive:true});
const browser=await chromium.launch({executablePath,headless:true});
try{
 for(const width of [320,390,1280])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:850}});await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();await page.goto(pathToFileURL(resolve('plate-studio.html')).href);
  await page.addStyleTag({content:'#auth-ov{display:none!important}'});
  await page.evaluate(({theme,boom})=>{
   document.documentElement.dataset.theme=theme;currentUser={id:'user-qa'};cloudReady=false;cloudWorkspaceId=()=> 'workspace-qa';cloudWorkspaceOwnerId=()=> 'user-qa';
   window.fetch=async()=>new Response(new Uint8Array(boom),{status:200});
   window.soundDb={rows:[],preference:null,files:{},downloads:0,removed:0,failUpload:false,failInsert:false};
   sb={from(table){const filters={},q={op:'select',select(){return q;},eq(key,value){filters[key]=value;return q;},order(){return q;},limit(){return q;},maybeSingle(){q.single=true;return q;},insert(row){q.op='insert';q.row=row;return q;},update(row){q.op='update';q.row=row;return q;},upsert(row){q.op='upsert';q.row=row;return q;},then(resolve){let data,error=null;if(table==='camera_sounds'){if(q.op==='insert'){if(soundDb.failInsert)error=new Error('Metadata failed');else soundDb.rows.push({...q.row});}if(q.op==='update')soundDb.rows.filter(row=>row.id===filters.id).forEach(row=>Object.assign(row,q.row));data=soundDb.rows.filter(row=>Object.entries(filters).every(([key,value])=>key==='archived'?!row.archived:row[key]===value));}else{if(q.op==='upsert')soundDb.preference={...q.row};data=soundDb.preference;}return Promise.resolve({data,error}).then(resolve);}};return q;},storage:{from(){return {async upload(path,file){if(soundDb.failUpload)return {error:new Error('Upload failed')};soundDb.files[path]=file;return {data:{path}};},async download(path){soundDb.downloads++;return soundDb.files[path]?{data:soundDb.files[path]}:{error:new Error('Missing')};},async remove(paths){paths.forEach(path=>delete soundDb.files[path]);soundDb.removed+=paths.length;return {error:null};}};}}};
  },{theme,boom:[...readFileSync(resolve('assets/camera-boom.mp3'))]});
  await page.evaluate(()=>openCameraSoundLibrary());
  assert.equal(await page.locator('.camera-sound-row').count(),1,'Default boom remains available');
  const layout=await page.locator('.camera-sound-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});assert.equal(layout,true,`${width}/${theme} library fits`);
  await page.locator('#camera-sound-file').setInputFiles({name:'Vui.wav',mimeType:'audio/wav',buffer:wav(1)});
  assert.equal(await page.locator('#camera-sound-name').inputValue(),'Vui');await page.locator('#camera-sound-name').fill('Boom riêng');await page.getByRole('button',{name:'Tải lên cloud',exact:true}).click();
  await page.waitForFunction(()=>!cameraSoundState.busy&&cameraSoundState.items.length===1);
  assert.equal(await page.evaluate(()=>soundDb.rows[0].name),'Boom riêng','Name saved in metadata, file saved separately');
  assert.equal(await page.evaluate(()=>Object.keys(soundDb.files).length),1);
  await page.getByRole('button',{name:'Dùng',exact:true}).click();await page.waitForFunction(()=>!cameraSoundState.busy&&batchShutterBuffer&&batchShutterKey===cameraSoundState.selected);
  const choice=await page.evaluate(()=>({id:cameraSoundState.selected,pref:soundDb.preference.sound_id,seconds:batchShutterBuffer.duration}));assert.equal(choice.id,choice.pref);assert.equal(choice.seconds,1);
  const downloads=await page.evaluate(()=>soundDb.downloads);await page.evaluate(()=>{prepareBatchShutterSound();playBatchShutterSound();prepareBatchShutterSound();});assert.equal(await page.evaluate(()=>soundDb.downloads),downloads,'Repeated shutter taps reuse one decoded buffer');
  page.once('dialog',dialog=>dialog.accept('Tên mới'));await page.getByRole('button',{name:'Đổi tên Boom riêng'}).click();await page.waitForFunction(()=>!cameraSoundState.busy);assert.equal(await page.evaluate(()=>soundDb.rows[0].name),'Tên mới');
  await page.getByRole('button',{name:'Nghe thử Tên mới'}).click();await page.waitForFunction(()=>document.getElementById('camera-sound-status').textContent.includes('Đang nghe'));
  await page.screenshot({path:`qa-results/camera-sounds/${width}-${theme}.png`});
  await page.evaluate(async()=>{closeCameraSoundLibrary();cameraSoundState={scope:'',items:[],selected:null,loadedAt:0};await openCameraSoundLibrary();});
  assert.equal(await page.evaluate(()=>cameraSoundState.selected),choice.id,'A fresh session restores the cloud selection');
  await page.locator('#camera-sound-file').setInputFiles({name:'long.wav',mimeType:'audio/wav',buffer:wav(16)});await page.getByRole('button',{name:'Tải lên cloud',exact:true}).click();await page.waitForFunction(()=>!cameraSoundState.busy);assert.match(await page.locator('#camera-sound-status').textContent(),/15 giây/);assert.equal(await page.evaluate(()=>soundDb.rows.length),1,'Long sounds rejected before upload');
  await page.locator('#camera-sound-file').setInputFiles({name:'bad.wav',mimeType:'audio/wav',buffer:Buffer.from('not an audio file')});await page.getByRole('button',{name:'Tải lên cloud',exact:true}).click();await page.waitForFunction(()=>!cameraSoundState.busy);assert.equal(await page.evaluate(()=>soundDb.rows.length),1,'Invalid audio never registered');
  await page.locator('#camera-sound-file').setInputFiles({name:'fail.wav',mimeType:'audio/wav',buffer:wav(1)});await page.evaluate(()=>soundDb.failInsert=true);await page.getByRole('button',{name:'Tải lên cloud',exact:true}).click();await page.waitForFunction(()=>!cameraSoundState.busy);assert.equal(await page.evaluate(()=>soundDb.removed),1,'Only the failed new upload is cleaned up');assert.equal(await page.evaluate(()=>soundDb.rows.length),1);assert.equal(await page.evaluate(()=>Object.keys(soundDb.files).length),1);await page.evaluate(()=>soundDb.failInsert=false);
  await page.getByRole('button',{name:'Dùng',exact:true}).first().click();await page.waitForFunction(()=>!cameraSoundState.busy);assert.equal(await page.evaluate(()=>soundDb.preference.sound_id),null,'Default can be restored without deleting custom sounds');
  await page.evaluate(()=>{currentUser={id:'different-user'};resetCameraSoundScope();});assert.equal(await page.evaluate(()=>batchShutterBuffer===null&&cameraSoundState.items.length===0&&cameraSoundState.selected===null),true,'Account changes clear private sound state and decoded buffer');
  await page.evaluate(()=>{closeCameraSoundLibrary();const camera=document.createElement('div');camera.id='br-multi-cam';document.body.append(camera);});await page.evaluate(()=>openCameraSoundLibrary());assert.equal(await page.locator('#br-multi-cam').evaluate(el=>el.inert),true);await page.getByRole('button',{name:'Đóng âm thanh chụp'}).click();assert.equal(await page.locator('#br-multi-cam').evaluate(el=>el.inert),false,'Closing library returns camera controls');
  console.log(`PASS camera sounds ${width}/${theme}: upload/name, private file path, preview, rename, cloud choice, fresh session, bounded audio, invalid/long file, cleanup, scope reset, camera focus`);await context.close();
 }
}finally{await browser.close();}
