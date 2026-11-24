import React, { useEffect, useState } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Link from '@docusaurus/Link';
import PageDrawer from './PageDrawer';
import styles from './Problems.module.css';
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

// 항목 패널. 항목의 소제목과 문제는 받은 데이터로 바로 그리고, 문제 화면만 iframe으로 띄운다
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
      label={openProblem ? `${cell.id} ${openProblem} 문제` : `${cell.id} ${cell.name} 항목`}
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

// 관찰된 서버 수의 구간. 네모 색을 정한다
const LEVELS: { cls: 'lv1' | 'lv2' | 'lv3' | 'lv4'; label: string; min: number }[] = [
  { cls: 'lv4', label: '7+', min: 7 },
  { cls: 'lv3', label: '4~6', min: 4 },
  { cls: 'lv2', label: '2~3', min: 2 },
  { cls: 'lv1', label: '1', min: 0 },
];
const level = (n: number) => LEVELS.find(l => n >= l.min)!.cls;

// 문제 매트릭스 화면: 장(1~4)을 열로, 항목을 칸으로 놓는다. 서버 × 문제 지도는 첫 화면(src/pages/index.tsx)에 있다
export default function ProblemMatrix() {
  const data = useProblemsData();
  const { openCell, openProblem, openServer, open } = useProblemQuery();
  if (!data) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>데이터를 불러오는 중입니다...</div>;
  }
  return (
    <div>
      <StructureGrid data={data} openCell={openCell} openProblem={openProblem} open={open} />
      {openCell && (
        <ProblemDrawer data={data} cellId={openCell} openProblem={openProblem} openServer={openServer} open={open} onClose={() => open(null)} />
      )}
    </div>
  );
}

// 구조 보기: 장(1~4)을 열로, 항목을 칸으로 놓는다. 칸 안에는 소제목 줄을 두고, 줄마다 문제를 네모 하나로 그린다.
// 항목 이름을 누르면 오른쪽 패널에 그 항목을, 네모를 누르면 그 문제를 연다
function StructureGrid({ data, openCell, openProblem, open }: Omit<DrawerProps, 'cellId' | 'openServer' | 'onClose'> & { openCell: string | null }) {
  const axes = Object.keys(data.chapters);
  const n = axes.length;
  return (
    <div>
      <div className={styles.legend}>
        <span>네모 하나 = 문제 하나 · 색 = 관찰된 서버 수</span>
        {[...LEVELS].reverse().map(l => (
          <span key={l.cls} className={styles.dotLegend}>
            <span className={`${styles.dot} ${styles[l.cls]}`} />
            {l.label}
          </span>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div className={styles.scroll}>
          <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${n}, minmax(240px, 1fr))`, minWidth: `${n * 250}px` }}>
            {axes.map(ax => (
              <div key={ax} className={styles.col}>
                <Link to={`/problems/${ax}`} className={styles.colhead} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <span className={styles.ax}>{ax}</span>
                  <span className={styles.nm}>{data.chapters[ax]}</span>
                </Link>
                {data.cells.filter(c => c.axis === ax).map(c => {
                  const np = c.heads.reduce((k, h) => k + h.problems.length, 0);
                  return (
                    <div key={c.id} className={`${styles.tile} ${c.id === openCell ? styles.tileActive : ''}`}>
                      <Link
                        to={`/problems/${c.axis}/${c.id}`}
                        onClick={e => {
                          if (!isPlainClick(e)) return;
                          e.preventDefault();
                          open(c.id);
                        }}
                        className={styles.tileHead}
                      >
                        <span className={styles.id}>{c.id}</span>
                        <span className={styles.t}>{c.name}</span>
                        <span className={styles.tileMeta}>
                          소제목 {c.heads.length} · 문제 {np}
                        </span>
                      </Link>
                      <div className={styles.heads}>
                        {c.heads.map(h => (
                          <div key={h.id} className={styles.head}>
                            <span className={styles.headName}>
                              <span className={styles.hid}>{h.id.split('.').pop()}</span>
                              {h.name}
                            </span>
                            <span className={styles.dots}>
                              {h.problems.map(p => (
                                <Link
                                  key={p.id}
                                  to={`/${problemPath(c, p.id)}`}
                                  onClick={e => {
                                    if (!isPlainClick(e)) return;
                                    e.preventDefault();
                                    open(c.id, p.id);
                                  }}
                                  title={`${p.id} ${p.name} · 관찰된 서버 ${p.obs.length}`}
                                  aria-label={`${p.id} ${p.name}`}
                                  className={`${styles.dot} ${styles[level(p.obs.length)]} ${c.id === openCell && p.id === openProblem ? styles.dotActive : ''}`}
                                />
                              ))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
