import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite(),ws=randomUUID(),other=randomUUID();
await db.exec(`create role authenticated;create role anon;create role service_role;create table workspaces(id uuid primary key);insert into workspaces values('${ws}'),('${other}');`);
await db.exec(readFileSync('supabase/migrations/202610200002_printer_voice_cache.sql','utf8'));
const claim=async(hash,token=randomUUID(),workspace=ws)=>(await db.query('select claim_printer_voice($1,$2,$3) value',[workspace,hash,token])).rows[0].value;
const finish=async(hash,token,path)=>(await db.query('select finish_printer_voice($1,$2,$3,$4) value',[ws,hash,token,path])).rows[0].value;
const token=randomUUID(),hash='a'.repeat(64);
assert.equal(await claim(hash,token),'claimed');assert.equal(await claim(hash),'busy');
assert.equal(await finish(hash,randomUUID(),'wrong'),false,'A different producer cannot complete');
assert.equal(await finish(hash,token,'private/voice.wav'),true);assert.equal(await claim(hash),'ready');
let attempts=(await db.query('select attempts from printer_voice_budget where workspace_id=$1',[ws])).rows[0].attempts;assert.equal(attempts,1,'Cache hits and concurrent requests do not spend budget');
const failed='b'.repeat(64),failedToken=randomUUID();assert.equal(await claim(failed,failedToken),'claimed');assert.equal(await finish(failed,failedToken,null),true);assert.equal(await claim(failed),'busy','Failure backoff is retained');
await db.query("update printer_voice_cache set lease_until=now()-interval '1 second' where audio_hash=$1",[failed]);assert.equal(await claim(failed),'claimed','Retry is reserved again after backoff');
for(let i=0;i<24;i++)await claim(i.toString(16).padStart(64,'0'));
assert.equal(await claim('f'.repeat(64)),'quota');assert.equal(await claim(hash),'ready','Budget never blocks existing audio');assert.equal(await claim('f'.repeat(64),randomUUID(),other),'claimed','Budgets are workspace scoped');
assert.equal((await db.query('select attempts from printer_voice_budget where workspace_id=$1',[ws])).rows[0].attempts,24);
for(const role of ['anon','authenticated']){
 assert.equal((await db.query("select has_table_privilege($1,'printer_voice_cache','select') value",[role])).rows[0].value,false);
 assert.equal((await db.query("select has_function_privilege($1,'claim_printer_voice(uuid,text,uuid)','execute') value",[role])).rows[0].value,false);
}
await assert.rejects(()=>claim('caller-text'));
await db.close();console.log('PASS Enya SQL: private metadata, atomic reservations, cached retries, stale producer rejection, backoff and hard workspace budget.');
