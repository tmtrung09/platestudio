import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(),w='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const tray={id:'tray',name:'Khay',qtyPerModel:1,note:'Giữ khay'},keys={id:'keys',name:'Nút + ký tự',qtyPerModel:1,filamentIds:[],cost:123,extra:{retained:true}};
const guard={version:1,revision:'restoration-1',partIds:['keys'],states:{keys:'present'}};
const base={id:'keyboard',name:'Bàn phím tên',parts:[tray,keys],variants:[{id:'v',name:'5 chữ'}],images:['private-image'],partRestoreGuard:guard};
try{
 await db.exec(`create role authenticated;create table models(workspace_id uuid,id text,data jsonb,updated_at timestamptz default now(),primary key(workspace_id,id));grant select,insert,update on models to authenticated;`);
 await db.exec(readFileSync('supabase/migrations/202610310002_model_part_restore_guard.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/202610310003_model_part_guard_legacy_entries.sql','utf8'));
 const put=async(data,ws=w)=>db.query("insert into models(workspace_id,id,data) values($1,'keyboard',$2) on conflict(workspace_id,id) do update set data=excluded.data,updated_at=now()",[ws,JSON.stringify(data)]);
 const get=async(ws=w)=>(await db.query("select data from models where workspace_id=$1 and id='keyboard'",[ws])).rows[0].data;
 await put(base);await put({id:'keyboard',parts:[tray],untouched:true},other);await db.exec('set role authenticated');
 const stale={id:'keyboard',name:'Bàn phím tên',parts:[{...tray,note:'Mới ở máy cũ'}],variants:base.variants,images:base.images,desc:'Giữ sửa đổi độc lập'};
 await put(stale);let result=await get();assert.deepEqual(result.parts,[stale.parts[0],keys]);assert.equal(result.desc,stale.desc);assert.deepEqual(result.partRestoreGuard,guard);assert.deepEqual(result.images,base.images);
 const stamp=(await db.query("select updated_at from models where workspace_id=$1 and id='keyboard'",[w])).rows[0].updated_at;
 await put(stale);assert.deepEqual((await get()).parts,result.parts,'Repeated stale writes never remove the restoration');assert.deepEqual((await db.query("select updated_at from models where workspace_id=$1 and id='keyboard'",[w])).rows[0].updated_at,stamp,'Unchanged canonical content does not invalidate model revisions');
 await put({...stale,parts:[stale.parts[0],{...keys,cost:0}],partRestoreGuard:{...guard,revision:'old-revision'}});assert.deepEqual((await get()).parts[1],keys,'Stale protected fields do not overwrite the restored part');
 // A current client is still allowed to edit and delete the protected part.
 result=await get();await put({...result,parts:[result.parts[0],{...keys,cost:456}]});result=await get();assert.equal(result.parts[1].cost,456);
 await put({...result,parts:[result.parts[0]]});const removed=await get();assert.equal(removed.parts.length,1);assert.equal(removed.partRestoreGuard.states.keys,'removed');assert.notEqual(removed.partRestoreGuard.revision,guard.revision);
 await put(base);result=await get();assert.equal(result.parts.length,1,'Old complete snapshot cannot resurrect an intentional removal');assert.deepEqual(result.partRestoreGuard,removed.partRestoreGuard);
 // Re-addition after reading the current removal revision is also valid.
 await put({...result,parts:[result.parts[0],keys]});result=await get();assert.equal(result.parts.length,2);assert.equal(result.partRestoreGuard.states.keys,'present');assert.notEqual(result.partRestoreGuard.revision,removed.partRestoreGuard.revision);
 const stable=result;await assert.rejects(put({...stale,parts:[tray,{...keys,id:'different-key-id'}]}),/cùng tên/);assert.deepEqual(await get(),stable,'Conflicting identities roll back, never guess an ID');
 await assert.rejects(put({...stale,parts:null}),/đối chiếu/);assert.deepEqual(await get(),stable);
 assert.deepEqual(await get(other),{id:'keyboard',parts:[tray],untouched:true},'Other workspace unchanged');
 await put({id:'keyboard',parts:[],normalEdit:true},other);assert.deepEqual(await get(other),{id:'keyboard',parts:[],normalEdit:true},'Models without an explicit restore guard retain existing semantics');
 // A later explicit admin repair installs a fresh revision and full part body.
 await db.exec('reset role');await put(stale);assert.equal((await get()).parts.length,2,'Ordinary administrative snapshots are protected too');
 await db.exec("begin;set local plate_studio.part_restore='yes'");await put({...base,partRestoreGuard:{...guard,revision:'restoration-2'}});await db.exec('commit;set role authenticated');await put(stable);assert.equal((await get()).partRestoreGuard.revision,'restoration-2');assert.equal((await get()).parts[1].cost,123);
 await db.exec("begin;set local plate_studio.part_restore='yes'");await put(stale);assert.equal((await get()).parts.length,2,'Unprivileged clients cannot bypass protection with a setting');await db.exec('commit');
 const legacyPart={name:'Part cũ chưa có ID',note:'Giữ để đối chiếu'};await put({...stale,parts:[tray,legacyPart]});assert.deepEqual((await get()).parts,[tray,legacyPart,keys],'Unrelated legacy entries without IDs are retained for reconciliation');
 console.log('PASS restored model parts: legacy/repeated upserts, full part metadata, independent edits, acknowledged edit/delete/re-add, tombstones, conflict rollback, fresh admin revision, workspace isolation and unguarded compatibility');
}finally{await db.close();}
