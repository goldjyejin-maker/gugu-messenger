import { useCallback, useEffect, useRef, useState } from 'react';
import { createAdapter } from './adapters';
import type { Channel, Message, User } from './types';
import Login from './components/Login';
import Sidebar, { dmName } from './components/Sidebar';
import Chat from './components/Chat';
import RightPanel from './components/RightPanel';
import InstallTip from './components/InstallTip';
import { clearBadge, detachPush, disablePush, enablePush, pushState, resyncPush, type PushState } from './push';

const adapter = createAdapter();
type Tab = 'members' | 'files' | 'search';
const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 760px)') : null;

export default function App() {
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<Tab | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  // 모바일: 처음엔 대화 목록 화면, 대화를 고르면 대화 화면(뒤로 가기 = 목록)
  const [navOpen, setNavOpen] = useState(!!mq?.matches);
  const [toast, setToast] = useState('');

  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  const fail = (e: unknown) => { setToast((e as Error).message ?? String(e)); setTimeout(() => setToast(''), 4000); };

  const refresh = useCallback(async () => {
    try {
      const [u, c, n] = await Promise.all([adapter.listUsers(), adapter.listChannels(), adapter.unreadCounts()]);
      setUsers(u); setChannels(c);
      const cur = activeRef.current;
      if (cur && c.some(x => x.id === cur)) {
        setMessages(await adapter.listMessages(cur));
        if (n[cur]) { await adapter.markRead(cur); delete n[cur]; }
      }
      setUnread(n);
    } catch (e) { fail(e); }
  }, []);

  useEffect(() => { adapter.restoreSession().then(setMe).finally(() => setBooting(false)); }, []);

  // 로그인 후: 실시간 구독 (이벤트가 몰려도 한 번만 새로고침)
  useEffect(() => {
    if (!me) return;
    void refresh();
    let t: number | undefined;
    const off = adapter.subscribe(() => { window.clearTimeout(t); t = window.setTimeout(() => void refresh(), 150); });
    return () => { off(); window.clearTimeout(t); };
  }, [me, refresh]);

  // 푸시 알림: 상태 확인, 이미 허용된 기기는 조용히 재등록, 앱을 열면 아이콘 배지 지움
  const [push, setPush] = useState<PushState>('unsupported');
  useEffect(() => {
    if (!me || adapter.kind === 'mock') return;
    void resyncPush(adapter).then(pushState).then(setPush);
    clearBadge();
    const vis = () => { if (document.visibilityState === 'visible') clearBadge(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [me]);
  const togglePush = async () => {
    try {
      if (push === 'on') await disablePush(adapter); else await enablePush(adapter);
      setPush(await pushState());
    } catch (e) { fail(e); setPush(await pushState()); }
  };

  // 알림을 눌러 앱을 열면 해당 대화방으로 이동
  useEffect(() => {
    if (!me) return;
    const go = (id: string | null | undefined) => { if (id) { setActiveId(id); setFocusId(null); setNavOpen(false); } };
    go(new URLSearchParams(location.search).get('c'));
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'open-channel') go(e.data.channelId); };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, [me]);

  // 기본으로 첫 채널 선택
  useEffect(() => {
    if (me && !activeId && channels.length && !mq?.matches) setActiveId(channels[0].id);
  }, [me, activeId, channels]);

  useEffect(() => {
    if (!me || !activeId) return;
    setMessages([]);
    void refresh();
  }, [activeId, me, refresh]);

  // 탭 제목에 안 읽은 수 표시
  useEffect(() => {
    const n = Object.values(unread).reduce((a, b) => a + b, 0);
    document.title = (n ? `(${n}) ` : '') + '구구메신저';
  }, [unread]);

  if (booting) return <div className="login-wrap"><div className="muted">불러오는 중…</div></div>;
  if (!me) return <Login adapter={adapter} onDone={() => adapter.restoreSession().then(setMe)} />;

  const active = channels.find(c => c.id === activeId) ?? null;
  const chanName = (c: Channel) => (c.kind === 'dm' ? dmName(c, me.id, users) : '# ' + c.name);

  const select = (id: string) => { setActiveId(id); setFocusId(null); setNavOpen(false); };
  const doSearch = async (q: string) => {
    setQuery(q);
    try { setResults(await adapter.search(q)); } catch (e) { fail(e); }
  };

  return (
    <div className="app">
      <Sidebar me={me} users={users} channels={channels} unread={unread} activeId={activeId} open={navOpen}
        mode={adapter.kind === 'mock' ? 'demo' : 'live'}
        push={push} onTogglePush={togglePush}
        onSelect={select}
        onDm={async id => { try { const c = await adapter.openDm(id); await refresh(); select(c.id); } catch (e) { fail(e); } }}
        onCreate={async (n, ids) => { try { const c = await adapter.createChannel(n, ids); await refresh(); select(c.id); } catch (e) { fail(e); } }}
        onDelete={async id => {
          try {
            await adapter.deleteChannel(id);
            if (activeRef.current === id) { setActiveId(null); setMessages([]); setNavOpen(true); }
            await refresh();
          } catch (e) { fail(e); }
        }}
        onSignOut={async () => { await detachPush(adapter); await adapter.signOut(); setPush('unsupported'); setMe(null); setActiveId(null); setChannels([]); setMessages([]); setNavOpen(!!mq?.matches); }} />
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <InstallTip />
      {tab && <div className="rpanel-back" onClick={() => setTab(null)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon hamburger" aria-label="대화 목록" onClick={() => setNavOpen(true)}>‹</button>
          <h2>{active ? chanName(active) : '구구메신저'}</h2>
          <span className="spacer" />
          {(['members', 'files', 'search'] as Tab[]).map(t => (
            <button key={t} className={'topbtn' + (tab === t ? ' on' : '')} onClick={() => setTab(tab === t ? null : t)}>
              {{ members: '👥', files: '📎', search: '🔍' }[t]}<span className="lbl"> {{ members: '멤버', files: '파일', search: '검색' }[t]}</span></button>))}
        </header>
        <div className="body">
          {active
            ? <Chat me={me} users={users} memberIds={active.memberIds} title={chanName(active)} messages={messages} focusId={focusId}
                onSend={async (t, f) => { await adapter.sendMessage(active.id, t, f); await refresh(); }}
                onReact={async (id, e) => { try { await adapter.toggleReaction(id, e); await refresh(); } catch (x) { fail(x); } }}
                onDelete={async id => { try { await adapter.deleteMessage(id); await refresh(); } catch (x) { fail(x); } }} />
            : <div className="empty">왼쪽에서 채널이나 대화 상대를 선택하세요</div>}
          {tab && (
            <RightPanel tab={tab} users={users} channel={active} messages={messages} results={results} query={query}
              channels={channels} chanName={chanName} onTab={setTab} onClose={() => setTab(null)} onQuery={doSearch}
              onJump={m => { setActiveId(m.channelId); setFocusId(m.id); }} />
          )}
        </div>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
