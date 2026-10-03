import React, { useState, useEffect } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import GridBoard from './GridBoard';

export default function MatrixGrid() {
  const [data, setData] = useState<any>(null);
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

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingTop: '1rem' }}>
      <h2 style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', margin: '0 0 0.5rem 0' }}>
        DFIR MCP Architecture Matrix
        {data.updated_at && (
          <span style={{ fontSize: '0.65rem', color: 'var(--ifm-color-emphasis-500)', fontWeight: 'normal' }}>
            (최종 업데이트: {data.updated_at})
          </span>
        )}
      </h2>
      <p style={{ color: 'var(--ifm-color-emphasis-600)', marginBottom: '2rem', fontSize: '0.85rem' }}>
        셀을 누르면 개별 문서(Cell Page)로 이동하여 상세 정보를 확인할 수 있습니다.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <GridBoard data={data} />
      </div>
    </div>
  );
}
