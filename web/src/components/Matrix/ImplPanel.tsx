import React from 'react';
import styles from './Matrix.module.css';

export default function ImplPanel({ activeImplData, activeImplParts, selectedCellData }: any) {
  if (!activeImplData || !activeImplParts) return null;

  return (
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
  );
}
