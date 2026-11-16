-- 구구메신저 Supabase 스키마 (무료 플랜 사용 가능)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣어 실행하세요.

-- ───────── 테이블 ─────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  kind text not null check (kind in ('channel', 'dm')),
  is_public boolean not null default false, -- true: 새 가입자가 자동 참여 (공지사항 등)
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (channel_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  mentions uuid[] not null default '{}',
  attachments jsonb not null default '[]',  -- [{id,name,size,type,path}]
  reactions jsonb not null default '{}',    -- {"👍":["user-id",...]}
  created_at timestamptz not null default now()
);
create index if not exists messages_channel_time on public.messages (channel_id, created_at);

create table if not exists public.reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- ───────── 권한 확인 함수 (RLS 재귀 방지용 security definer) ─────────
create or replace function public.is_member(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from channel_members where channel_id = cid and user_id = auth.uid());
$$;

-- ───────── 가입 시 프로필 생성 + 공개 채널 자동 참여 ─────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)));
  insert into channel_members (channel_id, user_id)
  select id, new.id from channels where is_public;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── RLS ─────────
alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.reads enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);

drop policy if exists channels_read on public.channels;
create policy channels_read on public.channels for select to authenticated using (public.is_member(id));

drop policy if exists members_read on public.channel_members;
create policy members_read on public.channel_members for select to authenticated using (public.is_member(channel_id));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (public.is_member(channel_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(channel_id));
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated using (user_id = auth.uid());

drop policy if exists reads_own on public.reads;
create policy reads_own on public.reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────── RPC ─────────
create or replace function public.create_channel(p_name text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  insert into channels (name, kind, created_by) values (trim(p_name), 'channel', auth.uid()) returning id into cid;
  insert into channel_members (channel_id, user_id)
  select cid, x from unnest(array_append(p_members, auth.uid())) as x group by x;
  return cid;
end $$;

create or replace function public.open_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select c.id into cid from channels c
   where c.kind = 'dm'
     and exists (select 1 from channel_members where channel_id = c.id and user_id = auth.uid())
     and exists (select 1 from channel_members where channel_id = c.id and user_id = p_other)
     and (select count(*) from channel_members where channel_id = c.id) = case when p_other = auth.uid() then 1 else 2 end
   limit 1;
  if cid is null then
    insert into channels (name, kind, created_by) values ('', 'dm', auth.uid()) returning id into cid;
    insert into channel_members (channel_id, user_id)
    select cid, x from unnest(array[auth.uid(), p_other]) as x group by x;
  end if;
  return cid;
end $$;

create or replace function public.toggle_reaction(p_message uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare m messages; arr jsonb; me text := auth.uid()::text;
begin
  select * into m from messages where id = p_message;
  if m.id is null or not is_member(m.channel_id) then return; end if;
  arr := coalesce(m.reactions -> p_emoji, '[]'::jsonb);
  if arr ? me then
    arr := (select coalesce(jsonb_agg(v), '[]'::jsonb) from jsonb_array_elements_text(arr) v where v <> me);
  else
    arr := arr || to_jsonb(me);
  end if;
  update messages set reactions =
    case when jsonb_array_length(arr) = 0 then reactions - p_emoji else jsonb_set(reactions, array[p_emoji], arr, true) end
  where id = p_message;
end $$;

create or replace function public.unread_counts() returns table (channel_id uuid, n bigint)
language sql security definer stable set search_path = public as $$
  select m.channel_id, count(*)
  from messages m
  join channel_members cm on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
  left join reads r on r.channel_id = m.channel_id and r.user_id = auth.uid()
  where m.user_id <> auth.uid() and m.created_at > coalesce(r.last_read_at, 'epoch')
  group by m.channel_id;
$$;

-- ───────── 첨부 파일 저장소 (비공개 버킷, 채널 멤버만 접근) ─────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)  -- 25MB
on conflict (id) do nothing;

drop policy if exists att_read on storage.objects;
create policy att_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists att_write on storage.objects;
create policy att_write on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ───────── 실시간 구독 ─────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.channel_members;
alter publication supabase_realtime add table public.profiles;

-- ───────── 기본 채널 ─────────
insert into public.channels (name, kind, is_public)
select x, 'channel', true from (values ('공지사항'), ('자유게시판')) v(x)
where not exists (select 1 from public.channels where kind = 'channel' and is_public);
