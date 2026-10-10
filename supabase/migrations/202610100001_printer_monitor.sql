-- On-demand Bambu monitoring. No business stock/plate/report tables are mutated.
create or replace function public.can_read_printer_monitor(p_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_workspace_owner(p_workspace) or exists(select 1 from workspace_members
 where workspace_id=p_workspace and user_id=auth.uid() and
 (permissions ? 'progress.view' or permissions ? 'plates.plan'));
$$;
create table public.printer_cloud_connections(
 workspace_id uuid primary key references workspaces(id) on delete cascade,
 sealed_session jsonb not null, connected_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz);
create table public.printer_monitor_login_limits(workspace_id uuid primary key references workspaces(id) on delete cascade,last_email_at timestamptz not null);
alter table public.printer_monitor_login_limits enable row level security;
revoke all on public.printer_monitor_login_limits from public,anon,authenticated;
grant all on public.printer_monitor_login_limits to service_role;
create or replace function public.claim_printer_login_code(p_workspace uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into printer_monitor_login_limits(workspace_id,last_email_at) values(p_workspace,now())
 on conflict(workspace_id) do update set last_email_at=now()
 where printer_monitor_login_limits.last_email_at<now()-interval '60 seconds';
 return found;
end $$;
revoke all on function public.claim_printer_login_code(uuid) from public,anon,authenticated;
grant execute on function public.claim_printer_login_code(uuid) to service_role;
create table public.printer_monitor_states(
 workspace_id uuid primary key references workspaces(id) on delete cascade,
 data jsonb not null default '{"devices":{}}',updated_at timestamptz not null default now());
create table public.printer_monitor_events(
 seq bigint generated always as identity primary key,
 workspace_id uuid not null references workspaces(id) on delete cascade,
 id text not null,data jsonb not null,created_at timestamptz not null default now(),unique(workspace_id,id));
create index printer_monitor_events_workspace_seq on public.printer_monitor_events(workspace_id,seq desc);
create table public.printer_monitor_runs(
 workspace_id uuid not null references workspaces(id) on delete cascade,
 id text not null,data jsonb not null,linked_models jsonb not null default '[]',links_revision timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(workspace_id,id));
create index printer_monitor_runs_workspace_date on public.printer_monitor_runs(workspace_id,updated_at desc);
alter table public.printer_cloud_connections enable row level security;
alter table public.printer_monitor_states enable row level security;
alter table public.printer_monitor_events enable row level security;
alter table public.printer_monitor_runs enable row level security;
revoke all on public.printer_cloud_connections from anon,authenticated;
revoke all on public.printer_monitor_states,public.printer_monitor_events,public.printer_monitor_runs from anon,authenticated;
grant select on public.printer_monitor_states,public.printer_monitor_events,public.printer_monitor_runs to authenticated;
create policy printer_states_reader on public.printer_monitor_states for select to authenticated using(public.can_read_printer_monitor(workspace_id));
create policy printer_events_reader on public.printer_monitor_events for select to authenticated using(public.can_read_printer_monitor(workspace_id));
create policy printer_runs_reader on public.printer_monitor_runs for select to authenticated using(public.can_read_printer_monitor(workspace_id));
create or replace function public.claim_printer_monitor(p_workspace uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update printer_cloud_connections set lease_token=p_token,lease_until=now()+interval '105 seconds'
 where workspace_id=p_workspace and (lease_until is null or lease_until<now());
 return found;
end $$;
create or replace function public.commit_printer_monitor(p_workspace uuid,p_token uuid,p_state jsonb,p_events jsonb,p_runs jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
 perform 1 from printer_cloud_connections where workspace_id=p_workspace and lease_token=p_token and lease_until>now() for update;
 if not found then raise exception 'Phiên thu trạng thái đã hết hiệu lực' using errcode='40001';end if;
 insert into printer_monitor_states(workspace_id,data) values(p_workspace,p_state)
 on conflict(workspace_id) do update set data=excluded.data,updated_at=now();
 for item in select value from jsonb_array_elements(p_events) loop
  insert into printer_monitor_events(workspace_id,id,data) values(p_workspace,item->>'id',item)
  on conflict(workspace_id,id) do nothing;
 end loop;
 for item in select value from jsonb_array_elements(p_runs) loop
  insert into printer_monitor_runs(workspace_id,id,data) values(p_workspace,item->>'id',item)
  on conflict(workspace_id,id) do update set data=excluded.data,updated_at=now();
 end loop;
end $$;
revoke all on function public.claim_printer_monitor(uuid,uuid),public.commit_printer_monitor(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_printer_monitor(uuid,uuid),public.commit_printer_monitor(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
grant all on public.printer_cloud_connections,public.printer_monitor_states,public.printer_monitor_events,public.printer_monitor_runs to service_role;
grant usage,select on sequence public.printer_monitor_events_seq_seq to service_role;
