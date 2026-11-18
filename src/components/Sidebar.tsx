import { useState } from 'react';
import type { Channel, User } from '../types';

interface Props {
  me: User; users: User[]; channels: Channel[]; unread: Record<string, number>; activeId: string | null;
  onSelect(id: string): void; onDm(userId: string): void;
  onCreate(name: string, ids: string[]): void; onDelete(id: string): void;
  onSignOut(): void; mode: 'demo' | 'live'; open: boolean;
}

export const dmName = (c: Channel, me: string, users: User[]) => {
  const other = c.memberIds.find(i => i !== me) ?? me;
  return users.find(u => u.id === other)?.name ?? '알 수 없음';
};

/** 왼쪽 목록: 채팅방 (＋로 새로 만들기) / 1:1 채팅 */
export default function Sidebar(p: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const rooms = p.channels.filter(c => c.kind === 'channel');
  const dms = p.channels.filter(c => c.kind === 'dm');
  const others = p.users.filter(u => u.id !== p.me.id);

  const reset = () => { setCreating(false); setName(''); setPicked([]); };

  return (
    <aside className={'sidebar' + (p.open ? ' open' : '')} onClick={() => setMenuFor(null)}>
      <div className="brand">
        <img className="logo-img" src="./logo.png" alt="" /> <span>구구메신저</span> {p.mode === 'demo' && <em className="badge">데모</em>}
      </div>

      <div className="scrollarea">
        <div className="sec-head">
          <span>채팅방</span>
          <button title="새 채팅방 만들기" aria-label="새 채팅방 만들기" onClick={e => { e.stopPropagation(); setCreating(!creating); }}>＋</button>
        </div>

        {creating && (
          <form className="create" onSubmit={e => { e.preventDefault(); if (name.trim()) { p.onCreate(name, picked); reset(); } }}>
            <input placeholder="채팅방 이름 (예: 중등부)" value={name} onChange={e => setName(e.target.value)} maxLength={30} autoFocus />
            <div className="pick">
              <label><input type="checkbox" checked={picked.length === others.length && others.length > 0}
                onChange={e => setPicked(e.target.checked ? others.map(u => u.id) : [])} /> 선생님 전체</label>
              {others.map(u => (
                <label key={u.id}><input type="checkbox" checked={picked.includes(u.id)}
                  onChange={() => setPicked(picked.includes(u.id) ? picked.filter(x => x !== u.id) : [...picked, u.id])} /> {u.name}</label>
              ))}
            </div>
            <div className="btns">
              <button className="primary sm" disabled={!name.trim()}>만들기</button>
              <button type="button" className="ghostbtn" onClick={reset}>취소</button>
            </div>
          </form>
        )}

        <ul>
          {rooms.map(c => (
            <li key={c.id} className={c.id === p.activeId ? 'active' : ''} onClick={() => { setMenuFor(null); p.onSelect(c.id); }}>
              <span className="nm"># {c.name}</span>
              {p.unread[c.id] ? <b className="count">{p.unread[c.id]}</b> : null}
              <button className="more" aria-label="채팅방 메뉴" onClick={e => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id); }}>⋯</button>
              {menuFor === c.id && (
                <div className="moremenu" onClick={e => e.stopPropagation()}>
                  <button className="danger" onClick={() => {
                    setMenuFor(null);
                    if (confirm(`'${c.name}' 채팅방을 삭제할까요?\n대화 내용도 모두 사라지고 되돌릴 수 없어요.`)) p.onDelete(c.id);
                  }}>채팅방 삭제</button>
                </div>
              )}
            </li>))}
        </ul>
        {rooms.length === 0 && !creating && <div className="cat-empty">채팅방이 없어요 · ＋ 를 눌러 만드세요</div>}

        <div className="sec-head"><span>1:1 채팅</span></div>
        <ul>
          {dms.map(c => (
            <li key={c.id} className={c.id === p.activeId ? 'active' : ''} onClick={() => p.onSelect(c.id)}>
              <span className="nm">● {dmName(c, p.me.id, p.users)}</span>{p.unread[c.id] ? <b className="count">{p.unread[c.id]}</b> : null}
            </li>))}
          {others.filter(u => !dms.some(c => c.memberIds.includes(u.id))).map(u => (
            <li key={u.id} className="ghost" onClick={() => p.onDm(u.id)}><span className="nm">○ {u.name}</span></li>
          ))}
        </ul>
      </div>

      <div className="me"><span>{p.me.name}</span><button onClick={p.onSignOut}>로그아웃</button></div>
    </aside>
  );
}
