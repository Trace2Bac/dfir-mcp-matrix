import React, { useState, useEffect } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import GridBoard from './GridBoard';
import CellDrawer, { isPlainClick, useCellDrawerQuery } from './CellDrawer';

export default function MatrixGrid() {
  const [data, setData] = useState<any>(null);
  const dataUrl = useBaseUrl('/data/matrix.json');
  const { openCell, openServer, openDetail, open, close } = useCellDrawerQuery();

  const openDrawer = (e: React.MouseEvent, cell: string) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    open(cell);
  };

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

      {cell && <CellDrawer cell={cell} openServer={openServer} openDetail={openDetail} open={open} onClose={close} />}
    </div>
  );
}
