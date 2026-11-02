-- Business conflicts are permanent until the caller reconciles its draft.
-- SQLSTATE 40001 means a transient serialization failure to PostgREST 14 and
-- can keep a single RPC retrying indefinitely. PT409 returns HTTP 409 instead.
-- Rebuild only these existing Plate Studio functions, changing the explicit
-- ERRCODE literal; CREATE OR REPLACE keeps their OIDs, ownership, ACL and callers.
do $migration$
declare
  fn record;
  definition text;
  patched text;
begin
  for fn in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname=any(array[
        'commit_kiot_sales_report','delete_kiot_sales_report',
        'commit_printer_monitor','guard_kiot_mapping_settings','commit_kiot_mapping',
        'guard_workshop_swipe','commit_workshop_swipe',
        'guard_workshop_swipe_shipped_stock','commit_custom_order',
        'guard_restored_model_parts'
      ])
    order by p.oid
  loop
    definition:=pg_get_functiondef(fn.oid);
    patched:=regexp_replace(definition,
      '(errcode[[:space:]]*=[[:space:]]*)''40001''',
      '\1''PT409''','gi');
    if patched is distinct from definition then execute patched;end if;
  end loop;
end
$migration$;
