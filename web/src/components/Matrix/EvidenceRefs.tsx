import { useEffect } from 'react';

// 서버 원고에서 근거와 본문 표지 사이를 오간다.
// 근거 항목의 번호 이름표(#ev-n-ref-1 링크, src/remark/reportLayout.ts)를 누르면 본문의 표지로 돌아간다.
// 같은 근거를 여러 표지가 가리키면, 마지막으로 누른 표지로 돌아가고 누른 적이 없으면 첫 표지로 간다.
// 누를 때 표지가 화면의 어느 높이에 있었는지 기억해 같은 높이로 돌려 놓는다. 기억은 페이지를 옮기면 사라진다.
type Origin = { mark: HTMLElement; offset: number };

const REF = /^#ev-(\d+)-ref-\d+$/;

export default function EvidenceRefs(): null {
  useEffect(() => {
    const origins = new Map<string, Origin>(); // 근거 번호 → 마지막으로 누른 표지

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('.markdown a[href^="#ev-"]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href')!;

      if (a.classList.contains('report-mark')) {
        origins.set(href.slice('#ev-'.length), { mark: a, offset: a.getBoundingClientRect().top });
        return;
      }

      const m = REF.exec(href);
      if (!m) return;
      const origin = origins.get(m[1]);
      const mark = origin?.mark.isConnected ? origin.mark : document.getElementById(href.slice(1));
      if (!mark) return;
      e.preventDefault();
      // scrollIntoView는 패널(iframe) 밖 페이지까지 스크롤하므로 창만 옮긴다. 처음 가는 표지는 화면 위쪽 1/3에 둔다
      const offset = origin?.mark === mark ? origin.offset : window.innerHeight / 3;
      window.scrollTo({ top: mark.getBoundingClientRect().top + window.scrollY - offset });
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
