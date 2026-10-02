import React, { useState, useEffect } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import GridBoard from './GridBoard';
import CellPanel from './CellPanel';
import ImplPanel from './ImplPanel';

export default function MatrixGrid() {
  const [data, setData] = useState<any>(null);
  const [curCell, setCurCell] = useState<string | null>(null);
  const [curImpl, setCurImpl] = useState<string | null>(null);

  const dataUrl = useBaseUrl('/data/matrix.json');

  useEffect(() => {
    fetch(dataUrl)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error);
  }, [dataUrl]);

  if (!data) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>데이터를 불러오는 중입니다...</div>;
  }

  const selectedCellData = data.cells.find((c: any) => c.id === curCell);
  
  // impl key: "cid|server|iid"
  const activeImplData = curImpl ? data.impl[curImpl] : null;
  const activeImplParts = curImpl ? curImpl.split('|') : null;

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
        매트릭스 v2
        {data.updated_at && (
          <span style={{ fontSize: '0.5em', color: 'var(--ifm-color-emphasis-500)', fontWeight: 'normal' }}>
            (최종 업데이트: {data.updated_at})
          </span>
        )}
      </h1>
      <p style={{ color: 'var(--ifm-color-emphasis-600)', marginBottom: '2rem' }}>
        셀을 누르면 아래에 상세 항목(구현 방식)과 그 방식을 쓰는 MCP 서버를 확인 가능.<br/>
        서버를 누르면 그 서버의 구현·예외·근거를 상세히 확인할 수 있으며, †는 예외가 있는 구현임.
      </p>

      <GridBoard 
        data={data} 
        curCell={curCell} 
        setCurCell={setCurCell} 
        setCurImpl={setCurImpl} 
      />

      <CellPanel 
        selectedCellData={selectedCellData} 
        curImpl={curImpl} 
        setCurImpl={setCurImpl} 
      />

      <ImplPanel 
        activeImplData={activeImplData} 
        activeImplParts={activeImplParts} 
        selectedCellData={selectedCellData} 
      />
    </div>
  );
}
