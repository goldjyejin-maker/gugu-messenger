import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Message, User } from '../types';
import { MAX_FILE, fmtDay, fmtSize, fmtTime, sameDay } from '../util';

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🙏'];
const URL_RE = /(https?:\/\/[^\s<]+)/g;

/** 본문: URL 링크화 + @멘션 강조 (React가 문자열을 이스케이프하므로 XSS 안전) */
function Body({ text, users }: { text: string; users: User[] }) {
  const names = users.map(u => u.name).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = names.length ? new RegExp(`(@(?:${names.join('|')}))|(https?:\\/\\/[^\\s<]+)`, 'g') : URL_RE;
  const out: React.ReactNode[] = [];
  let last = 0, i = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    if (m[0].startsWith('http')) out.push(<a key={i++} href={m[0]} target="_blank" rel="noopener noreferrer">{m[0]}</a>);
    else out.push(<span key={i++} className="mention">{m[0]}</span>);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

interface Props {
  me: User; users: User[]; memberIds: string[]; title: string; messages: Message[];
  onSend(text: string, files: File[]): Promise<void>; onReact(id: string, emoji: string): void; onDelete(id: string): void;
  focusId?: string | null;
}

export default function Chat({ me, users, memberIds, title, messages, onSend, onReact, onDelete, focusId }: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [drag, setDrag] = useState(false);
  const [sel, setSel] = useState<string | null>(null); // 터치: 메시지를 탭하면 반응/삭제 버튼 표시
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const members = users.filter(u => memberIds.includes(u.id) && u.id !== me.id);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length, title]);
  useEffect(() => {
    if (focusId) document.getElementById('m-' + focusId)?.scrollIntoView({ block: 'center' });
  }, [focusId, messages]);

  const at = /(?:^|\s)@([^\s@]*)$/.exec(text);
  const suggest = at ? members.filter(u => u.name.includes(at[1])).slice(0, 5) : [];

  function addFiles(list: FileList | File[]) {
    const ok: File[] = [];
    let bad = '';
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE) bad = `${f.name}: 25MB 이하만 올릴 수 있어요`;
      else ok.push(f);
    }
    setErr(bad);
    setFiles(prev => [...prev, ...ok]);
  }

  async function send() {
    if (sending || (!text.trim() && !files.length)) return;
    setSending(true); setErr('');
    try { await onSend(text.trim(), files); setText(''); setFiles([]); }
    catch (x) { setErr((x as Error).message); }
    finally { setSending(false); }
  }

  let prev: Message | undefined;
  return (
    <section className={'chat' + (drag ? ' drag' : '')}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
      <div className="msgs" ref={listRef}>
        {messages.length === 0 && <div className="empty">{title} 의 첫 메시지를 남겨 보세요 👋</div>}
        {messages.map(m => {
          const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          const compact = !showDay && !!prev && prev.userId === m.userId && m.createdAt - prev.createdAt < 5 * 60_000;
          prev = m;
          const mine = m.userId === me.id;
          return (
            <Fragment key={m.id}>
              {showDay && <div className="day"><span>{fmtDay(m.createdAt)}</span></div>}
              <div id={'m-' + m.id} onClick={() => setSel(sel === m.id ? null : m.id)} className={'msg' + (sel === m.id ? ' sel' : '') + (compact ? ' compact' : '') + (m.mentions.includes(me.id) ? ' mentioned' : '') + (focusId === m.id ? ' focus' : '')}>
                <div className="avatar">{compact ? '' : (byId.get(m.userId)?.name ?? '?').slice(0, 1)}</div>
                <div className="bubble">
                  {!compact && <div className="meta"><b>{byId.get(m.userId)?.name ?? '알 수 없음'}</b><time>{fmtTime(m.createdAt)}</time></div>}
                  {m.text && <div className="text"><Body text={m.text} users={users} /></div>}
                  {m.attachments.map(a => a.type.startsWith('image/') && a.url
                    ? <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"><img className="thumb" src={a.url} alt={a.name} loading="lazy" /></a>
                    : <a key={a.id} className="file" href={a.url} download={a.name} target="_blank" rel="noopener noreferrer">📎 {a.name} <small>{fmtSize(a.size)}</small></a>)}
                  <div className="reacts">
                    {Object.entries(m.reactions).map(([e, ids]) => (
                      <button key={e} className={ids.includes(me.id) ? 'on' : ''} onClick={() => onReact(m.id, e)}
                        title={ids.map(i => byId.get(i)?.name).join(', ')}>{e} {ids.length}</button>))}
                    <span className="tools">
                      {EMOJIS.map(e => <button key={e} onClick={() => onReact(m.id, e)}>{e}</button>)}
                      {mine && <button title="삭제" onClick={() => { if (confirm('이 메시지를 삭제할까요?')) onDelete(m.id); }}>🗑</button>}
                    </span>
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="composer">
        {suggest.length > 0 && at && (
          <ul className="suggest">{suggest.map(u => (
            <li key={u.id} onMouseDown={e => { e.preventDefault(); setText(text.replace(/@[^\s@]*$/, '@' + u.name + ' ')); }}>@{u.name}</li>))}
          </ul>
        )}
        {files.length > 0 && (
          <div className="chips">{files.map((f, i) => (
            <span key={i} className="chip">{f.name} <small>{fmtSize(f.size)}</small>
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></span>))}
          </div>
        )}
        {err && <div className="error">{err}</div>}
        <div className="row">
          <button className="icon" title="파일 첨부" onClick={() => fileRef.current?.click()}>📎</button>
          <input ref={fileRef} type="file" multiple hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <textarea rows={1} value={text} placeholder={`${title}에 메시지 보내기 (@로 멘션, Shift+Enter 줄바꿈)`}
            onChange={e => setText(e.target.value)}
            onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
          <button className="primary" disabled={sending} onClick={() => void send()}>{sending ? '…' : '보내기'}</button>
        </div>
      </div>
    </section>
  );
}
