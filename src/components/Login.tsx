import { useState } from 'react';
import type { MessengerAdapter } from '../types';

export default function Login({ adapter, onDone }: { adapter: MessengerAdapter; onDone: () => void }) {
  const email = adapter.authMode === 'email';
  const [signUp, setSignUp] = useState(false);
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await adapter.signIn({ name, email: mail, password: pw, signUp }); onDone(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img className="login-logo" src="./logo.png" alt="구구메신저" />
        <h1>구구메신저</h1>
        <p className="muted">선생님들을 위한 업무 메신저</p>
        {(!email || signUp) && (
          <input placeholder="이름 (예: 김선생)" value={name} onChange={e => setName(e.target.value)} autoFocus required />
        )}
        {email && <>
          <input type="email" placeholder="이메일" value={mail} onChange={e => setMail(e.target.value)} required />
          <input type="password" placeholder="비밀번호 (6자 이상)" value={pw} onChange={e => setPw(e.target.value)} minLength={6} required />
        </>}
        {err && <div className="error">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? '처리 중…' : email && signUp ? '가입하기' : email ? '로그인' : '시작하기'}</button>
        {email && (
          <button type="button" className="link" onClick={() => { setSignUp(!signUp); setErr(''); }}>
            {signUp ? '이미 계정이 있어요 → 로그인' : '처음이에요 → 가입하기'}
          </button>
        )}
        {!email && <p className="hint">데모 모드: 이 브라우저에만 저장됩니다. 탭을 두 개 열어 다른 이름으로 들어가면 대화를 시험해 볼 수 있어요.</p>}
      </form>
    </div>
  );
}
