// 서비스워커: 앱 셸 캐시(PWA) + 푸시 알림 표시
const CACHE = 'gugu-shell-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(ch => ch.put(r, c)); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match('./')))
  );
});

// 새 메시지 푸시 → 폰 알림. 앱 화면이 이미 열려 있으면 알림을 띄우지 않는다.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: '구구메신저', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible')) return;
    await self.registration.showNotification(d.title || '구구메신저', {
      body: d.body || '새 메시지가 있어요',
      icon: './icon-192.png', badge: './icon-192.png',
      tag: d.tag || 'gugu', renotify: true, data: { channelId: d.channelId || null },
    });
    if (self.navigator.setAppBadge) { try { await self.navigator.setAppBadge(); } catch { /* 지원 안 함 */ } }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins[0];
    if (w) { await w.focus(); w.postMessage({ type: 'open-channel', channelId: e.notification.data?.channelId }); }
    else await self.clients.openWindow('./' + (e.notification.data?.channelId ? '?c=' + e.notification.data.channelId : ''));
  })());
});
