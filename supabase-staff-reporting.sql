-- Plate Studio: chạy SAU supabase-schema.sql và supabase-upgrade-storage.sql.
-- Tạo link QR cho nhân viên gửi ảnh báo cáo mà không cần mật khẩu.

create extension if not exists pgcrypto;

create table if not exists public.staff_access_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Xưởng in',
  token_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz not null default (now() + interval '180 days'),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.staff_access_tokens enable row level security;

-- Chỉ chủ workspace (không phải tài khoản anonymous) được xem/thu hồi link.
create policy "Owner manages staff access links" on public.staff_access_tokens for all to authenticated
  using (
    auth.uid() = owner_user_id
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is false
  )
  with check (
    auth.uid() = owner_user_id
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is false
  );

-- RPC trả về secret đúng một lần. Database chỉ giữ bản hash của secret.
create or replace function public.create_staff_access_token(p_label text default 'Xưởng in')
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Chỉ tài khoản quản lý mới tạo được liên kết nhân viên';
  end if;
  raw_token := encode(gen_random_bytes(24), 'hex');
  insert into public.staff_access_tokens (owner_user_id, label, token_hash)
  values (auth.uid(), left(coalesce(nullif(trim(p_label), ''), 'Xưởng in'), 80), encode(digest(raw_token, 'sha256'), 'hex'));
  return raw_token;
end;
$$;
grant execute on function public.create_staff_access_token(text) to authenticated;

-- Bật Anonymous Sign-Ins trong Supabase Dashboard > Authentication > Providers.
-- Đừng tạo policy Storage public cho nhân viên: ảnh được Edge Function tải lên bằng server secret.
