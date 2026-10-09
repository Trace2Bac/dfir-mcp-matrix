import React, { useState, useEffect, useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import GridBoard from './GridBoard';
import PageDrawer from './PageDrawer';

export default function MatrixGrid() {
  const [data, setData] = useState<any>(null);
  const dataUrl = useBaseUrl('/data/matrix.json');
  const baseUrl = useBaseUrl('/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
  const history = useHistory();
  const location = useLocation();
  // 패널에 연 셀은 ?cell=로, 패널 안 셀 화면에서 연 원고는 &server=&detail=로 주소에 남긴다.
  // 셀 화면과 같이 replace만 쓴다(CellToolList.tsx)
  const query = new URLSearchParams(location.search);
  const openCell = query.get('cell');
  const openServer = query.get('server');
  const openDetail = query.get('detail');

  const withOpen = useCallback(
    (cell: string | null, server: string | null = null, detail: string | null = null) => {
      const params = new URLSearchParams(location.search);
      for (const [k, v] of [['cell', cell], ['server', server], ['detail', detail]] as const) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      const search = params.toString();
      return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash };
    },
    [location],
  );

  const openDrawer = (e: React.MouseEvent, cell: string) => {
    // 수정 키나 가운데 버튼으로 누르면 원래대로 셀 화면을 연다
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.replace(withOpen(cell));
  };

  const closeDrawer = useCallback(() => history.replace(withOpen(null)), [history, withOpen]);

  // 패널 안 셀 화면에서 서버를 누르면 그 원고를 같은 패널에 연다(CellToolList.tsx)
  useEffect(() => {
    if (!openCell) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'drawer:report') {
        history.replace(withOpen(openCell, e.data.server, e.data.detail));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [openCell, history, withOpen]);

  useEffect(() => {
    fetch(dataUrl)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error);
  }, [dataUrl]);

  if (!data) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>데이터를 불러오는 중입니다...</div>;
  }

  const cell = openCell ? data.cells.find((c: any) => c.id === openCell) : null;
  const editBase = `https://github.com/${organizationName}/${projectName}/edit/main`;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>DFIR MCP 아키텍처 매트릭스</h1>
      <p style={{ color: 'var(--ifm-color-emphasis-700)', marginBottom: '2rem' }}>
        셀을 누르면 그 셀의 정의와 서버별 구현을 봅니다.
        {data.updated_at && <span style={{ color: 'var(--ifm-color-emphasis-600)', fontSize: '0.85rem' }}> · 최종 갱신 {data.updated_at}</span>}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <GridBoard data={data} openCell={cell?.id ?? null} onOpen={openDrawer} />
      </div>

      {cell && (openServer ? (
        <PageDrawer
          title={openServer}
          subtitle={cell.id}
          label={`${openServer} ${cell.id} 원고`}
          url={`${baseUrl}reports/${openServer}/${cell.axis}/${cell.id}`}
          detail={openDetail}
          editUrl={`${editBase}/reports/${openServer}/${cell.axis}/${cell.id}.mdx`}
          back={{ label: cell.id, onClick: () => history.replace(withOpen(cell.id)) }}
          onClose={closeDrawer}
        />
      ) : (
        <PageDrawer
          title={`${cell.id} ${cell.name}`}
          label={`${cell.id} ${cell.name} 셀`}
          url={`${baseUrl}${cell.axis}/${cell.id}`}
          detail={null}
          editUrl={`${editBase}/matrix/cells/${cell.axis}/${cell.id}.mdx`}
          onClose={closeDrawer}
        />
      ))}
    </div>
  );
}
