
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {waitForAppReady} from './app-ready-qa.mjs';

mkdirSync('qa-results/production-sync',{recursive:true});
const root=resolve('.'),origin='https://plate-sync-qa.test';
const tables=['models','filaments','projects','orders','plates','plate_items','settings','batch_reports'];
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'};
const db=new PGlite();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
const trace=[];
const id={a:randomUUID(),b:randomUUID(),w:randomUUID(),other:randomUUID(),viewer:randomUUID()};
const actorA={id:id.a,email:'a@fixture.test'},actorB={id:id.b,email:'b@fixture.test'},actorViewer={id:id.viewer,email:'viewer@fixture.test'};
const model={id:'model-a',name:'Đèn mẫu',parts:[{id:'base',name:'Đế',qtyPerModel:1,filamentIds:['green']},{id:'shade',name:'Chụp',qtyPerModel:1,filamentIds:['green']}],variants:[],images:[]};
const baseOrder={id:'fixture-order',note:'Đèn tại xưởng',createdAt:'2026-11-13T00:00:00Z',orderedBy:'QA',status:'processing',items:[{id:'line',modelId:model.id,qty:3}]};
const baseParts=model.parts.map(part=>({id:'pi-'+part.id,orderId:baseOrder.id,orderItemId:'line',modelId:model.id,partId:part.id,partName:part.name,plateId:'plate-fixture',filamentId:'green',qty:3,qtyDone:0}));
const basePlate={id:'plate-fixture',filamentId:'green',status:'waiting'};
const operations={qualityIssues:[],deliveryBatches:[],events:[],packagingTasks:{}};
let fault;
let sequence=0;
const clock=()=>new Date(Date.UTC(2026,10,14,2,0,0,++sequence)).toISOString();

