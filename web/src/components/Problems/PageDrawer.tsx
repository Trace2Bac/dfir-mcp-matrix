import React, { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './PageDrawer.module.css';

type Props = {
  title: string; // 머리에 보일 제목
  subtitle?: string; // 제목 뒤에 흐리게 보일 말(원고의 셀 번호 등)
  label: string; // 화면 읽기 프로그램이 읽을 패널 이름
  // iframe으로 띄울 페이지(원고). url은 baseUrl을 붙인 주소, detail은 원고에서 보일 소제목의 머리(T03.02, 미구현 등)
  page?: { url: string; detail: string | null } | null;
  children?: ReactNode; // page가 없을 때 보일 내용(매트릭스 패널의 셀 화면)
  openUrl?: string; // 새 탭에서 열 주소. 없으면 page.url
  editUrl: string; // GitHub에서 그 파일을 고치는 주소
  back?: { label: string; onClick: () => void }; // 앞 화면으로 돌아가는 단추(매트릭스 패널에서 셀 화면으로)
  onClose: () => void;
};

const WIDTH_KEY = 'report-drawer-width';
const MIN_WIDTH = 360;

const clampWidth = (w: number) => Math.max(MIN_WIDTH, Math.min(w, window.innerWidth - 80));

// 화면 오른쪽에 원고나 셀 화면을 띄우는 패널. 원고는 ?embed=1로 열어 머리·사이드바를 숨긴다.
// 왼쪽 가장자리를 끌어 폭을 바꾸고, 바꾼 폭은 localStorage에 남긴다.
// 본문(.markdown)의 글꼴·여백 규칙이 패널에 번지지 않게 body 바로 아래에 그린다
export default function PageDrawer({ title, subtitle, label, page, children, openUrl, editUrl, back, onClose }: Props) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return clampWidth(saved || Math.round(window.innerWidth * 0.55));
  });
  const [dragging, setDragging] = useState(false);
  // 끌기를 패널 밖에서 놓으면 바깥 클릭으로 잡히므로, 그 클릭 한 번은 닫지 않는다
  const resizedRef = useRef(false);

  // 처음 열 때는 주소의 detail로 스크롤하고, 같은 원고에서 다른 행을 누르면 다시 읽지 않고 메시지로 스크롤시킨다
  const url = page?.url ?? null;
  const detail = page?.detail ?? null;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const makeSrc = (u: string) => `${u}?embed=1${detail ? `&detail=${encodeURIComponent(detail)}` : ''}`;
  // 다른 원고로 바꿀 때는 새 iframe을 숨겨 읽고, 다 읽으면 그것을 보인다. 바로 바꾸면 읽는 동안 빈 화면이 깜빡인다.
  // 보이던 iframe과 children은 지우지 않고 숨겨 두어, 돌아가면 다시 읽지 않고 보던 스크롤 그대로 보인다.
  // shown은 보이는 원고 주소이고, null이면 children이 보인다. 남기는 iframe은 보이는 것과 새 것 둘뿐이다
  const [frames, setFrames] = useState(() => (url ? [{ url, src: makeSrc(url), loaded: false }] : []));
  const [shown, setShown] = useState(url);
  if (url && !frames.some(f => f.url === url)) {
    setFrames([...frames.filter(f => f.url === shown), { url, src: makeSrc(url), loaded: false }]);
  }
  if (shown !== url && (url === null || frames.some(f => f.url === url && f.loaded))) setShown(url);
  const onFrameLoad = (u: string) => setFrames(fs => fs.map(f => (f.url === u ? { ...f, loaded: true } : f)));
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

  return createPortal(
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
          <a className={styles.action} href={openUrl ?? url ?? undefined} target="_blank" rel="noopener noreferrer" title="새 탭에서 열기">
            새 탭에서 열기 ↗
          </a>
          <button className={styles.action} onClick={onClose} title="닫기 (Esc)" aria-label="닫기">
            ✕
          </button>
        </header>
        {/* 끄는 동안 iframe이 포인터를 가져가지 않게 화면 전체를 덮는다.
            iframe에 pointer-events: none을 줬다 풀면, 폭이 더 바뀌지 않은 채 끝났을 때 Chrome이 휠 대상을 갱신하지 않아 원고가 스크롤되지 않았다 */}
        {dragging && <div className={styles.shield} />}
        <div className={styles.frames}>
          {children !== undefined && (
            <div className={`${styles.frame} ${styles.content} ${shown === null ? '' : styles.hidden}`}>{children}</div>
          )}
          {/* 앞의 iframe을 지워도 남은 iframe은 자리를 옮기지 않으므로 다시 읽지 않는다 */}
          {frames.map(f => (
            <iframe
              ref={f.url === url ? frameRef : undefined}
              key={f.url}
              className={`${styles.frame} ${f.url === shown ? '' : styles.hidden}`}
              src={f.src}
              title={label}
              onLoad={() => onFrameLoad(f.url)}
            />
          ))}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
