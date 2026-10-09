import React, { useState, useEffect, useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import GridBoard from './GridBoard';
import PageDrawer from './PageDrawer';
import { CellDetails } from './CellToolList';

export default function MatrixGrid() {
  const [data, setData] = useState<any>(null);
  const dataUrl = useBaseUrl('/data/matrix.json');
  const baseUrl = useBaseUrl('/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
  const history = useHistory();
  const location = useLocation();
  // 패널에 연 셀은 ?cell=로, 패널의 셀 화면에서 연 원고는 &server=&detail=로 주소에 남긴다.
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

      {/* 셀 화면은 이미 받은 데이터로 바로 그리고, 원고만 iframe으로 띄운다. 원고에서 돌아가면 셀 화면이 보던 자리 그대로 보인다 */}
      {cell && (
        <PageDrawer
          title={openServer ?? `${cell.id} ${cell.name}`}
          subtitle={openServer ? cell.id : undefined}
          label={openServer ? `${openServer} ${cell.id} 원고` : `${cell.id} ${cell.name} 셀`}
          page={openServer ? { url: `${baseUrl}reports/${openServer}/${cell.axis}/${cell.id}`, detail: openDetail } : null}
          openUrl={openServer ? undefined : `${baseUrl}${cell.axis}/${cell.id}`}
          editUrl={openServer ? `${editBase}/reports/${openServer}/${cell.axis}/${cell.id}.mdx` : `${editBase}/matrix/cells/${cell.axis}/${cell.id}.mdx`}
          back={openServer ? { label: cell.id, onClick: () => history.replace(withOpen(cell.id)) } : undefined}
          onClose={closeDrawer}
        >
          <CellDetails
            cell={cell}
            openServer={openServer}
            openDetail={openDetail}
            onOpen={(server, detail) => history.replace(withOpen(cell.id, server, detail))}
          />
        </PageDrawer>
      )}
    </div>
  );
}
