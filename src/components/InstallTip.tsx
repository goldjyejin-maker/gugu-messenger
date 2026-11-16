import { useEffect, useState } from 'react';

interface BIPEvent extends Event { prompt(): Promise<void> }
const KEY = 'gugu.installtip.hidden';
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const safe = (f: () => void) => { try { f(); } catch { /* 저장소 차단 환경 무시 */ } };

/** 폰 브라우저에서 처음 열었을 때만 "홈 화면에 설치" 안내를 보여준다 */
export default function InstallTip() {
  const [ev, setEv] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    let off = false;
    safe(() => { off = localStorage.getItem(KEY) === '1'; });
    setHidden(off || standalone() || !mobile);
    const h = (e: Event) => { e.preventDefault(); setEv(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, [mobile]);

  if (hidden) return null;
  const close = () => { safe(() => localStorage.setItem(KEY, '1')); setHidden(true); };
  return (
    <div className="install-tip">
      <div>
        <b>앱처럼 설치하세요</b>
        {ev ? <span> 버튼 한 번으로 홈 화면에 추가돼요.</span>
          : ios ? <span> 사파리 하단 <b>공유(⬆︎)</b> → <b>홈 화면에 추가</b></span>
            : <span> 브라우저 메뉴(⋮) → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b></span>}
      </div>
      {ev && <button className="primary sm" onClick={() => { void ev.prompt(); close(); }}>설치</button>}
      <button className="x" aria-label="닫기" onClick={close}>×</button>
    </div>
  );
}
