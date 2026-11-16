import { useState } from 'react';
import { MAX_CATEGORIES } from '../types';
import type { Category, Channel, User } from '../types';

interface Props {
  me: User; users: User[]; channels: Channel[]; categories: Category[]; unread: Record<string, number>; activeId: string | null;
  onSelect(id: string): void; onDm(userId: string): void;
  onCreate(name: string, ids: string[], categoryId: string | null): void;
  onCreateCategory(name: string): void; onDeleteCategory(id: string): void;
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
  const [addingCat, setAddingCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null); // 채널 ⋯ 메뉴

  const chans = p.channels.filter(c => c.kind === 'channel');
  const dms = p.channels.filter(c => c.kind === 'dm');
  const others = p.users.filter(u => u.id !== p.me.id);
  const catIds = new Set(p.categories.map(c => c.id));
  const uncategorized = chans.filter(c => !c.categoryId || !catIds.has(c.categoryId));
  const canAddCat = p.categories.length < MAX_CATEGORIES;

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
        {cat && <button className="del" title="카테고리 삭제" onClick={e => {
          e.stopPropagation();
          if (confirm(`'${cat.name}' 카테고리를 삭제할까요?\n안의 채널은 삭제되지 않고 '카테고리 없음'으로 옮겨져요.`)) p.onDeleteCategory(cat.id);
        }}>×</button>}
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
      <div className="brand"><span className="logo sm">구구</span> 구구메신저 {p.mode === 'demo' && <em className="badge">데모</em>}</div>

      <div className="scrollarea">
        {p.categories.map(k => section(k.id, k.name, chans.filter(c => c.categoryId === k.id), k))}
        {(uncategorized.length > 0 || p.categories.length === 0 || creatingIn === NONE) &&
          section(NONE, p.categories.length ? '카테고리 없음' : '채널', uncategorized, null)}

        <div className="addcat">
          {addingCat ? (
            <form onSubmit={e => { e.preventDefault(); if (catName.trim()) { p.onCreateCategory(catName); setCatName(''); setAddingCat(false); } }}>
              <input placeholder="카테고리 이름 (예: 중등부)" value={catName} onChange={e => setCatName(e.target.value)} autoFocus maxLength={20} />
              <button className="primary sm" disabled={!catName.trim()}>추가</button>
              <button type="button" className="ghostbtn" onClick={() => { setAddingCat(false); setCatName(''); }}>취소</button>
            </form>
          ) : (
            <button className="addcat-btn" disabled={!canAddCat} onClick={() => setAddingCat(true)}>
              ＋ 카테고리 추가 <small>({p.categories.length}/{MAX_CATEGORIES})</small>
            </button>
          )}
        </div>

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
