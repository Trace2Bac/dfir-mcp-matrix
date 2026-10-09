import React from 'react';
import Link from '@docusaurus/Link';
import styles from './Matrix.module.css';

type Props = {
  data: any;
  openCell: string | null; // 패널에 연 셀
  onOpen: (e: React.MouseEvent, cell: string) => void;
};

export default function GridBoard({ data, openCell, onOpen }: Props) {
  // 축 수만큼 열을 만든다. 축은 matrix/cells/<축>/index.mdx에서 오므로 축을 더해도 여기를 고치지 않는다
  const n = Object.keys(data.axes).length;
  return (
    <div className={styles.scroll}>
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(140px, 1fr))`, minWidth: `${n * 150}px` }}
      >
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
                onClick={e => onOpen(e, c.id)}
                className={`${styles.tile} ${c.id === openCell ? styles.tileActive : ''}`}
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
