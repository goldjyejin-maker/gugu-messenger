-- 구구메신저 업데이트 #3: 카테고리 이름 변경
-- SQL Editor 에 붙여넣어 한 번 실행하세요.
create or replace function public.rename_category(p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(trim(p_name)) = 0 then raise exception 'empty_name'; end if;
  update categories set name = left(trim(p_name), 20) where id = p_id;
end $$;
