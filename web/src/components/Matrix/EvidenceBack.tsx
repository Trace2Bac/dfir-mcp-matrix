import React, { useEffect, useRef, useState } from 'react';

// 서버 원고에서 근거 표지 [n](#ev-n 링크)을 눌러 근거로 내려간 뒤, 누른 자리로 돌아오는 버튼.
// 누를 때의 스크롤 위치와 표지를 기억하고, 오른쪽 아래 버튼을 누르면 돌아간다.
// 원고 페이지마다 붙으므로(DocItem/Footer) 다른 페이지로 옮기면 기억도 사라진다.
type Origin = { y: number; mark: HTMLElement };

export default function EvidenceBack() {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const originRef = useRef<Origin | null>(null);

  const remember = (o: Origin | null) => {
    originRef.current = o;
    setOrigin(o);
  };

  const goBack = () => {
    const o = originRef.current;
    if (!o) return;
    window.scrollTo({ top: o.y });
    o.mark.classList.remove('report-mark-flash');
    void o.mark.offsetWidth; // 같은 표지로 여러 번 돌아와도 깜빡임이 다시 돌게 한다
    o.mark.classList.add('report-mark-flash');
    remember(null);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const mark = target?.closest?.('.markdown a[href^="#ev-"]') as HTMLElement | null;
      if (mark) remember({ y: window.scrollY, mark });
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      remember(null);
    };
  }, []);

  if (!origin) return null;
  return (
    <button type="button" className="report-back" onClick={goBack} title="본문으로 돌아가기" aria-label="본문으로 돌아가기">
      {/* 되돌리기 화살표(Material Symbols undo) */}
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
      </svg>
    </button>
  );
}
