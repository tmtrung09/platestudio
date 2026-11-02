import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';

const dir=new URL('../supabase/migrations/',import.meta.url);
const migration=readFileSync(new URL('202611020001_nonretryable_business_conflicts.sql',dir),'utf8');
const names=new Set();
for(const file of readdirSync(dir).filter(file=>file.endsWith('.sql'))){
  const text=readFileSync(new URL(file,dir),'utf8');
  const functions=[...text.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)];
  for(const [i,match] of functions.entries()){
    const definition=text.slice(match.index,functions[i+1]?.index??text.length);
    if(/\berrcode\s*=\s*'40001'/i.test(definition))names.add(match[1]);
  }
}
assert.equal(names.size,10,'Inventory every Plate Studio function with an explicit business-conflict 40001');
const db=new PGlite();
try{
  await db.exec(`create role authenticated;create role conflict_function_owner;create schema unrelated;
    create table protected_data(id integer primary key,data jsonb);
    insert into protected_data values(1,'{"pending":["unchanged"],"revision":"7"}');
    alter table protected_data enable row level security;
    create policy protect_rows on protected_data using(false);
    create function unrelated.commit_custom_order() returns void language plpgsql as $$begin
      raise exception 'unrelated serialization' using errcode='40001';end$$;
    create function public.qa_transient_failure() returns void language plpgsql as $$begin
      raise exception 'outside the business scope' using errcode='40001';end$$;`);
  for(const name of names)await db.exec(`create function public.${name}(value integer) returns integer
    language plpgsql stable security definer strict parallel restricted set search_path=public,pg_temp
    as $$begin if value<0 then raise exception 'business conflict; retain draft' using ERRCODE = '40001';end if;return value+1;end$$;
    alter function public.${name}(integer) owner to conflict_function_owner;
    revoke all on function public.${name}(integer) from public;
    grant execute on function public.${name}(integer) to authenticated;`);
  const metadata=async()=> (await db.query(`select p.oid::text, p.proname, p.proowner::text, p.proacl::text,
    p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.proconfig,p.prorettype::text,
    pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any($1::text[]) order by p.proname`,[[...names]])).rows;
  const original=await metadata();
  // Bound the documented PostgREST policy to three attempts so QA never loops.
  const attempts=async()=>{
    let count=0,code;
    do{count++;try{await db.query('select commit_kiot_mapping(-1)');break;}catch(error){code=error.code;}}
    while(code==='40001'&&count<3);
    return {count,code};
  };
  assert.deepEqual(await attempts(),{count:3,code:'40001'},'Baseline business conflict repeatedly requests a retry');
  await db.exec(migration);
  const patched=await metadata();
  for(const [index,row] of patched.entries()){
    const before=original[index];
    assert.equal(row.definition,before.definition.replace(/(errcode\s*=\s*)'40001'/gi,"$1'PT409'"),'Only the explicit business error code changes');
    const {definition:oldDefinition,...oldProperties}=before,{definition:newDefinition,...newProperties}=row;
    assert.deepEqual(newProperties,oldProperties,'OID, owner, ACL, security, return type and attributes stay intact');
    await assert.rejects(()=>db.query(`select ${row.proname}(-1)`),error=>error.code==='PT409');
    assert.equal((await db.query(`select ${row.proname}(3) result`)).rows[0].result,4);
  }
  assert.deepEqual(await attempts(),{count:1,code:'PT409'},'An HTTP-409 business conflict ends the transaction retry policy');
  await db.exec(migration);assert.deepEqual(await metadata(),patched,'Migration can be reapplied safely');
  await assert.rejects(()=>db.query('select unrelated.commit_custom_order()'),error=>error.code==='40001');
  await assert.rejects(()=>db.query('select qa_transient_failure()'),error=>error.code==='40001');
  assert.deepEqual((await db.query('select data from protected_data')).rows[0].data,{pending:['unchanged'],revision:'7'});
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='protected_data'::regclass")).rows[0].relrowsecurity,true);
  await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from protected_data'),/permission denied/);
  await assert.rejects(()=>db.query('select commit_kiot_mapping(-1)'),error=>error.code==='PT409');
  console.log('PASS business conflicts: bounded 40001 retry reproduction, all 10 functions return PT409, exact body/OID/owner/ACL/attributes preserved, idempotent migration, unrelated transient failures and business data untouched.');
}finally{await db.close();}
