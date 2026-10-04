import React from 'react';
import Link from '@docusaurus/Link';
import styles from './Matrix.module.css';

export default function GridBoard({ data }: any) {
  return (
    <div className={styles.scroll}>
      <div className={styles.grid}>
        {Object.keys(data.axes).map(ax => (
          <div key={ax} className={styles.col}>
            <Link to={`/${ax}/`} className={styles.colhead} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <span className={styles.ax}>{ax}</span>
              <span className={styles.nm}>{data.axes[ax]}</span>
            </Link>
            {data.cells.filter((c: any) => c.axis === ax).map((c: any) => (
              <Link
                key={c.id}
                to={`/${c.axis}/${c.id}`}
                className={`${styles.tile} ${c.studied ? styles.studied : ''}`}
                style={{ textDecoration: 'none' }}
              >
                <span style={{ display: 'block' }}>
                  <span className={styles.id}>{c.id}</span>
                </span>
                <span className={styles.t}>{c.name}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
