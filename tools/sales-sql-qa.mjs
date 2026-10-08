// Runs real repository migrations against an ephemeral PostgreSQL WASM database.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite(),workspace=randomUUID(),user=randomUUID();
await db.exec(`create role authenticated;create role anon;create schema auth;
create table auth.users(id uuid primary key);create table public.workspaces(id uuid primary key);
insert into auth.users values('${user}');insert into workspaces values('${workspace}');
create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
create function public.is_workspace_member(id uuid) returns boolean language sql as $$ select id='${workspace}'::uuid $$;`);
for(const name of ['202609110001_kiot_sales_archive.sql','20260911171947_kiot_inventory_ledger.sql','202610080001_kiot_sales_atomic_commit.sql']){
 const sql=readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8').replace(/do \$\$ begin[\s\S]*?end \$\$;/g,'');await db.exec(sql);
}
const lines=[{sku:'A',quantity:2,revenue:20},{sku:'A',quantity:3,revenue:30}];
async function commit(request,revision=null,rows=lines,ws=workspace){return (await db.query('select id,report_day,updated_at::text from commit_kiot_sales_report($1,$2,$3,$4,$5,$6,$7,$8)',[ws,'2026-10-08',request,revision,'qa','test.xls','test',JSON.stringify(rows)])).rows[0];}
async function summary(){return (await db.query(`select (select quantity_total from kiot_sales_reports) qty,(select sum(quantity_delta) from kiot_inventory_movements) delta,(select count(*) from kiot_sales_report_lines)::int lines`)).rows[0];}
const request=randomUUID(),first=await commit(request);
assert.equal(Number((await summary()).qty),5);assert.equal(Number((await summary()).delta),-5);assert.equal((await summary()).lines,1);
const before=randomUUID(),after=randomUUID();
await db.exec(`insert into kiot_inventory_snapshots(id,workspace_id,user_id,observed_at) values
('${before}','${workspace}','${user}','2026-10-07T23:59:59+07'),('${after}','${workspace}','${user}','2026-10-09T00:00:00+07');
insert into kiot_inventory_snapshot_lines(snapshot_id,workspace_id,sku,observed_stock) values
('${before}','${workspace}','A',100),('${after}','${workspace}','A',95);
select refresh_kiot_sales_reconciliation('${workspace}');
update kiot_inventory_reconciliation_lines set status='resolved',resolution_note='Keep human note',resolved_by='${user}',resolved_at=now() where snapshot_id='${after}';
select refresh_kiot_sales_reconciliation('${workspace}');`);
assert.equal((await db.query('select status from kiot_inventory_reconciliation_lines where snapshot_id=$1',[after])).rows[0].status,'resolved');
await commit(request);assert.equal(Number((await summary()).delta),-5);
await assert.rejects(()=>commit(randomUUID()),e=>e.code==='40001');
await assert.rejects(()=>commit(randomUUID(),first.updated_at,[],randomUUID()),/quyền/);
await assert.rejects(()=>commit(randomUUID(),first.updated_at,[]),/rỗng/);
// Inject a ledger failure AFTER the report function wrote its replacement.
await db.exec(`create function fail_sales_ledger() returns trigger language plpgsql as $$ begin raise exception 'injected ledger failure'; end; $$;
create trigger qa_failure before insert on kiot_inventory_movements for each row execute function fail_sales_ledger();`);
await assert.rejects(()=>commit(randomUUID(),first.updated_at,[{sku:'B',quantity:99,revenue:1}]),/injected ledger failure/);
assert.equal(Number((await summary()).qty),5);assert.equal(Number((await summary()).delta),-5);
await db.exec('drop trigger qa_failure on kiot_inventory_movements');
const updated=await commit(randomUUID(),first.updated_at,[{sku:'B',quantity:20,revenue:200}]);
assert.equal(Number((await summary()).qty),20);assert.equal(Number((await summary()).delta),-20);
const reconciliation=(await db.query('select status,resolution_note from kiot_inventory_reconciliation_lines where snapshot_id=$1',[after])).rows[0];
assert.equal(reconciliation.resolution_note,'Keep human note');assert.equal(reconciliation.status,'open');
// An old successful request must not undo a later edit.
await commit(request);assert.equal(Number((await summary()).qty),20);
await assert.rejects(()=>db.query('select delete_kiot_sales_report($1,$2,$3)',[workspace,updated.id,first.updated_at]),e=>e.code==='40001');
await db.query('select delete_kiot_sales_report($1,$2,$3)',[workspace,updated.id,updated.updated_at]);
assert.equal((await db.query('select count(*)::int n from kiot_inventory_movements')).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from kiot_sales_reports')).rows[0].n,0);
// Retrying an old receipt after deletion cannot recreate the deleted report.
await commit(request);assert.equal((await db.query('select count(*)::int n from kiot_sales_reports')).rows[0].n,0);
await db.exec('set role authenticated');
await assert.rejects(()=>db.query('delete from kiot_sales_reports'),/permission denied/);
await assert.rejects(()=>db.query('select * from replace_kiot_sales_report($1,$2,$3,$4,$5,$6,$7,$8,$9)',[workspace,'2026-10-08','qa','test','',1,1,1,'[]']),/permission denied/);
await commit(randomUUID(),null,[{sku:'A',quantity:1,revenue:1}]);
await assert.rejects(()=>commit(randomUUID(),null,lines,randomUUID()),/quyền/);
await db.exec('reset role');
console.log('PASS SQL: atomic commit/rollback, duplicate SKU, retry, revision conflict, membership, empty input, atomic delete, no resurrection, human notes, old-client write guard');
await db.close();
