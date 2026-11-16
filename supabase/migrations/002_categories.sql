-- 구구메신저 업데이트 #2: 카테고리(최대 3개)
-- 이미 schema.sql 을 실행한 프로젝트에서 SQL Editor 에 붙여넣어 한 번 실행하세요.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.channels add column if not exists category_id uuid references public.categories(id) on delete set null;

alter table public.categories enable row level security;
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to authenticated using (true);

-- 채널 생성: 카테고리 지정 추가 (기존 2개 인자 버전은 제거)
drop function if exists public.create_channel(text, uuid[]);
create or replace function public.create_channel(p_name text, p_members uuid[], p_category uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  insert into channels (name, kind, created_by, category_id) values (trim(p_name), 'channel', auth.uid(), p_category) returning id into cid;
  insert into channel_members (channel_id, user_id)
  select cid, x from unnest(array_append(p_members, auth.uid())) as x group by x;
  return cid;
end $$;

create or replace function public.create_category(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(trim(p_name)) = 0 then raise exception 'empty_name'; end if;
  if (select count(*) from categories) >= 3 then raise exception 'max_categories'; end if;
  insert into categories (name, position, created_by)
  values (trim(p_name), (select coalesce(max(position), 0) + 1 from categories), auth.uid()) returning id into cid;
  return cid;
end $$;

create or replace function public.delete_category(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from categories where id = p_id;   -- 소속 채널은 category_id 가 null 로 바뀜
end $$;

create or replace function public.set_channel_category(p_channel uuid, p_category uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_channel) then raise exception 'not_member'; end if;
  update channels set category_id = p_category where id = p_channel;
end $$;

alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.channels;
