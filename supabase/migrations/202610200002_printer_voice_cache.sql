-- Private generated audio metadata and an atomic, bounded generation budget.
create table public.printer_voice_cache (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 audio_hash text not null check(audio_hash ~ '^[a-f0-9]{64}$'),
 status text not null check(status in ('pending','ready','failed')),
 lease_token uuid, lease_until timestamptz, storage_path text,
 updated_at timestamptz not null default now(), primary key(workspace_id,audio_hash)
);
create table public.printer_voice_budget (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 utc_day date not null, attempts integer not null check(attempts between 0 and 24),
 primary key(workspace_id,utc_day)
);
alter table public.printer_voice_cache enable row level security;
alter table public.printer_voice_budget enable row level security;
revoke all on public.printer_voice_cache,public.printer_voice_budget from public,anon,authenticated;
grant all on public.printer_voice_cache,public.printer_voice_budget to service_role;
create function public.claim_printer_voice(p_workspace uuid,p_hash text,p_token uuid)
returns text language plpgsql security definer set search_path=public as $$
declare item printer_voice_cache%rowtype; used integer; today date=(now() at time zone 'UTC')::date;
begin
 if p_hash !~ '^[a-f0-9]{64}$' or p_token is null then raise exception 'Invalid voice reservation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,710));
 select * into item from printer_voice_cache where workspace_id=p_workspace and audio_hash=p_hash;
 if item.status='ready' then return 'ready';end if;
 if item.lease_until>now() then return 'busy';end if;
 select attempts into used from printer_voice_budget where workspace_id=p_workspace and utc_day=today;
 if coalesce(used,0)>=24 then return 'quota';end if;
 insert into printer_voice_budget values(p_workspace,today,1) on conflict(workspace_id,utc_day) do update set attempts=printer_voice_budget.attempts+1;
 insert into printer_voice_cache(workspace_id,audio_hash,status,lease_token,lease_until)
 values(p_workspace,p_hash,'pending',p_token,now()+interval '120 seconds')
 on conflict(workspace_id,audio_hash) do update set status='pending',lease_token=p_token,lease_until=now()+interval '120 seconds',updated_at=now();
 return 'claimed';
end $$;
create function public.finish_printer_voice(p_workspace uuid,p_hash text,p_token uuid,p_path text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update printer_voice_cache set status=case when p_path is null then 'failed' else 'ready' end,
 storage_path=p_path,lease_token=null,lease_until=case when p_path is null then now()+interval '15 seconds' else null end,updated_at=now()
 where workspace_id=p_workspace and audio_hash=p_hash and lease_token=p_token and status='pending' and lease_until>now();
 return found;
end $$;
revoke all on function public.claim_printer_voice(uuid,text,uuid),public.finish_printer_voice(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_printer_voice(uuid,text,uuid),public.finish_printer_voice(uuid,text,uuid,text) to service_role;
