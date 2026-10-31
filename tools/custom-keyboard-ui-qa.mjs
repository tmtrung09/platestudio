import {PGlite} from '@electric-sql/pglite';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const root=resolve('.'),out=resolve('qa-results/custom-keyboard');mkdirSync(out,{recursive:true});
const db=new PGlite(),w='11111111-1111-4111-8111-111111111111',u='22222222-2222-4222-8222-222222222222',revision='2026-10-25T00:00:00.000Z';
await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create table workspaces(id uuid primary key,owner_user_id uuid);create table workspace_members(workspace_id uuid,user_id uuid,role text,permissions jsonb);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id text primary key,bucket_id text,name text);alter table storage.objects enable row level security;
create function auth.uid() returns uuid language sql stable as $$select '${u}'::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
create function is_workspace_owner(w uuid) returns boolean language sql stable security definer as $$select exists(select 1 from workspaces where id=w and owner_user_id=auth.uid())$$;
insert into auth.users(id,email) values('${u}','qa@example.test');insert into workspaces values('${w}','${u}');`);
for(const table of ['models','filaments','projects','orders','plates','plate_items','settings','batch_reports'])await db.exec(`create table ${table}(id text,user_id uuid,workspace_id uuid,data jsonb,updated_at timestamptz default now(),primary key(workspace_id,id));alter table ${table} enable row level security;`);
for(const file of ['202610250001_custom_store_orders.sql','202610300001_custom_order_original_colors.sql','202610300002_custom_keyboard_preview.sql','202610310001_filament_reference_palette.sql'])await db.exec(readFileSync(resolve('supabase/migrations',file),'utf8'));
const model={id:'keyboard-real-id',name:'Bàn phím tên',images:[],parts:[{id:'tray-real-id',name:'Khay bàn phím',qtyPerModel:1,filamentIds:['f-pink']},{id:'keys-real-id',name:'Nút + ký tự',qtyPerModel:4,filamentIds:['f-orange']}],variants:[]};
const fils=[{id:'f-pink',name:'Hồng anh đào',brand:'CAILAB',mat:'PLA Matte',hex:'#FBA8D0'},{id:'f-orange',name:'Cam',brand:'TINMORRY',mat:'PLA Matte',hex:'#FF9201'},{id:'f-blue',name:'Xanh băng',brand:'R3D',mat:'PLA Matte',hex:'#BCEFFA'},{id:'f-desert',name:'Cát sa mạc',brand:'CAILAB',mat:'PLA Matte',hex:'#DAC79D'}];
fils.push({id:'f-black',name:'Đen',brand:'R3D',mat:'PLA Matte',hex:'#191919'},{id:'f-cream',name:'Trắng kem',brand:'CAILAB',mat:'PLA Matte',hex:'#F0E9D5'},{id:'f-mint',name:'Xanh bạc hà',brand:'TINMORRY',mat:'PLA Matte',hex:'#9DDACB'});
const insert=(table,id,data)=>db.query(`insert into ${table}(id,user_id,workspace_id,data,updated_at) values($1,$2,$3,$4,$5)`,[id,u,w,JSON.stringify(data),revision]);
await insert('models',model.id,model);await insert('models','other-model',{id:'other-model',name:'Model khác',parts:[],variants:[],images:[]});for(const f of fils)await insert('filaments',f.id,f);
await insert('filaments','old-purple',{id:'old-purple',name:'Pupple',brand:'Timory',hex:'#ca38ff',mat:'PLA',matte:true});
const palette=JSON.parse(readFileSync('assets/filaments/reference-palette.json','utf8'));
const imported=(await db.query('select import_filament_reference_palette($1,$2,true) result',[w,JSON.stringify(palette)])).rows[0].result;
const iceId=imported.plan.find(r=>r.key==='cailab:pla-matte:mt635').id;

// Native rebuilding must retain the authoritative snapshot and one combined part.
const html=readFileSync('plate-studio.html','utf8'),sandbox={structuredClone,Date,models:[structuredClone(model)],plates:[],pitems:[],uid:()=>crypto.randomUUID(),partsForVariant:m=>m.parts,resolvedPartColorIds:(m,v,p)=>p.filamentIds};
vm.createContext(sandbox);const start=html.indexOf('function keyboardPartAllocation('),end=html.indexOf('/* Model cần chọn',start);assert.ok(start>0&&end>start);vm.runInContext(html.slice(start,end),sandbox);
const rebuild=html.slice(html.indexOf('function rebuildOrderProduction('),html.indexOf('function saveEditOrder('));vm.runInContext(rebuild,sandbox);
const nativeKb={version:1,text:'TIEN',partIds:{tray:'tray-real-id',keys:'keys-real-id'},colors:{tray:'f-pink',buttons:'f-orange',characters:'f-blue'},components:{tray:fils[0],buttons:fils[1],characters:fils[2]},trayFilamentIds:['f-pink'],keyFilamentIds:['f-orange','f-blue'],colorKeys:{tray:'keyboard:tray-key',keys:'keyboard:combined-key'}};
const item={id:'i',modelId:model.id,qty:2,keyboard:nativeKb,colorChoices:{'tray-real-id':'f-pink','keys-real-id':'f-orange'},note:'Giữ yêu cầu khách'};
let native=JSON.parse(JSON.stringify(sandbox.lineAllocations(item)));assert.equal(native.rows.length,2);assert.equal(native.rows.find(r=>r.part.id==='keys-real-id').qty,8);
sandbox.models[0].parts[1].filamentIds=['f-desert'];sandbox.rebuildOrderProduction({id:'native-test',items:[item]});assert.equal(sandbox.pitems.length,2);assert.equal(sandbox.pitems.find(p=>p.partId==='keys-real-id').componentColors.characters.id,'f-blue');assert.equal(sandbox.plates.length,2);assert.ok(sandbox.plates.every(p=>p.priority===100));
console.log('PASS keyboard native rebuild: two physical parts, unchanged combined quantity, snapshot colors/text/metadata, isolated plates and priority.');

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),errors=[];let profiles=0;
async function setup(width,theme){
 const context=await browser.newContext({viewport:{width,height:width===844?390:1000},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(({w,u})=>{
  window.__commits=[];
  const client={auth:{getSession:async()=>({data:{session:{user:{id:u,email:'qa@example.test',user_metadata:{full_name:'QA'}}}}}),onAuthStateChange:()=>({})},rpc:async(name,args)=>{
   if(name==='ensure_workspace_membership')return {data:[{workspace_id:w,owner_user_id:u,role:'owner',permissions:['orders.manage','custom_orders.create','custom_orders.view']}]};
   if(name==='commit_custom_order'){window.__commits.push(args);const result=await window.sqlRPC(name,args);if(localStorage.getItem('lose-ack')){localStorage.removeItem('lose-ack');return {error:{message:'Lost ACK QA'}};}return result;}
   return window.sqlRPC(name,args);
  },storage:{from:()=>({upload:async path=>{await window.sqlPhoto(path);return {};},createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'https://keyboard-custom.test/fixture.svg'}))})})}};
  window.supabase={createClient:()=>client};
 },{w,u});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('sqlRPC',async(name,args)=>{try{const names={custom_order_catalog:[args.w,args.q,args.off],custom_order_filaments:[args.w],custom_order_list:[args.w,args.off,args.q],custom_order_tracking:[args.w,args.oid],commit_custom_order:[args.w,args.request,JSON.stringify(args.p)]};assert.ok(names[name],name);const values=names[name],q=`select ${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) result`;return {data:(await db.query(q,values)).rows[0].result};}catch(e){return {error:{message:e.message,code:e.code}};}});
 await page.exposeFunction('sqlPhoto',path=>db.query('insert into storage.objects values($1,$2,$3)',[crypto.randomUUID(),'custom-order-media',path]));
 await page.route(/^https?:/,r=>{const url=new URL(r.request().url());if(url.origin!=='https://keyboard-custom.test')return r.abort();if(url.pathname==='/assets/custom-orders/supabase.js')return r.fulfill({contentType:'application/javascript',body:'/* isolated SQL transport */'});if(url.pathname==='/fixture.svg')return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ddd"/></svg>'});const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep)||!existsSync(path))return r.abort();return r.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream'});});
 await page.goto('https://keyboard-custom.test/custom-orders.html');await page.locator('[data-model="keyboard-real-id"]').waitFor();if(theme==='dark')await page.locator('#theme-toggle').click();return {context,page};
}
async function choose(page,role,query,id){await page.locator(`[data-keyboard-role="${role}"]`).locator('..').locator('.br-color-picker-toggle').click();const menu=page.locator('body>.filament-menu');await menu.locator('input').fill(query);assert.equal(await menu.locator('.br-color-picker-options').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),page.viewportSize().width<600?3:4);await menu.locator(`[data-value="${id}"]`).click();}
async function painted(page,text){await page.waitForFunction(text=>document.querySelector('[data-keyboard-canvas]')?.getAttribute('aria-label')?.includes('Minh họa '+text),text);}
try{
 for(const width of [320,390,844,1440])for(const theme of ['light','dark']){
  const requested=process.argv.find(arg=>arg.startsWith('--profile='))?.slice(10);if(requested&&requested!==`${width}-${theme}`)continue;
  const {page,context}=await setup(width,theme);await page.locator('[data-model="keyboard-real-id"]').click();await page.locator('.keyboard-custom').waitFor();assert.equal(await page.locator('[data-keyboard-role]').count(),3);assert.equal(await page.locator('[data-part]').count(),0,'No separate fake character part');assert.match(page.url(),/custom-orders\.html/);assert.equal(await page.locator('iframe').count(),0,'Preview lives inside the selected product');
  await page.locator('[data-keyboard-text]').fill('An ơi!');await painted(page,'AN ƠI!');assert.equal(await page.locator('[data-keyboard-text]').inputValue(),'AN ƠI!');assert.match(await page.locator('.keyboard-render-message').textContent(),/font minh họa/,'Uppercase Vietnamese accents retain an explicit unsupported glyph note');
  const editing=await page.locator('[data-keyboard-text]').evaluate(el=>{
   el.focus();window.uppercaseInput=el;el.value='tien';el.setSelectionRange(2,2);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));
   const pasted={value:el.value,start:el.selectionStart,end:el.selectionEnd,focused:document.activeElement===el};
   el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='a\u0301nh';el.setSelectionRange(2,2);el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));const composing=el.value;
   el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:el.value}));
   return {pasted,composing,completed:el.value,start:el.selectionStart,stable:window.uppercaseInput===document.querySelector('[data-keyboard-text]')};
  });assert.deepEqual(editing,{pasted:{value:'TIEN',start:2,end:2,focused:true},composing:'a\u0301nh',completed:'ÁNH',start:1,stable:true},'Paste keeps caret/DOM; Vietnamese composition finishes before NFC uppercase conversion');
  await page.locator('[data-keyboard-text]').fill('tien');await painted(page,'TIEN');await page.locator('[data-note]').fill('Giữ màu theo khách đã chốt');
  await choose(page,'characters','MT635',iceId);await page.waitForFunction(()=>document.querySelector('canvas')?.getAttribute('aria-label')?.includes('Ký tự: Xanh băng'));
  await choose(page,'characters','TINMORRY tim','old-purple');assert.equal(await page.evaluate(()=>getFil('old-purple').hex),'#ca38ff','Enriched colors use the existing HEX in the live preview');
  await choose(page,'characters','xanh bang','f-blue');
  await page.locator('[data-files]').setInputFiles({name:'qa-reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/WQAAAAASUVORK5CYII=','base64')});await page.locator('.attachment img').waitFor();
  await page.locator('[data-keyboard-text]').evaluate(el=>{window.keptKeyboardInput=el;window.keptKeyboardCanvas=document.querySelector('canvas');window.keptKeyboardImage=document.querySelector('.attachment img');window.alphaBefore=[...window.keptKeyboardCanvas.getContext('2d').getImageData(0,0,window.keptKeyboardCanvas.width,window.keptKeyboardCanvas.height).data].filter((_,i)=>i%4===3).join(',');});
  await choose(page,'characters','xanh bang','f-blue');await page.waitForFunction(()=>document.querySelector('canvas')?.getAttribute('aria-label')?.includes('Ký tự: Xanh băng'));
  assert.equal(await page.locator('[data-keyboard-role="buttons"]').inputValue(),'','Changing characters preserves original button color');
  assert.equal(await page.evaluate(()=>window.alphaBefore===[...document.querySelector('canvas').getContext('2d').getImageData(0,0,document.querySelector('canvas').width,document.querySelector('canvas').height).data].filter((_,i)=>i%4===3).join(',')),true,'Color changes never deform geometry');
  await choose(page,'tray','hong anh dao','f-pink');await choose(page,'buttons','cam','f-orange');
  assert.equal(await page.evaluate(()=>window.keptKeyboardInput===document.querySelector('[data-keyboard-text]')&&window.keptKeyboardCanvas===document.querySelector('canvas')&&window.keptKeyboardImage===document.querySelector('.attachment img')),true,'Input/canvas/reference DOM preserved');
  await page.locator('[data-keyboard-text]').fill('diane');await painted(page,'DIANE');await page.waitForFunction(()=>document.querySelector('.draft-hint')?.textContent.includes('Đã giữ'));await page.reload();await page.locator('[data-keyboard-text]').waitFor();assert.equal(await page.locator('[data-keyboard-text]').inputValue(),'DIANE');assert.equal(await page.locator('[data-keyboard-role="characters"]').inputValue(),'f-blue');await painted(page,'DIANE');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);const dims=await page.locator('canvas').evaluate(el=>{const r=el.getBoundingClientRect();return {ratio:r.width/r.height,native:el.width/el.height};});assert.ok(Math.abs(dims.ratio-dims.native)<.001,'Uniform scale preserves render proportions');
  await page.locator('.keyboard-custom').screenshot({path:resolve(out,`${width}-${theme}-inline.png`)});
  if([390,1440].includes(width))await page.screenshot({path:resolve(out,`${width}-${theme}-custom-order-page.png`),fullPage:true});
  if(width===1440&&theme==='light'){
   assert.equal(await page.evaluate(()=>KeyboardRenderData.version===2&&KeyboardRenderData.specularReflectanceApplied===true&&KeyboardRenderData.mapsPostprocessed===true&&Object.keys(KeyboardRenderData.trays).length===10&&Object.keys(KeyboardRenderData.glyphs).length===47),true,'Complete, denoised path-traced lighting bank');
   const pigmentCoverage=await page.locator('canvas').evaluate(el=>{const d=el.getContext('2d').getImageData(0,0,el.width,el.height).data;let opaque=0,orange=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>250){opaque++;if(d[i]>d[i+1]*1.25&&d[i+1]>d[i+2]*1.5&&d[i+2]<150)orange++;}return orange/opaque;});assert.ok(pigmentCoverage>.2,'Reflections preserve the selected orange pigment instead of bleaching the surface');
   await page.locator('canvas').screenshot({path:resolve(out,'studio-orange-pink.png')});
   await choose(page,'buttons','den','f-black');await choose(page,'characters','trang kem','f-cream');await painted(page,'DIANE');await page.waitForFunction(()=>document.querySelector('canvas').getAttribute('aria-label').includes('Ký tự: Trắng kem'));
   const variation=await page.locator('canvas').evaluate(el=>{const d=el.getContext('2d').getImageData(0,0,el.width,el.height).data,s=new Set();for(let i=0;i<d.length;i+=4)if(d[i+3]>250&&d[i]<100&&d[i+1]<100&&d[i+2]<100)s.add(d[i]);return s.size;});assert.ok(variation>20,'Dark plastic retains surface lighting and specular detail');
   const darkCoverage=await page.locator('canvas').evaluate(el=>{const d=el.getContext('2d').getImageData(0,0,el.width,el.height).data;let opaque=0,dark=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>250){opaque++;if(d[i]<100&&d[i+1]<100&&d[i+2]<100)dark++;}return dark/opaque;});assert.ok(darkCoverage>.3,'Black keys retain their dark body color under the studio lights');
   await page.locator('canvas').screenshot({path:resolve(out,'studio-black-cream.png')});
   await page.evaluate(()=>{const d=KeyboardRenderData,c=document.createElement('canvas');c.width=c.height=4;window.keptTestGlyphs={question:d.glyphs['?'],bang:d.glyphs['!']};const offset=[0,-Math.round(d.scale*22*Math.cos(d.cameraElevation*Math.PI/180))];d.glyphs['?']={image:c.toDataURL(),offset};d.glyphs['!']={image:c.toDataURL(),offset};});
   await page.locator('[data-keyboard-text]').fill('?');await painted(page,'?');
   const sample=()=>page.locator('canvas').evaluate(el=>{const base=KeyboardRenderData.trays['1'],off=KeyboardRenderData.glyphs['?'].offset,a=-6*Math.PI/180,dx=base.origin[0]+off[0]+2.5-base.width/2,dy=base.origin[1]+off[1]+2.5-base.height/2,x=Math.floor(el.width/2+dx*Math.cos(a)-dy*Math.sin(a)),y=Math.floor(el.height/2+dx*Math.sin(a)+dy*Math.cos(a));return [...el.getContext('2d').getImageData(x,y,1,1).data];});
   const cleanKey=await sample();await page.evaluate(()=>{const spaced=KeyboardRenderData.materialEncoding==='spaced-red-v1',bytes=spaced?'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGNs2KITyoAEmJA5xAkAAHGoAb2MEsYkAAAAAElFTkSuQmCC':'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGNk2qITyoAEmJA5xAkAAFCuAT9Qyq4KAAAAAElFTkSuQmCC';KeyboardRenderData.glyphs['?'].image='data:image/png;base64,'+bytes;});await page.locator('[data-keyboard-text]').fill('!');await painted(page,'!');await page.locator('[data-keyboard-text]').fill('?');await painted(page,'?');
   const softKey=await sample();assert.ok(softKey.slice(0,3).every((value,i)=>Math.abs(value-cleanKey[i])<8),'A translucent key shadow must retain key pigment instead of leaking character color');
   await page.evaluate(()=>{KeyboardRenderData.glyphs['?']=keptTestGlyphs.question;KeyboardRenderData.glyphs['!']=keptTestGlyphs.bang;});await page.locator('[data-keyboard-text]').fill('DIANE');await painted(page,'DIANE');
   await choose(page,'tray','xanh bac ha','f-mint');await choose(page,'buttons','trang kem','f-cream');await choose(page,'characters','hong anh dao','f-pink');await page.waitForFunction(()=>document.querySelector('canvas').getAttribute('aria-label').includes('Ký tự: Hồng anh đào'));await page.locator('canvas').screenshot({path:resolve(out,'studio-mint-cream.png')});
   await choose(page,'tray','hong anh dao','f-pink');await choose(page,'buttons','cam','f-orange');await choose(page,'characters','xanh bang','f-blue');await page.waitForFunction(()=>document.querySelector('canvas').getAttribute('aria-label').includes('Ký tự: Xanh băng'));
   let missingOnce=true;await page.route('**/keyboard-render/**/glyph-66.png',route=>{if(missingOnce){missingOnce=false;return route.abort();}return route.fallback();});
   await page.locator('[data-keyboard-text]').fill('B');await page.waitForFunction(()=>document.querySelector('.keyboard-render-message').textContent.includes('Chưa tải được'));assert.equal(await page.locator('[data-keyboard-text]').inputValue(),'B','Image failure retains the requested name');await page.evaluate(()=>window.dispatchEvent(new Event('online')));await painted(page,'B');assert.equal(await page.locator('canvas').isVisible(),true,'Online resumes missing image without discarding the draft');await page.locator('[data-keyboard-text]').fill('DIANE');await painted(page,'DIANE');
  }
  await page.locator('#next-step').click();await page.locator('#customer-name').fill('QA');await page.locator('#customer-phone').fill('0901234567');await page.locator('#order-total').fill('280000');await page.locator('#order-deposit').fill('100000');await page.locator('#order-due').fill('2026-11-10');await page.locator('[data-action=next]').click();assert.match(await page.locator('.review-product').innerText(),/DIANE/);assert.match(await page.locator('.part-summary').innerText(),/Ký tự.*Xanh băng/s);
  await page.locator('#review-confirm').check();if(width===390&&theme==='dark')await page.evaluate(()=>localStorage.setItem('lose-ack','1'));await page.locator('#submit-order').click();
  if(width===390&&theme==='dark'){await page.waitForFunction(()=>window.__commits.length>0&&document.querySelector('[data-action=retry]')?.disabled===false);const request=await page.evaluate(()=>window.__commits[0].request);await page.reload();await page.locator('.success-panel').waitFor();assert.equal(await page.evaluate(()=>window.__commits[0].request),request,'Lost ACK reload retries the same keyboard request');}else await page.locator('.success-panel').waitFor();
  const commit=await page.evaluate(()=>window.__commits[0]);assert.equal(commit.p.lines[0].keyboard.text,'DIANE');const orderId='custom-'+commit.request;const parts=(await db.query("select data from plate_items where data->>'orderId'=$1",[orderId])).rows.map(r=>r.data);assert.equal(parts.length,2);assert.equal(parts.find(p=>p.partId==='keys-real-id').qty,4);assert.equal(parts.find(p=>p.partId==='keys-real-id').componentColors.characters.filamentId,'f-blue');
  assert.deepEqual((await db.query('select data from models where id=$1',[model.id])).rows[0].data,model);await context.close();profiles++;console.log('PASS inline keyboard',width,theme,'real SQL, same page, three regions/two parts, geometry, name/color/image DOM, reload, review, upload, ACK and production snapshot');
 }
 assert.deepEqual(errors,[]);writeFileSync(resolve(out,'summary.json'),JSON.stringify({status:'PASS',profiles,scope:'Actual app + isolated PostgreSQL, no live workshop writes; fixed-camera 3MF shading maps'},null,2));
}finally{await browser.close();await db.close();}
