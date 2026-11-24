// Supabase Edge Function: 새 메시지를 같은 방 멤버들의 폰으로 푸시 알림 전송
// 배포 시 "Verify JWT" 는 끈다 (DB 트리거가 호출). 같은 메시지는 pushed 표시로 한 번만 전송된다.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

Deno.serve(async req => {
  try {
    const { message_id } = await req.json();
    if (typeof message_id !== 'string') return new Response('bad request', { status: 400 });
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 처음 호출한 한 번만 통과 (pushed=false → true)
    const { data: msg } = await sb.from('messages').update({ pushed: true })
      .eq('id', message_id).eq('pushed', false)
      .select('id,channel_id,user_id,text,attachments').maybeSingle();
    if (!msg) return new Response('skip');

    const [{ data: sender }, { data: chan }, { data: members }] = await Promise.all([
      sb.from('profiles').select('name').eq('id', msg.user_id).maybeSingle(),
      sb.from('channels').select('name,kind').eq('id', msg.channel_id).maybeSingle(),
      sb.from('channel_members').select('user_id').eq('channel_id', msg.channel_id),
    ]);
    const ids = (members ?? []).map(m => m.user_id).filter(i => i !== msg.user_id);
    if (!ids.length) return new Response('no recipients');
    const { data: subs } = await sb.from('push_subscriptions').select('endpoint,p256dh,auth').in('user_id', ids);

    const who = sender?.name ?? '새 메시지';
    const title = chan?.kind === 'channel' ? `# ${chan.name} · ${who}` : who;
    const text = (msg.text ?? '').trim();
    const body = text ? text.slice(0, 120) : (msg.attachments?.length ? '📎 파일을 보냈어요' : '새 메시지');
    const payload = JSON.stringify({ title, body, channelId: msg.channel_id, tag: msg.channel_id });

    // 알려진 푸시 서비스 주소로만 전송 (등록 시에도 검사하지만 한 번 더 확인)
    const ALLOWED = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
    await Promise.all((subs ?? []).filter(s => ALLOWED.test(s.endpoint)).map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint); // 해지된 기기 정리
      }
    }));
    return new Response('ok');
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
