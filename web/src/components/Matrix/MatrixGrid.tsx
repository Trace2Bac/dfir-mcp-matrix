import React, { useState, useEffect } from 'react';
import styles from './Matrix.module.css';

import useBaseUrl from '@docusaurus/useBaseUrl';

export default function MatrixGrid() {
  const [data, setData] = useState<any>(null);
  const [curCell, setCurCell] = useState<string | null>(null);
  const [curImpl, setCurImpl] = useState<string | null>(null);
  const [showDefs, setShowDefs] = useState(false);

  const dataUrl = useBaseUrl('/data/matrix.json');

  useEffect(() => {
    fetch(dataUrl)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error);
  }, []);

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

      <div className={styles.scroll}>
        <div className={styles.grid}>
          {Object.keys(data.axes).map(ax => (
            <div key={ax} className={styles.col}>
              <div className={styles.colhead}>
                <span className={styles.ax}>{ax}</span>
                <span className={styles.nm}>{data.axes[ax]}</span>
              </div>
              {data.cells.filter((c: any) => c.axis === ax).map((c: any) => (
                <button
                  key={c.id}
                  className={`${styles.tile} ${c.studied ? styles.studied : ''}`}
                  aria-pressed={curCell === c.id}
                  onClick={() => {
                    if (curCell === c.id) {
                      setCurCell(null);
                      setCurImpl(null);
                    } else {
                      setCurCell(c.id);
                      setCurImpl(null);
                    }
                  }}
                >
                  <span style={{ display: 'block' }}>
                    <span className={styles.id}>{c.id}</span>
                  </span>
                  <span className={styles.t}>{c.name}</span>
                  <span className={styles.st}>
                    {c.studied ? `조사 ${c.studied}/${data.samples.length}` : '미조사'}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {selectedCellData && (
        <div className={styles.panel} id="cell">
          <div className={styles.ph}>
            <span className={styles.pid}>{selectedCellData.id}</span>
            <h2 style={{ margin: 0 }}>{selectedCellData.name}</h2>
            <button 
              className={styles.deft} 
              aria-pressed={showDefs} 
              onClick={() => setShowDefs(!showDefs)}
            >
              {showDefs ? '정의 숨기기' : '상세 항목 정의 보기'}
            </button>
          </div>
          <p className={styles.q}>{selectedCellData.q}</p>
          
          {!selectedCellData.defined && <p className={styles.state}>정의 전 · 미조사</p>}
          {selectedCellData.defined && !selectedCellData.studied && <p className={styles.state}>미조사</p>}
          
          {showDefs && (
            <>
              {selectedCellData.dscope && <p className={styles.note}>적용 범위: {selectedCellData.dscope}</p>}
              {selectedCellData.note && <p className={styles.note}>다른 셀과의 경계: {selectedCellData.note}</p>}
            </>
          )}

          <div className={styles.rows}>
            {selectedCellData.rows.map((r: any) => {
              const isSpecial = ['미구현', '비적용', '미확인'].includes(r.id);
              return (
                <div key={r.id} className={`${styles.row} ${isSpecial ? styles.sp : ''} ${r.cand ? styles.cand : ''}`}>
                  <div className={styles.nm}>
                    {!isSpecial && <span className={styles.iid}>{r.id}</span>}
                    {r.name}
                    {showDefs && (r.inc || r.exc) && (
                      <span className={styles.def}>
                        {r.inc && <span><b>포함</b> {r.inc}</span>}
                        {r.exc && <span><b>제외</b> {r.exc}</span>}
                      </span>
                    )}
                  </div>
                  <div className={styles.chips}>
                    {r.cand && <span style={{ fontSize: '12px', color: 'gray' }}>구현 사례 없음 · 후보</span>}
                    {!r.cand && r.m.length === 0 && (!r.seen || r.seen.length === 0) && (
                      <span style={{ fontSize: '12px', color: 'gray' }}>해당 서버 없음</span>
                    )}
                    {r.m.map((m: any) => {
                      const implKey = `${selectedCellData.id}|${m.s}|${r.id}`;
                      const isPressed = curImpl === implKey;
                      return (
                        <button 
                          key={m.s} 
                          className={styles.chip}
                          aria-pressed={isPressed}
                          onClick={() => setCurImpl(isPressed ? null : implKey)}
                        >
                          {m.s} {m.d && <span style={{color:'red'}}>†</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeImplData && activeImplParts && (
        <div className={`${styles.panel} ${styles.impl}`} id="impl">
          <div className={styles.ph}>
            <span className={styles.pid}>{activeImplParts[0]} · {activeImplParts[1]}</span>
          </div>
          <div className={styles.ph}>
            <h3 style={{ margin: 0 }}>
              {activeImplParts[2]} {selectedCellData?.rows.find((r:any) => r.id === activeImplParts[2])?.name}
            </h3>
            {selectedCellData?.rows.find((r:any) => r.id === activeImplParts[2])?.m.find((m:any) => m.s === activeImplParts[1])?.d && (
              <span className={styles.dag}>† 예외 있음</span>
            )}
          </div>
          
          <div className={styles.part}>
            <p className={styles.partLab}>구현</p>
            <div className={styles.htmlContent} dangerouslySetInnerHTML={{ __html: activeImplData.impl }} />
          </div>
          
          {activeImplData.exc && (
            <div className={`${styles.part} ${styles.partExc}`}>
              <p className={styles.partLab}>예외</p>
              <div className={styles.htmlContent} dangerouslySetInnerHTML={{ __html: activeImplData.exc }} />
            </div>
          )}
          
          <div className={styles.part}>
            <p className={styles.partLab}>근거</p>
            <div className={styles.htmlContent} dangerouslySetInnerHTML={{ __html: activeImplData.evid }} />
          </div>
        </div>
      )}
    </div>
  );
}
