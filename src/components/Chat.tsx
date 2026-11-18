import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Message, User } from '../types';
import { MAX_FILE, fmtDay, fmtSize, fmtTime, sameDay } from '../util';

const CHECK = '✅'; // '확인했어요' 표시는 이 이모지 하나로 저장한다
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
  const [view, setView] = useState<{ list: string[]; i: number } | null>(null); // 사진 크게 보기
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const members = users.filter(u => memberIds.includes(u.id) && u.id !== me.id);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length, title]);
  useEffect(() => {
    if (focusId) document.getElementById('m-' + focusId)?.scrollIntoView({ block: 'center' });
  }, [focusId, messages]);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const [sugIdx, setSugIdx] = useState(0);
  const at = /(?:^|\s)@([^\s@]*)$/.exec(text);
  const suggest = at ? members.filter(u => u.name.includes(at[1])).slice(0, 8) : [];
  const idx = Math.min(sugIdx, Math.max(suggest.length - 1, 0));
  const pick = (u: User) => { setText(text.replace(/@[^\s@]*$/, '@' + u.name + ' ')); setSugIdx(0); taRef.current?.focus(); };
  // 입력창 옆 @ 버튼: 커서 위치와 상관없이 맨 끝에 @ 를 붙여 선생님 목록을 띄운다
  const startMention = () => {
    setText(t => (t && !/\s$/.test(t) ? t + ' @' : t + '@'));
    setSugIdx(0);
    taRef.current?.focus();
  };

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
              <div id={'m-' + m.id} className={'msg' + (compact ? ' compact' : '') + (m.mentions.includes(me.id) ? ' mentioned' : '') + (focusId === m.id ? ' focus' : '')}>
                <div className="avatar">{compact ? '' : (byId.get(m.userId)?.name ?? '?').slice(0, 1)}</div>
                <div className="bubble">
                  {!compact && <div className="meta"><b>{byId.get(m.userId)?.name ?? '알 수 없음'}</b><time>{fmtTime(m.createdAt)}</time></div>}
                  {m.text && <div className="text"><Body text={m.text} users={users} /></div>}
                  {(() => {
                    const isImg = (a: Message['attachments'][number]) => a.type.startsWith('image/') && !!a.url;
                    const imgs = m.attachments.filter(isImg);
                    const shown = imgs.slice(0, 4), more = imgs.length - shown.length;
                    return <>
                      {imgs.length > 0 && (
                        <div className={'gallery g' + shown.length} >
                          {shown.map((a, i) => (
                            <button key={a.id} className="tile" aria-label={a.name} onClick={() => setView({ list: imgs.map(x => x.url!), i })}>
                              <img src={a.url} alt={a.name} loading="lazy" />
                              {more > 0 && i === shown.length - 1 && <span className="more-badge">+{more}</span>}
                            </button>))}
                        </div>
                      )}
                      {m.attachments.filter(a => !isImg(a)).map(a =>
                        <a key={a.id} className="file" href={a.url} download={a.name} target="_blank" rel="noopener noreferrer">📎 {a.name} <small>{fmtSize(a.size)}</small></a>)}
                    </>;
                  })()}
                  {(() => {
                    const ok = m.reactions[CHECK] ?? [];
                    const iOk = ok.includes(me.id);
                    return (
                      <div className="foot">
                        <button className={'ack' + (iOk ? ' on' : '')} aria-pressed={iOk} onClick={() => onReact(m.id, CHECK)}>
                          <span className="box">{iOk ? '✓' : ''}</span>확인{ok.length > 0 && <b>{ok.length}</b>}
                        </button>
                        {ok.length > 0 && <span className="who">{ok.map(i => byId.get(i)?.name).filter(Boolean).join(', ')}</span>}
                        {mine && <button className="del" onClick={() => { if (confirm('이 메시지를 삭제할까요?')) onDelete(m.id); }}>삭제</button>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {view && (
        <div className="lightbox" onClick={() => setView(null)}>
          <img src={view.list[view.i]} alt="" onClick={e => e.stopPropagation()} />
          <button className="lb-close" aria-label="닫기">✕</button>
          {view.list.length > 1 && <>
            <button className="lb-nav prev" aria-label="이전" onClick={e => { e.stopPropagation(); setView({ ...view, i: (view.i - 1 + view.list.length) % view.list.length }); }}>‹</button>
            <button className="lb-nav next" aria-label="다음" onClick={e => { e.stopPropagation(); setView({ ...view, i: (view.i + 1) % view.list.length }); }}>›</button>
            <span className="lb-count">{view.i + 1} / {view.list.length}</span>
          </>}
          <a className="lb-open" href={view.list[view.i]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>원본 열기</a>
        </div>
      )}

      <div className="composer">
        {suggest.length > 0 && at && (
          <ul className="suggest">
            <li className="sh">호출할 선생님을 고르세요</li>
            {suggest.map((u, i) => (
              <li key={u.id} className={i === idx ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(u); }}>
                <span className="avatar sm">{u.name.slice(0, 1)}</span> @{u.name}</li>))}
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
          <button className="icon at" title="선생님 호출(@)" onClick={startMention}>@</button>
          <textarea ref={taRef} rows={1} value={text} placeholder={`${title}에 메시지 보내기 (@로 선생님 호출)`}
            onChange={e => { setText(e.target.value); setSugIdx(0); }}
            onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return;
              if (suggest.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx((idx + 1) % suggest.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSugIdx((idx - 1 + suggest.length) % suggest.length); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggest[idx]); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }} />
          <button className="primary" disabled={sending} onClick={() => void send()}>{sending ? '…' : '보내기'}</button>
        </div>
      </div>
    </section>
  );
}
