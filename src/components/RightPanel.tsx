import { useState } from 'react';
import type { Attachment, Channel, Message, User } from '../types';
import { fmtDay, fmtSize } from '../util';

type Tab = 'members' | 'files' | 'search';
interface Props {
  tab: Tab; users: User[]; channel: Channel | null; messages: Message[];
  results: Message[]; query: string; channels: Channel[];
  onQuery(q: string): void; onJump(m: Message): void; onClose(): void; onTab(t: Tab): void;
  chanName(c: Channel): string;
}
const LABEL: Record<Tab, string> = { members: '멤버', files: '파일', search: '검색' };

export default function RightPanel(p: Props) {
  const [q, setQ] = useState(p.query);
  const members = p.channel ? p.users.filter(u => p.channel!.memberIds.includes(u.id)) : [];
  const files: { a: Attachment; m: Message }[] = p.messages.flatMap(m => m.attachments.map(a => ({ a, m }))).reverse();
  const nameOf = (id: string) => p.users.find(u => u.id === id)?.name ?? '?';
  const chOf = (id: string) => { const c = p.channels.find(x => x.id === id); return c ? p.chanName(c) : ''; };

  return (
    <aside className="rpanel">
      <div className="tabs">
        {(Object.keys(LABEL) as Tab[]).map(t => (
          <button key={t} className={p.tab === t ? 'on' : ''} onClick={() => p.onTab(t)}>{LABEL[t]}</button>))}
        <button className="x" onClick={p.onClose}>×</button>
      </div>
      {p.tab === 'members' && (
        <ul className="plain">{members.map(u => <li key={u.id}><span className="avatar">{u.name.slice(0, 1)}</span> {u.name}</li>)}</ul>
      )}
      {p.tab === 'files' && (files.length === 0
        ? <div className="empty sm">이 대화에 올라온 파일이 없어요</div>
        : <ul className="plain">{files.map(({ a, m }) => (
          <li key={a.id}><a href={a.url} download={a.name} target="_blank" rel="noopener noreferrer">📎 {a.name}</a>
            <small>{fmtSize(a.size)} · {nameOf(m.userId)} · {fmtDay(m.createdAt)}</small></li>))}
        </ul>)}
      {p.tab === 'search' && <>
        <form className="searchbox" onSubmit={e => { e.preventDefault(); p.onQuery(q); }}>
          <input placeholder="메시지·파일명 검색" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <button className="primary sm">검색</button>
        </form>
        <ul className="plain results">{p.results.map(m => (
          <li key={m.id} onClick={() => p.onJump(m)}>
            <small>{chOf(m.channelId)} · {nameOf(m.userId)} · {fmtDay(m.createdAt)}</small>
            <div>{m.text || m.attachments.map(a => a.name).join(', ')}</div></li>))}
          {p.query && p.results.length === 0 && <li className="empty sm">결과가 없어요</li>}
        </ul>
      </>}
    </aside>
  );
}