async function initialize(){
  await db.exec(`
create role authenticated;
create role anon;
create schema auth;
create table workspaces(id uuid primary key,owner_user_id uuid);
create table workspace_members(workspace_id uuid,user_id uuid,permissions jsonb,role text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
create function is_workspace_owner(w uuid) returns boolean language sql stable security definer as $$select exists(select 1 from workspaces where id=w and owner_user_id=auth.uid())$$;
create function is_custom_counter_account(w uuid) returns boolean language sql stable security definer as $$select false$$;
grant usage on schema auth to authenticated,anon;
insert into workspaces values ('${id.w}','${id.a}'),('${id.other}','${id.a}');
insert into workspace_members values ('${id.w}','${id.b}','["orders.manage","assembly.qc","progress.view"]','manager'),('${id.w}','${id.viewer}','["progress.view"]','viewer');
`);
  for(const table of tables)await db.exec(`create table ${table}(id text,user_id uuid,workspace_id uuid,data jsonb not null,updated_at timestamptz default now(),primary key(id));
  alter table ${table} enable row level security;
  grant select,insert,update,delete on ${table} to authenticated;
  create policy qa_fixture_select on ${table} for select to authenticated using (is_workspace_owner(workspace_id) or workspace_id in (select workspace_id from workspace_members where user_id=auth.uid()));
  create policy qa_fixture_write on ${table} for all to authenticated using (is_workspace_owner(workspace_id) or workspace_id in (select workspace_id from workspace_members where user_id=auth.uid() and permissions ? 'orders.manage'));`);
  await db.exec('grant select on workspace_members to authenticated');
  for(const migration of ['202610260001_workshop_swipe.sql','202610260002_workshop_swipe_legacy_delivery_guard.sql','202611020001_nonretryable_business_conflicts.sql','202611140001_production_sync.sql']){
    await db.exec(readFileSync(resolve(root,'supabase/migrations',migration),'utf8'));
  }
}
async function seed({printed=false,empty=false,otherOwner=id.a}={}){
  fault=undefined;
  trace.length=0;
  await db.exec('truncate '+tables.join(',')+',workshop_swipe_receipts,production_sync_receipts,production_sync_order_deletions');
  await db.query('update workspaces set owner_user_id=$1 where id=$2',[otherOwner,id.other]);
  const rows={
    models:[model],
    filaments:[{id:'green',name:'Xanh',brand:'QA',hex:'#529368'}],
    settings:[{id:'operations',values:operations}]
  };
  if(!empty){
    const order=structuredClone(baseOrder);
    if(printed)order.assembly={status:'in_progress',items:{},handovers:{line:{handedAt:'2026-11-13T01:00:00Z',qcStatus:'pending'}}};
    rows.orders=[order];
    rows.plates=[basePlate];
    rows.plate_items=baseParts.map(part=>({...part,qtyDone:printed?part.qty:0}));
  }
  for(const [table,items] of Object.entries(rows)){
    for(const data of items)await db.query(`insert into ${table}(id,user_id,workspace_id,data,updated_at) values($1,$2,$3,$4,$5)`,[data.id,id.a,id.w,JSON.stringify(data),clock()]);
  }
}
async function inspect(table,workspace=id.w){
  return (await db.query(`select data from ${table} where workspace_id=$1 order by id`,[workspace])).rows.map(row=>row.data);
}
async function transport(actor,request){
  const {table,operation,filters={},rows,args,name}=request;
  if(operation==='rpc'){
    if(name==='commit_production_sync'){
      const batch=trace.length;
      const steps=args.changes.map(change=>({actor,name,requestId:args.request,table:change.table,operation:change.data===null?'delete':'upsert',workspace:args.w,ids:[change.id]}));
      trace.push(...steps);
      const active=steps.map(step=>fault?.(step));
      try{
        const result=await db.transaction(async tx=>{
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
          if(active.includes('before')){
            await tx.exec("create function pg_temp.qa_fail_part() returns trigger language plpgsql as $$begin raise exception 'QA: plate item write failed' using errcode='08006'; end $$; create trigger qa_fail_part before insert or update on plate_items for each row execute function pg_temp.qa_fail_part();");
          }
          await tx.exec('set local role authenticated');
          const reply=await tx.query('select commit_production_sync($1,$2,$3) result',[args.w,args.request,JSON.stringify(args.changes)]);
          return reply.rows[0].result;
        });
        if(active.includes('after'))return {error:{message:'QA: response lost after commit',code:'08006'}};
        return {data:result};
      }catch(error){
        trace[batch].error=error.code||error.message;trace[batch].message=error.message;
        return {error:{code:error.code,message:error.message,details:error.detail}};
      }
    }
    if(name==='get_batch_reports_page')return {data:[]};
    if(name==='get_workspace_sync_manifest')return {data:[]};
    if(name==='merge_kiot_settings')return {data:null};
    throw Error('Unexpected fixture RPC '+name);
  }
  assert.ok(tables.includes(table));
  const step={actor,table,operation,workspace:filters.workspace_id||rows?.[0]?.workspace_id,ids:rows?.map(row=>row.id)||filters.ids||[]};
  trace.push(step);
  const active=fault?.(step);
  if(active==='before'){
    step.fault=active;
    return {error:{message:'QA: connection lost before write',code:'08006'}};
  }
  try{
    const data=await db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
      await tx.exec('set local role authenticated');
      if(operation==='select'){
        const workspace=filters.workspace_id;
        assert.ok(workspace);
        const result=await tx.query(`select data,updated_at::text as updated_at from ${table} where workspace_id=$1 and ($2::text is null or id=$2) order by updated_at`,[workspace,filters.id||null]);
        return request.single?result.rows[0]||null:result.rows;
      }
      if(operation==='delete'){
        await tx.query(`delete from ${table} where workspace_id=$1 and id=any($2::text[])`,[filters.workspace_id,filters.ids]);
        return null;
      }
      assert.equal(operation,'upsert');
      for(const row of rows){
        await tx.query(`insert into ${table}(id,user_id,workspace_id,data,updated_at) values($1,$2,$3,$4,$5)
          on conflict(id) do update set data=excluded.data,updated_at=excluded.updated_at`,
        [row.id,row.user_id,row.workspace_id,JSON.stringify(row.data),clock()]);
      }
      return null;
    });
    if(active==='after'){
      step.fault=active;
      return {error:{message:'QA: response lost after commit',code:'08006'}};
    }
    return {data,error:null};
  }catch(error){
    step.error=error.code||error.message;
    return {error:{code:error.code,message:error.message}};
  }
}
async function device(actor,width){
  const context=await browser.newContext({viewport:{width,height:880},hasTouch:width<700,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort();
    const file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(relative(root,file).startsWith('..'))return route.abort();
    try{return route.fulfill({contentType:types[extname(file)]||'application/octet-stream',body:readFileSync(file)});}
    catch{return route.fulfill({status:404,body:''});}
  });
  let authenticatedActor=actor;
  await context.exposeBinding('qaTransport',(_source,request)=>transport(authenticatedActor.id,request));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  async function boot(workspace=id.w,{load=true,account=actor,owner=id.a}={}){
    authenticatedActor=account;
    await page.goto(origin+'/plate-studio.html',{waitUntil:'domcontentloaded'});
    await waitForAppReady(page);
    await page.addStyleTag({content:'#auth-ov{display:none!important}'});
    await page.evaluate(async ({actor,workspace,owner,load})=>{
      currentUser=actor;
      activeWorkspace={workspace_id:workspace,owner_user_id:owner,permissions:actor.email.startsWith('viewer@')&&owner!==actor.id?['progress.view']:['orders.manage','assembly.qc','progress.view']};
      cloudReady=false;
      loadingCloud=false;
      sb={
        from(table){
          const filters={};
          let operation='select',rows,single=false;
          return {
            select(){return this;},
            eq(key,value){filters[key]=value;return this;},
            order(){return this;},
            limit(){return this;},
            in(key,values){if(key!=='id')throw Error('Unexpected fixture filter '+key);filters.ids=values;return this;},
            delete(){operation='delete';return this;},
            upsert(value){operation='upsert';rows=value;return this;},
            maybeSingle(){single=true;return this;},
            then(resolve,reject){return qaTransport({table,operation,filters,rows,single}).then(resolve,reject);}
          };
        },
        rpc(name,args){return qaTransport({operation:'rpc',name,args});}
      };
      maybeStartPageGuide=()=>{};
      setCloudLoadingOverlay(false);
      setCardContentLoading(false);
      if(load)await loadCloudData();
      cloudReady=true;
      goPage('orders',{historyMode:'replace'});
      setSyncState(cloudSyncConflict?'Đồng bộ cần đối chiếu':'Đã đồng bộ',cloudSyncConflict?'err':'ok');
    },{actor:account,workspace,owner,load});
  }
  async function flush(){
    return page.evaluate(async()=>{
      clearTimeout(cloudSyncTimer);
      await processCloudOutbox();
      clearTimeout(cloudRetryTimer);
      return {pending:cloudOutbox.length,attempts:cloudOutbox[0]?.attempts||0,status:document.getElementById('sync-state').textContent};
    });
  }
  async function refresh(...keys){
    return page.evaluate(async keys=>{
      keys.forEach(key=>remoteRefreshTables.add(key));
      remoteDataRefreshPending=true;
      const applied=await applyRemoteDataRefresh();
      clearTimeout(remoteRefreshWatchTimer);
      return applied;
    },keys);
  }
  return {actor,page,context,boot,flush,refresh,errors};
}
async function edit(client,changes){
  const {page}=client;
  await page.evaluate(()=>{cloudReady=false;openEditOrder('fixture-order');});
  if(changes.note!==undefined)await page.locator('#eo-note').fill(changes.note);
  if(changes.deliveryDate!==undefined)await page.locator('#eo-delivery').fill(changes.deliveryDate);
  if(changes.status!==undefined)await page.locator('#eo-status').selectOption(changes.status);
  // Start the real outbox without letting its timer race the two clients.
  await page.evaluate(()=>{cloudReady=true;saveEditOrder();clearTimeout(cloudSyncTimer);});
}
async function create(client,note){
  const {page}=client;
  await page.evaluate(()=>{cloudReady=false;openOrderForm('model-a');});
  const checkout=page.getByRole('button',{name:'Thanh toán',exact:true});
  if(await checkout.count())await checkout.click();
  await page.locator('#of-o-note').fill(note);
  await page.locator('#of-btn-confirm').click();
  await page.locator('#of-done-ov').waitFor();
  const local=await page.evaluate(()=>({order:orders.find(order=>order.note===document.getElementById('of-o-note').value),pending:cloudOutbox.length}));
  assert.equal(local.pending,1);
  return local.order.id;
}
async function run(name,scenario,options){
  if(process.env.PLATE_SYNC_CASE&&!name.includes(process.env.PLATE_SYNC_CASE))return;
  await seed(options);
  const a=await device(actorA,426),b=await device(actorB,1440);
  try{
    await a.boot();
    await b.boot();
    const observed=await scenario(a,b);
    assert.deepEqual([...a.errors,...b.errors],[]);
    results.push({name,status:'pass',observed});
    console.log('PASS',name);
  }catch(error){
    results.push({name,status:'fail',observed:error.actual,expected:error.expected,error:error.message});
    await a.page.screenshot({path:resolve('qa-results/production-sync',name+'-mobile.png'),animations:'disabled'}).catch(()=>{});
    await b.page.screenshot({path:resolve('qa-results/production-sync',name+'-desktop.png'),animations:'disabled'}).catch(()=>{});
    console.log('FAIL',name,error.message);
  }finally{
    writeFileSync(resolve('qa-results/production-sync',name+'-requests.json'),JSON.stringify(trace,null,2));
    await a.context.close();await b.context.close();
    writeFileSync('qa-results/production-sync/summary.json',JSON.stringify(results,null,2));
  }
}

