import React, { useState, useEffect } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Link from '@docusaurus/Link';
import Admonition from '@theme/Admonition';

export default function CellToolList({ cellId }: { cellId: string }) {
  const [data, setData] = useState<any>(null);
  const dataUrl = useBaseUrl('/data/matrix.json');

  useEffect(() => {
    fetch(dataUrl)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error);
  }, [dataUrl]);

  if (!data) return null;

  const cell = data.cells.find((c: any) => c.id === cellId);
  if (!cell) return null;

  const defined = cell.defined || false;
  const studied = cell.studied || 0;
  
  return (
    <div style={{ marginTop: '2rem' }}>
      {!defined && (
        <Admonition type="danger" title="미조사">
          상세 항목 이름만 정했고 조사는 아직 없습니다.
        </Admonition>
      )}
      
      {defined && studied === 0 && (
        <Admonition type="warning" title="미조사">
          상세 항목 정의는 있지만 조사한 서버가 없습니다.
        </Admonition>
      )}
      
      {(cell.dscope || cell.note) && (
        <Admonition type="info" title="상세 항목 정의">
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {cell.dscope && <li><strong>적용 범위:</strong> {cell.dscope}</li>}
            {cell.note && <li><strong>다른 셀과의 경계:</strong> {cell.note}</li>}
          </ul>
        </Admonition>
      )}

      <div style={{ marginTop: '3rem', borderTop: '1px solid var(--ifm-color-emphasis-200)', paddingTop: '2rem' }}>
        {cell.rows?.map((r: any) => {
          const hasTools = r.m && r.m.length > 0;
          const hasSeen = r.seen && r.seen.length > 0;
          return (
            <div key={r.id} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>{r.id} {r.name}</h3>
              {r.inc && <div style={{ fontSize: '0.9rem', marginBottom: '0.2rem' }}><strong>포함:</strong> {r.inc}</div>}
              {r.exc && <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}><strong>제외:</strong> {r.exc}</div>}
              
              {r.cand ? (
                <div style={{ fontStyle: 'italic', color: 'var(--ifm-color-emphasis-600)' }}>구현 사례 없음 (후보)</div>
              ) : !hasTools && !hasSeen ? (
                <div style={{ fontStyle: 'italic', color: 'var(--ifm-color-emphasis-600)' }}>해당 서버 없음</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {r.m?.map((m: any) => (
                    <Link 
                      key={m.s} 
                      to={`/reports/${m.s}/${cellId}`}
                      className="button button--secondary button--sm" 
                      style={{ fontWeight: 'normal' }}
                    >
                      {m.s}
                      {m.d && <span style={{ color: 'var(--ifm-color-danger)', marginLeft: '4px' }}>†</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
