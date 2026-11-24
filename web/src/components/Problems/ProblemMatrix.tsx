import React, { useEffect, useState } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Link from '@docusaurus/Link';
import PageDrawer from '../Matrix/PageDrawer';
import styles from '../Matrix/Matrix.module.css';
import { ProblemDetails, problemPath, useProblemQuery, isPlainClick, type ProblemsData } from './ProblemDetails';

// problems.json을 받는다. 데이터는 problems-data 플러그인이 static/data/problems.json으로 둔다(plugins/problems-data.ts)
export function useProblemsData(): ProblemsData | null {
  const [data, setData] = useState<ProblemsData | null>(null);
  const url = useBaseUrl('/data/problems.json');
  useEffect(() => {
    fetch(url).then(r => r.json()).then(setData).catch(console.error);
  }, [url]);
  return data;
}

type DrawerProps = {
  data: ProblemsData;
  cellId: string;
  openProblem: string | null;
  openServer: string | null;
  open: (cell: string | null, problem?: string | null, server?: string | null) => void;
  onClose: () => void;
};

// 원고 패널. 원고의 소제목과 문제는 받은 데이터로 바로 그리고, 문제 화면만 iframe으로 띄운다
export function ProblemDrawer({ data, cellId, openProblem, openServer, open, onClose }: DrawerProps) {
  const baseUrl = useBaseUrl('/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
  const editBase = `https://github.com/${organizationName}/${projectName}/edit/main`;
  const cell = data.cells.find(c => c.id === cellId);
  if (!cell) return null;
  const path = openProblem ? problemPath(cell, openProblem) : null;
  return (
    <PageDrawer
      title={openProblem ? `${cell.id} ${openProblem}` : `${cell.id} ${cell.name}`}
      subtitle={openServer ?? undefined}
      label={openProblem ? `${cell.id} ${openProblem} 문제` : `${cell.id} ${cell.name} 원고`}
      page={path ? { url: `${baseUrl}${path}`, detail: openServer } : null}
      openUrl={path ? undefined : `${baseUrl}problems/${cell.axis}/${cell.id}`}
      editUrl={`${editBase}/problems/_data/problems.csv`}
      back={openProblem ? { label: cell.id, onClick: () => open(cell.id) } : undefined}
      onClose={onClose}
    >
      <ProblemDetails cell={cell} openProblem={openProblem} openServer={openServer} onOpen={(p, s) => open(cell.id, p, s)} />
    </PageDrawer>
  );
}

// 첫 화면: 장(1~4)을 열로, 원고를 칸으로 놓는다. 칸을 누르면 오른쪽 패널에 그 원고의 소제목과 문제를 연다
export default function ProblemMatrix() {
  const data = useProblemsData();
  const { openCell, openProblem, openServer, open } = useProblemQuery();
  if (!data) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>데이터를 불러오는 중입니다...</div>;
  }
  const axes = Object.keys(data.chapters);
  const n = axes.length;
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <div className={styles.scroll}>
          <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${n}, minmax(160px, 1fr))`, minWidth: `${n * 170}px` }}>
            {axes.map(ax => (
              <div key={ax} className={styles.col}>
                <Link to={`/problems/${ax}`} className={styles.colhead} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <span className={styles.ax}>{ax}</span>
                  <span className={styles.nm}>{data.chapters[ax]}</span>
                </Link>
                {data.cells.filter(c => c.axis === ax).map(c => {
                  const np = c.heads.reduce((k, h) => k + h.problems.length, 0);
                  return (
                    <Link
                      key={c.id}
                      to={`/problems/${c.axis}/${c.id}`}
                      onClick={e => {
                        if (!isPlainClick(e)) return;
                        e.preventDefault();
                        open(c.id);
                      }}
                      className={`${styles.tile} ${c.id === openCell ? styles.tileActive : ''}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <span style={{ display: 'block' }}>
                        <span className={styles.id}>{c.id}</span>
                      </span>
                      <span className={styles.t}>{c.name}</span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ifm-color-emphasis-600)' }}>
                        소제목 {c.heads.length} · 문제 {np}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {openCell && (
        <ProblemDrawer data={data} cellId={openCell} openProblem={openProblem} openServer={openServer} open={open} onClose={() => open(null)} />
      )}
    </div>
  );
}
