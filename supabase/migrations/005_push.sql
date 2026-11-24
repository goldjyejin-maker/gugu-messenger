-- 구구메신저 업데이트 #5: 푸시 알림 (앱이 닫혀 있어도 새 메시지를 폰 알림으로 받기)
-- 순서: ① 이 SQL 실행 → ② Edge Function(send-push) 배포 → ③ Edge Function Secrets 3개 등록

-- 1) 알림 받을 기기 목록
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;   -- 정책 없음 = 앱에서 직접 읽기/쓰기 불가 (아래 함수로만)

create or replace function public.save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- 알려진 푸시 서비스 주소만 허용 (서버가 임의의 주소로 요청을 보내는 것을 방지)
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' then
    raise exception 'invalid_endpoint';
  end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.remove_push(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

-- 2) 메시지가 이미 알림으로 보내졌는지 표시 (같은 알림이 두 번 가지 않게)
alter table public.messages add column if not exists pushed boolean not null default true;
alter table public.messages alter column pushed set default false;

-- 3) 새 메시지가 들어오면 Edge Function 을 호출 (실패해도 메시지 전송에는 영향 없음)
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  begin
    perform net.http_post(
      url := 'https://rcfpleajnvzzmeqzjqtd.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('message_id', new.id)
    );
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages
  for each row execute function public.notify_push();
