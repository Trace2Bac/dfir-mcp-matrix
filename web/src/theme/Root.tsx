import React, { type ReactNode, useEffect } from 'react';

// 원고를 패널(iframe) 안에서 ?embed=1로 열었을 때의 동작.
// data-embed 속성은 docusaurus.config.ts의 headTags 스크립트가 미리 붙인다.

// 소제목 머리가 detail(T03.02, 미구현 등)인 소제목으로 iframe 안만 스크롤한다.
// scrollIntoView는 바깥 셀 페이지까지 스크롤하므로 쓰지 않는다.
function scrollToDetail(detail: string | null) {
  if (!detail) return;
  const heading = [...document.querySelectorAll('.theme-doc-markdown h3')].find(h => {
    const text = (h.textContent ?? '').replace(/[\u200b#]/g, '').trim();
    return text === detail || text.startsWith(`${detail} `);
  });
  if (heading) window.scrollTo({ top: heading.getBoundingClientRect().top + window.scrollY - 16 });
}

export default function Root({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    if (!document.documentElement.hasAttribute('data-embed')) return;

    // 같은 페이지 안의 앵커(근거 표지 #ev-n 등)만 패널 안에서 따라가고, 나머지 링크는 새 탭으로 연다
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.hash) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(url.href, '_blank', 'noopener');
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'drawer:detail') scrollToDetail(e.data.detail);
    };
    requestAnimationFrame(() => scrollToDetail(new URLSearchParams(window.location.search).get('detail')));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.parent.postMessage({ type: 'drawer:close' }, window.location.origin);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return <>{children}</>;
}
