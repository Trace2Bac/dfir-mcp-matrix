import React, { useState } from 'react';
import styles from './Matrix.module.css';

export default function CellPanel({ selectedCellData, curImpl, setCurImpl }: any) {
  const [showDefs, setShowDefs] = useState(false);

  if (!selectedCellData) return null;

  return (
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
  );
}
