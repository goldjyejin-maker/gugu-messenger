-- 구구메신저 업데이트 #4: 채팅방 삭제 (방 멤버만, 1:1 대화는 제외)
create or replace function public.delete_channel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_id) then raise exception 'not_member'; end if;
  delete from channels where id = p_id and kind = 'channel';  -- 메시지·멤버는 cascade 로 함께 삭제
end $$;
