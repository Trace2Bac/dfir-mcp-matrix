import React, { useEffect, useRef, useState } from 'react';
import styles from './PageDrawer.module.css';

type Props = {
  title: string; // 머리에 보일 제목
  subtitle?: string; // 제목 뒤에 흐리게 보일 말(원고의 셀 번호 등)
  label: string; // 화면 읽기 프로그램이 읽을 패널 이름
  url: string; // baseUrl을 붙인 페이지 주소(원고나 셀 화면)
  detail: string | null; // 원고에서 보일 소제목의 머리(T03.02, 미구현 등)
  editUrl: string; // GitHub에서 그 파일을 고치는 주소
  back?: { label: string; onClick: () => void }; // 앞 페이지로 돌아가는 단추(매트릭스 패널에서 셀 화면으로)
  onClose: () => void;
};

const WIDTH_KEY = 'report-drawer-width';
const MIN_WIDTH = 360;

const clampWidth = (w: number) => Math.max(MIN_WIDTH, Math.min(w, window.innerWidth - 80));

// 화면 오른쪽에 원고나 셀 화면을 띄우는 패널. 페이지는 ?embed=1로 열어 머리·사이드바를 숨긴다.
// 왼쪽 가장자리를 끌어 폭을 바꾸고, 바꾼 폭은 localStorage에 남긴다.
export default function PageDrawer({ title, subtitle, label, url, detail, editUrl, back, onClose }: Props) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return clampWidth(saved || Math.round(window.innerWidth * 0.55));
  });
  const [dragging, setDragging] = useState(false);
  // 끌기를 패널 밖에서 놓으면 바깥 클릭으로 잡히므로, 그 클릭 한 번은 닫지 않는다
  const resizedRef = useRef(false);

  // 처음 열 때는 주소의 detail로 스크롤하고, 같은 원고에서 다른 행을 누르면 다시 읽지 않고 메시지로 스크롤시킨다
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcRef = useRef<{ url: string; src: string } | null>(null);
  if (srcRef.current?.url !== url) {
    srcRef.current = { url, src: `${url}?embed=1${detail ? `&detail=${encodeURIComponent(detail)}` : ''}` };
  }
  const firstDetail = useRef(detail);
  useEffect(() => {
    if (detail === firstDetail.current) return;
    firstDetail.current = detail;
    frameRef.current?.contentWindow?.postMessage({ type: 'drawer:detail', detail }, window.location.origin);
  }, [detail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // iframe 안에 초점이 있을 때는 iframe이 ESC를 메시지로 알린다(src/theme/Root.tsx)
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'drawer:close') onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMessage);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    resizedRef.current = true;
    let last = width;
    const onMove = (ev: PointerEvent) => {
      last = clampWidth(window.innerWidth - ev.clientX);
      setWidth(last);
    };
    const onUp = () => {
      setDragging(false);
      localStorage.setItem(WIDTH_KEY, String(last));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      setTimeout(() => (resizedRef.current = false));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // 창 밖에서 놓거나 다른 창으로 옮겨 pointerup을 못 받아도 끄기를 끝낸다
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
  };

  return (
    <div className={`${styles.overlay} ${dragging ? styles.dragging : ''}`} onClick={() => !resizedRef.current && onClose()}>
      <aside
        className={styles.panel}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.resizer} onPointerDown={startResize} aria-hidden="true" />
        <header className={styles.header}>
          {back && (
            <button
              className={`${styles.action} ${styles.back}`}
              onClick={back.onClick}
              title={`${back.label}(으)로 돌아가기`}
              aria-label={`${back.label}(으)로 돌아가기`}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <span className={styles.title}>
            {title} {subtitle && <span className={styles.cell}>· {subtitle}</span>}
          </span>
          <a className={styles.action} href={editUrl} target="_blank" rel="noopener noreferrer" title="GitHub에서 편집">
            편집 ✎
          </a>
          <a className={styles.action} href={url} target="_blank" rel="noopener noreferrer" title="새 탭에서 열기">
            새 탭에서 열기 ↗
          </a>
          <button className={styles.action} onClick={onClose} title="닫기 (Esc)" aria-label="닫기">
            ✕
          </button>
        </header>
        {/* 끄는 동안 iframe이 포인터를 가져가지 않게 화면 전체를 덮는다.
            iframe에 pointer-events: none을 줬다 풀면, 폭이 더 바뀌지 않은 채 끝났을 때 Chrome이 휠 대상을 갱신하지 않아 원고가 스크롤되지 않았다 */}
        {dragging && <div className={styles.shield} />}
        <iframe ref={frameRef} key={url} className={styles.frame} src={srcRef.current.src} title={label} />
      </aside>
    </div>
  );
}