try{
 await initialize();
 await run('offline-new-order-reload-reconnect',async(a,b)=>{
   const newId=await create(a,'Đơn tạo lúc ngoại tuyến');
   assert.equal((await inspect('orders')).length,0);
   await a.boot();
   assert.equal(await a.page.evaluate(id=>orders.some(order=>order.id===id),newId),true);
   assert.equal((await a.flush()).pending,0);
   assert.equal(await b.refresh('orders','plates','pitems'),true);
   const state=await b.page.evaluate(id=>({orders:orders.filter(order=>order.id===id).length,parts:pitems.filter(part=>part.orderId===id).length,plates:plates.length}),newId);
   assert.deepEqual(state,{orders:1,parts:2,plates:1});
   return state;
 },{empty:true});
 await run('lost-ack-retry-same-record',async(a,b)=>{
   const newId=await create(a,'Đơn mất phản hồi sau ghi');
   await a.page.evaluate(()=>{cloudReady=true;});
   let lost=false;
   fault=step=>step.actor===id.a&&step.operation==='upsert'&&step.table==='orders'&&!lost?(lost=true,'after'):null;
   assert.equal((await a.flush()).pending,1);
   assert.equal((await inspect('orders')).filter(order=>order.id===newId).length,1);
   await a.boot();
   assert.equal((await a.flush()).pending,0);
   assert.equal((await inspect('orders')).filter(order=>order.id===newId).length,1);
   assert.equal(await b.refresh('orders','plates','pitems'),true);
   return {orders:(await inspect('orders')).length,parts:(await inspect('plate_items')).length,lost};
 },{empty:true});
 await run('order-and-parts-remote-partial',async(a,b)=>{
   const newId=await create(a,'Đơn lỗi giữa hai bảng');
   await a.page.evaluate(()=>{cloudReady=true;});
   fault=step=>step.actor===id.a&&step.operation==='upsert'&&step.table==='plate_items'?'before':null;
   assert.equal((await a.flush()).pending,1);
   await b.refresh('orders','plates','pitems');
   const mid=await b.page.evaluate(id=>({orders:orders.filter(order=>order.id===id).length,parts:pitems.filter(part=>part.orderId===id).length}),newId);
   fault=undefined;
   assert.equal((await a.flush()).pending,0);
   await b.refresh('orders','plates','pitems');
   const end=await b.page.evaluate(id=>({orders:orders.filter(order=>order.id===id).length,parts:pitems.filter(part=>part.orderId===id).length}),newId);
   assert.deepEqual(end,{orders:1,parts:2});
   assert.deepEqual({mid,end},{mid:{orders:0,parts:0},end:{orders:1,parts:2}},'Second device must not see an incomplete order while the parts write is failing');
   return {mid,end};
 },{empty:true});
 await run('unrelated-offline-order-replays-old-snapshot',async(a,b)=>{
   await edit(b,{note:'Ghi chú mới từ thiết bị B'});
   assert.equal((await b.flush()).pending,0);
   const newId=await create(a,'Đơn khác đang chờ trên A');
   await a.boot();
   assert.equal((await a.flush()).pending,0);
   const list=await inspect('orders');
   const state={existingOrder:list.find(order=>order.id==='fixture-order')?.note,addedOrder:list.some(order=>order.id===newId)};
   assert.deepEqual(state,{existingOrder:'Ghi chú mới từ thiết bị B',addedOrder:true},'Submitting a different order after reload must preserve newer fields on the existing order');
   return state;
 });
 await run('same-order-different-fields',async(a,b)=>{
   await edit(a,{note:'Ghi chú do A cập nhật'});
   await edit(b,{deliveryDate:'2026-11-20'});
   assert.equal((await a.flush()).pending,0);
   assert.equal((await b.flush()).pending,0);
   const [order]=await inspect('orders');
   const state={note:order.note,date:order.deliveryDate};
   assert.deepEqual(state,{note:'Ghi chú do A cập nhật',date:'2026-11-20'},'Independent fields from different devices should both survive or prompt for reconciliation');
   return state;
 });
 await run('same-order-same-field',async(a,b)=>{
   await edit(a,{note:'Tên của A'});
   await edit(b,{note:'Tên của B'});
   await a.flush();
   const second=await b.flush();
   const [order]=await inspect('orders');
   const state={server:order.note,pending:second.pending};
   assert.deepEqual(state,{server:'Tên của A',pending:1},'Concurrent update of the same field should keep the server value and surface a pending conflict');
   return state;
 });
 await run('resolve-conflict-after-reload',async(a,b)=>{
   await edit(a,{note:'Bản ghi chú cloud',deliveryDate:'2026-11-20'});
   await edit(b,{note:'Bản ghi chú trên máy'});
   assert.equal((await a.flush()).pending,0);
   assert.equal((await b.flush()).pending,1);
   const rpcCount=trace.filter(row=>row.actor===id.b&&row.name==='commit_production_sync').length;
   await b.boot();
   assert.equal((await b.flush()).pending,1);
   assert.equal(trace.filter(row=>row.actor===id.b&&row.name==='commit_production_sync').length,rpcCount);
   await b.page.locator('#cloud-activity-trigger').click({timeout:5000});
   await b.page.locator('#cloud-review-action').click();
   const dialog=b.page.locator('#dlg-production-conflict');
   await dialog.waitFor();
   const copy=await dialog.innerText();
   assert.match(copy,/Bản ghi chú cloud/);
   assert.match(copy,/Bản ghi chú trên máy/);
   await dialog.screenshot({path:'qa-results/production-sync/reconciliation.png',animations:'disabled'});
   await dialog.getByRole('button',{name:'Giữ bản trên máy'}).click();
   await dialog.waitFor({state:'hidden'});
   const after=await b.flush();
   assert.equal(after.pending,0,JSON.stringify(after));
   const [order]=await inspect('orders');
   assert.equal(order.note,'Bản ghi chú trên máy');
   assert.equal(order.deliveryDate,'2026-11-20');
   return {note:order.note,date:order.deliveryDate};
 });
 await run('undo-own-confirmed-order-delete',async(a,b)=>{
   const snapshot=await a.page.evaluate(()=>systemUndoSnapshot());
   a.page.once('dialog',dialog=>dialog.accept());
   await a.page.evaluate(()=>{deleteOrder('fixture-order');clearTimeout(cloudSyncTimer);});
   assert.equal((await a.flush()).pending,0);
   assert.equal((await inspect('orders')).length,0);
   await a.page.evaluate(snapshot=>applySystemUndoSnapshot(snapshot),snapshot);
   assert.equal((await a.flush()).pending,0);
   const state={orders:(await inspect('orders')).length,parts:(await inspect('plate_items')).length};
   assert.deepEqual(state,{orders:1,parts:2});
   return state;
 });
 await run('legacy-outbox-is-quarantined-and-account-draft-migrates',async(a,b)=>{
   await a.boot(id.w,{load:false});
   await a.page.evaluate(()=>{
     localStorage.setItem(CLOUD_CACHE_SCOPE_KEY,JSON.stringify({workspace:cloudWorkspaceId(),complete:true}));
     localStorage.setItem(K.syncOutbox,JSON.stringify([{id:'legacy-pending'}]));
     localStorage.setItem(K.orders,JSON.stringify([{id:'legacy-unconfirmed',note:'Đơn cũ chưa lưu'}]));
     localStorage.setItem(ORDER_DRAFT_LOCAL_PREFIX+':'+currentUser.id,JSON.stringify({
       accountId:currentUser.id,cart:[{id:'draft',modelId:'model-a',qty:2}],form:{note:'Nháp đã biết tài khoản'}
     }));
     localStorage.removeItem(CLOUD_LEGACY_RECOVERY_PREFIX+activeCloudStorageScope());
   });
   await a.boot();
   const view=await a.page.evaluate(()=>({draft:loadLocalOrderDraft()?.form.note,legacy:legacyWorkspaceOutbox()?.length,pending:cloudOutbox.length,
     visible:orders.map(row=>row.id),old:JSON.parse(localStorage.getItem(K.orders))[0].id}));
   assert.deepEqual(view,{draft:'Nháp đã biết tài khoản',legacy:1,pending:0,visible:['fixture-order'],old:'legacy-unconfirmed'});
   await a.boot(id.other);
   assert.equal(await a.page.evaluate(()=>legacyWorkspaceOutbox()),null);
   assert.equal(await a.page.evaluate(()=>loadLocalOrderDraft()),null);
   return view;
 });
 await run('stale-regular-order-restores-delete',async(a,b)=>{
   await edit(b,{note:'Thay đổi khi B mất mạng'});
   a.page.once('dialog',dialog=>dialog.accept());
   await a.page.evaluate(()=>{deleteOrder('fixture-order');clearTimeout(cloudSyncTimer);});
   assert.equal((await a.flush()).pending,0);
   assert.equal((await inspect('orders')).length,0);
   assert.equal((await inspect('plate_items')).length,0);
   await b.flush();
   const state={orders:(await inspect('orders')).length,parts:(await inspect('plate_items')).length};
   assert.deepEqual(state,{orders:0,parts:0},'A stale edit must not restore a deleted order');
   return state;
 });
 await run('stale-delete-keeps-concurrently-added-parts',async(a,b)=>{
   a.page.once('dialog',dialog=>dialog.accept());
   await a.page.evaluate(()=>{deleteOrder('fixture-order');clearTimeout(cloudSyncTimer);});
   await b.page.evaluate(()=>{
     pitems.push({...pitems[0],id:'new-allocation'});
     sv(K.pitems,pitems);
     clearTimeout(cloudSyncTimer);
   });
   assert.equal((await b.flush()).pending,0);
   assert.ok((await a.flush()).pending>0);
   assert.equal(await a.page.evaluate(()=>cloudSyncConflict?.code),'PT409');
   const state={orders:(await inspect('orders')).length,parts:(await inspect('plate_items')).length};
   assert.deepEqual(state,{orders:1,parts:3});
   return state;
 });
 await run('offline-delete-reload',async(a,b)=>{
   a.page.once('dialog',dialog=>dialog.accept());
   await a.page.evaluate(()=>{deleteOrder('fixture-order');clearTimeout(cloudSyncTimer);});
   assert.equal(await a.page.evaluate(()=>orders.length),0);
   await a.boot();
   assert.ok(await a.page.evaluate(()=>cloudOutbox.length>0));
   await a.flush();
   await b.refresh('orders','plates','pitems');
   const state={orders:(await inspect('orders')).length,parts:(await inspect('plate_items')).length,deviceB:await b.page.evaluate(()=>orders.length)};
   assert.deepEqual(state,{orders:0,parts:0,deviceB:0},'A queued deletion must survive reload and reach the server');
   return state;
 });
 await run('switch-workspace-pending-order',async(a,b)=>{
   const newId=await create(a,'Chỉ thuộc xưởng gốc');
   await a.boot(id.other);
   const beforeSend=await a.page.evaluate(id=>({visible:orders.some(order=>order.id===id),pending:cloudOutbox.length}),newId);
   await a.flush();
   const state={...beforeSend,sentToOtherWorkspace:(await inspect('orders',id.other)).some(order=>order.id===newId)};
   await a.boot();
   assert.equal(await a.page.evaluate(id=>orders.some(order=>order.id===id),newId),true,'Original cache survives switching');
   assert.equal(await a.page.evaluate(()=>cloudOutbox.length),1);
   assert.deepEqual(state,{visible:false,pending:0,sentToOtherWorkspace:false},'The same account must not expose or replay a pending order in its other workspace');
   return state;
 },{empty:true});
 await run('switch-account-pending-order',async(a,b)=>{
   const newId=await create(a,'Đơn của tài khoản A chờ gửi');
   await a.boot(id.other,{account:actorViewer,owner:id.viewer});
   const beforeSend=await a.page.evaluate(id=>({visible:orders.some(order=>order.id===id),pending:cloudOutbox.length}),newId);
   await a.flush();
   const state={...beforeSend,sentToOtherWorkspace:(await inspect('orders',id.other)).some(order=>order.id===newId)};
   await a.boot();
   assert.equal(await a.page.evaluate(id=>orders.some(order=>order.id===id),newId),true,'Original cache survives switching');
   assert.equal(await a.page.evaluate(()=>cloudOutbox.length),1);
   assert.deepEqual(state,{visible:false,pending:0,sentToOtherWorkspace:false},'Changing account on the same browser must preserve the isolation of unsent orders');
   return state;
 },{empty:true,otherOwner:id.viewer});
 await run('different-orders-independent-sends',async(a,b)=>{
   const first=await create(a,'Đơn A');
   const second=await create(b,'Đơn B');
   assert.notEqual(first,second);
   await a.page.evaluate(()=>{cloudReady=true;});
   await b.page.evaluate(()=>{cloudReady=true;});
   assert.equal((await a.flush()).pending,0);
   assert.equal((await b.flush()).pending,0);
   const orders=await inspect('orders'),parts=await inspect('plate_items');
   const state={orders:orders.length,parts:parts.length,partTotals:[first,second].map(id=>parts.filter(part=>part.orderId===id).length)};
   assert.deepEqual(state,{orders:2,parts:4,partTotals:[2,2]});
   return state;
 },{empty:true});
 await run('queued-refresh-keeps-edit-form',async(a,b)=>{
   await b.page.evaluate(()=>openEditOrder('fixture-order'));
   await b.page.locator('#eo-note').fill('Nháp chưa lưu trên B');
   await edit(a,{deliveryDate:'2026-11-20'});
   assert.equal((await a.flush()).pending,0);
   assert.notEqual(await b.refresh('orders'),true);
   assert.equal(await b.page.locator('#eo-note').inputValue(),'Nháp chưa lưu trên B');
   assert.equal(await b.page.evaluate(()=>remoteRefreshTables.has('orders')),true);
   await b.page.getByRole('button',{name:'Huỷ',exact:true}).click();
   assert.equal(await b.refresh('orders'),true);
   const state=await b.page.evaluate(()=>({note:orders[0].note,delivery:orders[0].deliveryDate}));
   assert.deepEqual(state,{note:baseOrder.note,delivery:'2026-11-20'});
   return state;
 });
 await run('viewer-cannot-create',async(a,b)=>{
   const viewer=await device(actorViewer,426);
   try{
     await viewer.boot();
     await viewer.page.evaluate(()=>openOrderForm('model-a'));
     await viewer.page.evaluate(()=>submitOrder());
     const state={orders:(await inspect('orders')).length,viewerWrites:trace.filter(row=>row.actor===id.viewer&&row.operation==='upsert').length,canManage:await viewer.page.evaluate(()=>canAccess('orders.manage'))};
     assert.deepEqual(state,{orders:1,viewerWrites:0,canManage:false});
     assert.deepEqual(viewer.errors,[]);
     return state;
   }finally{await viewer.context.close();}
 });
 await run('stale-generic-save-keeps-workshop-part-state',async(a,b)=>{
   await edit(b,{note:'Ghi chú từ phiên trước QC'});
   const payload={orderId:'fixture-order',itemId:'line',partId:'base',filamentId:'green',from:'qc',to:'ready',qty:2,revision:0};
   await db.transaction(async tx=>{
     await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id.a]);
     await tx.exec('set local role authenticated');
     await tx.query('select commit_workshop_swipe($1,$2,$3)',[id.w,randomUUID(),JSON.stringify(payload)]);
   });
   assert.equal((await b.flush()).pending,0);
   const [order]=await inspect('orders');
   const part=Object.values(order.assembly.partWork).find(row=>row.partId==='base');
   const state={note:order.note,qc:part.qc,ready:part.ready,revision:part.revision};
   assert.deepEqual(state,{note:'Ghi chú từ phiên trước QC',qc:1,ready:2,revision:1});
   return state;
 },{printed:true});
 await run('workshop-same-revision-and-replay',async(a,b)=>{
   const requestId=randomUUID(),payload={orderId:'fixture-order',itemId:'line',partId:'base',filamentId:'green',from:'qc',to:'ready',qty:1,revision:0};
   const call=(actor,request,body)=>db.transaction(async tx=>{
     await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
     await tx.exec('set local role authenticated');
     return (await tx.query('select commit_workshop_swipe($1,$2,$3) as result',[id.w,request,JSON.stringify(body)])).rows[0].result;
   });
   const first=await call(id.a,requestId,payload);
   await assert.rejects(()=>call(id.b,randomUUID(),payload),e=>e.code==='PT409');
   const replay=await call(id.a,requestId,payload);
   assert.deepEqual(replay.order.assembly.partWork,first.order.assembly.partWork);
   await assert.rejects(()=>call(id.viewer,randomUUID(),{...payload,revision:1}),e=>e.code==='42501');
   await b.refresh('orders','pitems','settings');
   const state=await b.page.evaluate(()=>Object.values(orders[0].assembly.partWork).map(row=>[row.partId,row.qc,row.ready,row.revision]).sort());
   assert.deepEqual(state,[['base',2,1,1],['shade',3,0,0]]);
   return state;
 },{printed:true});
}finally{
 await browser.close();await db.close();
}
process.exitCode=results.some(row=>row.status==='fail')?1:0;
