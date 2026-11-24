import type { MessengerAdapter } from './types';

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'checking' | 'unsupported' | 'need-install' | 'denied' | 'off' | 'on';

const b64 = (s: string) => {
  const p = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const ab = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '');
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

async function reg() { return navigator.serviceWorker.getRegistration().then(r => r ?? navigator.serviceWorker.ready); }

export async function pushState(): Promise<PushState> {
  if (!KEY || !('serviceWorker' in navigator) || !('Notification' in window)) return isIos() && !standalone() && KEY ? 'need-install' : 'unsupported';
  if (!('PushManager' in window)) return isIos() && !standalone() ? 'need-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const sub = await (await reg()).pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** 알림을 켤 수 없을 때 화면에 보여 줄 진단 문구 */
export function pushDebug(): string {
  const f = (b: boolean) => (b ? 'O' : 'X');
  return `키${f(!!KEY)} 서비스워커${f('serviceWorker' in navigator)} 알림${f('Notification' in window)} 푸시${f('PushManager' in window)} 홈화면앱${f(standalone())} iOS${f(isIos())}`;
}

function toRow(sub: PushSubscription) {
  return { endpoint: sub.endpoint, p256dh: ab(sub.getKey('p256dh')), auth: ab(sub.getKey('auth')) };
}

/** 알림 켜기: 반드시 버튼을 누른 직후(사용자 동작)에 호출해야 권한 창이 뜬다 */
export async function enablePush(adapter: MessengerAdapter): Promise<void> {
  if (!KEY) throw new Error('알림 설정이 아직 준비되지 않았어요');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림이 허용되지 않았어요. 폰 설정에서 이 앱의 알림을 허용해 주세요');
  const r = await reg();
  const sub = (await r.pushManager.getSubscription()) ?? await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(KEY) });
  await adapter.savePush(toRow(sub));
}

export async function disablePush(adapter: MessengerAdapter): Promise<void> {
  const sub = await (await reg()).pushManager.getSubscription();
  if (sub) { await adapter.savePush(null, sub.endpoint); await sub.unsubscribe(); }
}

/** 로그아웃할 때: 서버의 '이 기기 → 이 계정' 연결만 끊는다 (브라우저 알림 허용은 유지, 다음 로그인 때 다시 연결) */
export async function detachPush(adapter: MessengerAdapter): Promise<void> {
  try {
    if (!KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const sub = await (await reg()).pushManager.getSubscription();
    if (sub) await adapter.savePush(null, sub.endpoint);
  } catch { /* 로그아웃은 막지 않는다 */ }
}

/** 이미 허용된 기기는 로그인할 때마다 조용히 다시 등록 (계정 전환·구독 갱신 대비) */
export async function resyncPush(adapter: MessengerAdapter): Promise<void> {
  try {
    if (!KEY || !('PushManager' in window) || Notification.permission !== 'granted') return;
    const sub = await (await reg()).pushManager.getSubscription();
    if (sub) await adapter.savePush(toRow(sub));
  } catch { /* 무시 */ }
}

export const clearBadge = () => { try { (navigator as { clearAppBadge?: () => Promise<void> }).clearAppBadge?.(); } catch { /* 무시 */ } };
