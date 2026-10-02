import React from 'react';
import styles from './Matrix.module.css';

export default function GridBoard({ data, curCell, setCurCell, setCurImpl }: any) {
  return (
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
  );
}
