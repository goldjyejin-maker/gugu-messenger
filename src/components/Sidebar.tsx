import { useState } from 'react';
import type { Channel, User } from '../types';

interface Props {
  me: User; users: User[]; channels: Channel[]; unread: Record<string, number>; activeId: string | null;
  onSelect(id: string): void; onDm(userId: string): void; onCreate(name: string, ids: string[]): void; onSignOut(): void;
  mode: 'demo' | 'live'; open: boolean;
}

export const dmName = (c: Channel, me: string, users: User[]) => {
  const other = c.memberIds.find(i => i !== me) ?? me;
  return users.find(u => u.id === other)?.name ?? '알 수 없음';
};

export default function Sidebar(p: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const chans = p.channels.filter(c => c.kind === 'channel');
  const dms = p.channels.filter(c => c.kind === 'dm');
  const others = p.users.filter(u => u.id !== p.me.id);

  return (
    <aside className={'sidebar' + (p.open ? ' open' : '')}>
      <div className="brand"><span className="logo sm">구구</span> 구구메신저 {p.mode === 'demo' && <em className="badge">데모</em>}</div>

      <div className="sec-head"><span>채널</span><button title="새 채널" onClick={() => setCreating(!creating)}>＋</button></div>
      {creating && (
        <div className="create">
          <input placeholder="채널 이름" value={name} onChange={e => setName(e.target.value)} />
          <div className="pick">{others.map(u => (
            <label key={u.id}><input type="checkbox" checked={picked.includes(u.id)}
              onChange={() => setPicked(picked.includes(u.id) ? picked.filter(x => x !== u.id) : [...picked, u.id])} /> {u.name}</label>
          ))}</div>
          <button className="primary sm" disabled={!name.trim()}
            onClick={() => { p.onCreate(name, picked); setName(''); setPicked([]); setCreating(false); }}>만들기</button>
        </div>
      )}
      <ul>{chans.map(c => (
        <li key={c.id} className={c.id === p.activeId ? 'active' : ''} onClick={() => p.onSelect(c.id)}>
          <span># {c.name}</span>{p.unread[c.id] ? <b className="count">{p.unread[c.id]}</b> : null}
        </li>))}
      </ul>

      <div className="sec-head"><span>다이렉트 메시지</span></div>
      <ul>
        {dms.map(c => (
          <li key={c.id} className={c.id === p.activeId ? 'active' : ''} onClick={() => p.onSelect(c.id)}>
            <span>● {dmName(c, p.me.id, p.users)}</span>{p.unread[c.id] ? <b className="count">{p.unread[c.id]}</b> : null}
          </li>))}
        {others.filter(u => !dms.some(c => c.memberIds.includes(u.id))).map(u => (
          <li key={u.id} className="ghost" onClick={() => p.onDm(u.id)}><span>○ {u.name}</span></li>
        ))}
      </ul>

      <div className="me"><span>{p.me.name}</span><button onClick={p.onSignOut}>로그아웃</button></div>
    </aside>
  );
}
