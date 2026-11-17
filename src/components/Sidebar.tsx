import { useState } from 'react';
import type { Category, Channel, User } from '../types';
import CategoryManager from './CategoryManager';

interface Props {
  me: User; users: User[]; channels: Channel[]; categories: Category[]; unread: Record<string, number>; activeId: string | null;
  onSelect(id: string): void; onDm(userId: string): void;
  onCreate(name: string, ids: string[], categoryId: string | null): void;
  onCreateCategory(name: string): void; onDeleteCategory(id: string): void; onRenameCategory(id: string, name: string): void;
  onMove(channelId: string, categoryId: string | null): void;
  onSignOut(): void; mode: 'demo' | 'live'; open: boolean;
}

export const dmName = (c: Channel, me: string, users: User[]) => {
  const other = c.memberIds.find(i => i !== me) ?? me;
  return users.find(u => u.id === other)?.name ?? '알 수 없음';
};

const NONE = '__none__';

export default function Sidebar(p: Props) {
  // 채널 만들기 폼은 한 번에 하나만 열린다 (key = 카테고리 id 또는 NONE)
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [managing, setManaging] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null); // 채널 ⋯ 메뉴

  const chans = p.channels.filter(c => c.kind === 'channel');
  const dms = p.channels.filter(c => c.kind === 'dm');
  const others = p.users.filter(u => u.id !== p.me.id);
  const catIds = new Set(p.categories.map(c => c.id));
  const uncategorized = chans.filter(c => !c.categoryId || !catIds.has(c.categoryId));

  const total = (list: Channel[]) => list.reduce((n, c) => n + (p.unread[c.id] ?? 0), 0);

  const row = (c: Channel) => (
    <li key={c.id} className={c.id === p.activeId ? 'active' : ''} onClick={() => { setMenuFor(null); p.onSelect(c.id); }}>
      <span className="nm"># {c.name}</span>
      {p.unread[c.id] ? <b className="count">{p.unread[c.id]}</b> : null}
      <button className="more" aria-label="카테고리 이동" onClick={e => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id); }}>⋯</button>
      {menuFor === c.id && (
        <div className="moremenu" onClick={e => e.stopPropagation()}>
          <div className="mh">카테고리로 이동</div>
          {p.categories.map(k => (
            <button key={k.id} disabled={c.categoryId === k.id} onClick={() => { p.onMove(c.id, k.id); setMenuFor(null); }}>📁 {k.name}</button>))}
          <button disabled={!c.categoryId} onClick={() => { p.onMove(c.id, null); setMenuFor(null); }}>카테고리 없음</button>
        </div>
      )}
    </li>
  );

  const createForm = (key: string, categoryId: string | null) => creatingIn === key && (
    <div className="create">
      <input placeholder="채널 이름" value={name} onChange={e => setName(e.target.value)} autoFocus />
      <div className="pick">
        <label><input type="checkbox" checked={picked.length === others.length && others.length > 0}
          onChange={e => setPicked(e.target.checked ? others.map(u => u.id) : [])} /> 전체 선택</label>
        {others.map(u => (
          <label key={u.id}><input type="checkbox" checked={picked.includes(u.id)}
            onChange={() => setPicked(picked.includes(u.id) ? picked.filter(x => x !== u.id) : [...picked, u.id])} /> {u.name}</label>
        ))}
      </div>
      <div className="btns">
        <button className="primary sm" disabled={!name.trim()}
          onClick={() => { p.onCreate(name, picked, categoryId); setName(''); setPicked([]); setCreatingIn(null); }}>만들기</button>
        <button className="ghostbtn" onClick={() => { setCreatingIn(null); setName(''); setPicked([]); }}>취소</button>
      </div>
    </div>
  );

  const section = (key: string, title: string, list: Channel[], cat: Category | null) => (
    <div key={key} className="cat">
      <div className="sec-head cat-head" onClick={() => setFolded({ ...folded, [key]: !folded[key] })}>
        <span className="caret">{folded[key] ? '▸' : '▾'}</span>
        <span className="ttl">{cat ? '📁 ' : ''}{title}</span>
        {folded[key] && total(list) > 0 && <b className="count">{total(list)}</b>}
        <span className="spacer" />
        <button title="이 카테고리에 새 채널" onClick={e => { e.stopPropagation(); setCreatingIn(creatingIn === key ? null : key); setFolded({ ...folded, [key]: false }); }}>＋</button>
      </div>
      {!folded[key] && <>
        {createForm(key, cat ? cat.id : null)}
        <ul>{list.map(row)}</ul>
        {list.length === 0 && creatingIn !== key && <div className="cat-empty">채널이 없어요 · ＋ 로 추가</div>}
      </>}
    </div>
  );

  return (
    <aside className={'sidebar' + (p.open ? ' open' : '')}>
      <div className="brand">
        <img className="logo-img" src="./logo.png" alt="" /> <span>구구메신저</span> {p.mode === 'demo' && <em className="badge">데모</em>}
        <span className="spacer" />
        <button className="gear" onClick={() => setManaging(true)}>⚙ 카테고리</button>
      </div>
      {managing && <CategoryManager categories={p.categories} onAdd={p.onCreateCategory} onRename={p.onRenameCategory}
        onDelete={p.onDeleteCategory} onClose={() => setManaging(false)} />}

      <div className="scrollarea">
        {p.categories.map(k => section(k.id, k.name, chans.filter(c => c.categoryId === k.id), k))}
        {(uncategorized.length > 0 || p.categories.length === 0 || creatingIn === NONE) &&
          section(NONE, p.categories.length ? '카테고리 없음' : '채널', uncategorized, null)}

        <div className="sec-head"><span>채팅 {dms.length || ''}</span></div>
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
