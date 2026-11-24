import React, { useMemo, useRef, useState } from 'react';
import useIsBrowser from '@docusaurus/useIsBrowser';
import Link from '@docusaurus/Link';
import styles from './ProblemMap.module.css';
import { useProblemQuery, type ProblemsData, type State } from './ProblemDetails';
import { ProblemDrawer, useProblemsData } from './ProblemMatrix';

// 장마다 한 가지 색. 관찰된 칸, 장 띠, 문제별 막대에 같이 쓴다
export const CHAPTER_COLOR: Record<string, string> = { '1': '#3b82f6', '2': '#8b5cf6', '3': '#14b8a6', '4': '#f59e0b' };

// 지도 배치(SVG 좌표). 칸 하나가 문제 하나 × 서버 하나다
const CELL = 8; // 칸 너비
const STEP = 9; // 칸 너비와 간격
const CELL_H = 14; // 칸 높이(서버 이름을 읽을 수 있게 줄을 넉넉히 둔다)
const ROW = 17; // 줄 높이와 간격
const CELL_GAP = 6; // 항목 사이
const CHAPTER_GAP = 14; // 장 사이
const LABEL_W = 214; // 서버 이름
const BAND_H = 26; // 장 띠
const ID_H = 22; // 항목 번호
const BAR_H = 56; // 문제별 관찰 서버 수 막대
const TOTAL_W = 120; // 서버별 합계 막대

type Col = {
  id: string;
  name: string;
  cell: string;
  cellName: string;
  head: string;
  axis: string;
  obs: Set<string>;
  den: number;
  st: Record<string, State>;
  x: number;
};

function layout(data: ProblemsData) {
  const cols: Col[] = [];
  const groups: { cell: string; name: string; axis: string; x0: number; x1: number }[] = [];
  const chapters: { axis: string; x0: number; x1: number }[] = [];
  let x = 0;
  let prevAxis: string | null = null;
  for (const c of data.cells) {
    if (prevAxis !== null) x += c.axis === prevAxis ? CELL_GAP : CHAPTER_GAP;
    if (c.axis !== prevAxis) chapters.push({ axis: c.axis, x0: x, x1: x });
    prevAxis = c.axis;
    const x0 = x;
    for (const h of c.heads)
      for (const p of h.problems) {
        cols.push({
          id: p.id,
          name: p.name,
          cell: c.id,
          cellName: c.name,
          head: `${h.id} ${h.name}`,
          axis: c.axis,
          obs: new Set(p.obs),
          den: p.den,
          st: p.states,
          x,
        });
        x += STEP;
      }
    groups.push({ cell: c.id, name: c.name, axis: c.axis, x0, x1: x - (STEP - CELL) });
    chapters[chapters.length - 1].x1 = x - (STEP - CELL);
  }
  return { cols, groups, chapters, width: x };
}

type Hover = { col: number; row: number | null; x: number; y: number } | null;

// 첫 화면의 지도: 줄은 서버, 열은 문제(장 → 항목 → 소제목 차례)다. 칸은 그 서버의 마지막 판정이다
export function ProblemMapView({ data }: { data: ProblemsData }) {
  const { openCell, openProblem, openServer, open } = useProblemQuery();
  const [hover, setHover] = useState<Hover>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  const [byCount, setByCount] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { cols, groups, chapters, width } = useMemo(() => layout(data), [data]);
  const servers = useMemo(
    () =>
      data.servers
        .map(s => ({ name: s, n: cols.filter(c => c.obs.has(s)).length }))
        .sort((a, b) => (byCount ? b.n - a.n : 0) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [data, cols, byCount],
  );
  const maxObs = Math.max(...cols.map(c => c.obs.size), 1);
  const maxServer = Math.max(...servers.map(s => s.n), 1);

  const top = BAND_H + ID_H + BAR_H + 10;
  const mapX = LABEL_W;
  const W = mapX + width + 16 + TOTAL_W;
  const H = top + servers.length * ROW + 4;
  const dim = (axis: string) => chapter !== null && chapter !== axis;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const ci = cols.findIndex(c => p.x >= mapX + c.x - 0.5 && p.x < mapX + c.x + STEP - 0.5);
    if (ci < 0 || p.y < BAND_H + ID_H) return setHover(null);
    const ri = p.y >= top ? Math.floor((p.y - top) / ROW) : null;
    const rect = wrapRef.current!.getBoundingClientRect();
    setHover({ col: ci, row: ri !== null && ri < servers.length ? ri : null, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const onClick = () => {
    if (!hover) return;
    const c = cols[hover.col];
    const s = hover.row !== null ? servers[hover.row].name : null;
    open(c.cell, c.id, s && c.obs.has(s) ? s : null);
  };

  const hc = hover ? cols[hover.col] : null;
  const hs = hover && hover.row !== null ? servers[hover.row] : null;
  const pairs = cols.reduce((k, c) => k + c.obs.size, 0);
  const fixedN = cols.reduce((k, c) => k + Object.values(c.st).filter(x => x.change === '고쳐짐').length, 0);
  const unkN = cols.reduce((k, c) => k + Object.values(c.st).filter(x => x.s === 'unk').length, 0);
  const ranked = [...cols].sort((a, b) => b.obs.size - a.obs.size || a.id.localeCompare(b.id)).slice(0, 10);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>DFIR MCP 문제 지도</h1>
          <p className={styles.lead}>
            공개 DFIR MCP 서버 {data.servers.length}개에서 관찰된 구현 문제 {cols.length}개를 가이드라인 목차에 따라 한 장에 놓았습니다.
            <br />
            줄은 서버, 열은 문제입니다. 칸은 그 서버에서 마지막으로 확인한 판정입니다.
          </p>
        </div>
        <div className={styles.kpis}>
          <Kpi n={data.cells.length} label="항목" />
          <Kpi n={data.cells.reduce((k, c) => k + c.heads.length, 0)} label="소제목" />
          <Kpi n={cols.length} label="문제" />
          <Kpi n={data.servers.length} label="서버" />
          <Kpi n={pairs} label="관찰됨" />
          <Kpi n={fixedN} label="고쳐짐" />
          <Kpi n={unkN} label="확인 안 함" />
        </div>
      </header>

      <div className={styles.filters}>
        <button type="button" className={`${styles.filter} ${chapter === null ? styles.filterOn : ''}`} onClick={() => setChapter(null)}>
          전체
        </button>
        {Object.entries(data.chapters).map(([ax, name]) => (
          <button
            key={ax}
            type="button"
            className={`${styles.filter} ${chapter === ax ? styles.filterOn : ''}`}
            onClick={() => setChapter(chapter === ax ? null : ax)}
          >
            <i style={{ background: CHAPTER_COLOR[ax] }} />
            {ax} {name}
          </button>
        ))}
        <button type="button" className={`${styles.filter} ${byCount ? styles.filterOn : ''}`} onClick={() => setByCount(!byCount)}>
          {byCount ? '관찰 수 차례' : '이름 차례'}
        </button>
        <span className={styles.legend}>
          <i className={styles.lgObs} /> 관찰됨
          <i className={styles.lgFixed} /> 고쳐짐
          <i className={styles.lgScope} /> 문제 없음
          <i className={styles.lgEst} /> 문제 없음(추정)
          <i className={styles.lgUnk} /> 확인 안 함
          <i className={styles.lgNone} /> 기능 없음
        </span>
      </div>

      <div className={styles.mapWrap} ref={wrapRef} onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={styles.map}
          role="img"
          aria-label="서버 × 문제 지도"
          onMouseMove={onMove}
          onClick={onClick}
          style={{ cursor: hover ? 'pointer' : 'default' }}
        >
          <defs>
            <pattern id="unk-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" className={styles.cNone} />
              <line x1="0" y1="0" x2="0" y2="4" className={styles.hatchLine} />
            </pattern>
          </defs>
          {/* 장 띠 */}
          {chapters.map(ch => (
            <g key={ch.axis} opacity={dim(ch.axis) ? 0.25 : 1}>
              <rect x={mapX + ch.x0} y={0} width={ch.x1 - ch.x0} height={BAND_H - 6} rx={4} fill={CHAPTER_COLOR[ch.axis]} />
              <text x={mapX + ch.x0 + 8} y={BAND_H - 10} className={styles.bandText}>
                {ch.axis} {data.chapters[ch.axis]}
              </text>
            </g>
          ))}
          {/* 항목 번호 */}
          {groups.map(g => (
            <g key={g.cell} opacity={dim(g.axis) ? 0.25 : 1}>
              <line x1={mapX + g.x0} x2={mapX + g.x1} y1={BAND_H + ID_H - 3} y2={BAND_H + ID_H - 3} stroke={CHAPTER_COLOR[g.axis]} strokeWidth={1.5} />
              <text x={mapX + (g.x0 + g.x1) / 2} y={BAND_H + ID_H - 7} textAnchor="middle" className={styles.idText}>
                {g.cell}
              </text>
            </g>
          ))}
          {/* 문제별 관찰 서버 수 */}
          {cols.map((c, i) => {
            const h = (c.obs.size / maxObs) * BAR_H;
            return (
              <rect
                key={c.id}
                x={mapX + c.x}
                y={BAND_H + ID_H + BAR_H + 4 - h}
                width={CELL}
                height={Math.max(h, 1)}
                rx={1}
                fill={CHAPTER_COLOR[c.axis]}
                opacity={dim(c.axis) ? 0.15 : hover && hover.col !== i ? 0.55 : 1}
              />
            );
          })}
          {/* 가리킨 줄과 열 */}
          {hover && (
            <rect x={mapX + cols[hover.col].x - 1} y={BAND_H + ID_H} width={CELL + 2} height={H - BAND_H - ID_H} rx={2} className={styles.crossCol} />
          )}
          {hover && hover.row !== null && (
            <rect x={0} y={top + hover.row * ROW - 1.5} width={W} height={ROW} rx={3} className={styles.crossRow} />
          )}
          {/* 서버 줄 */}
          {servers.map((s, r) => {
            const y = top + r * ROW;
            const active = (hover && hover.row === r) || openServer === s.name;
            return (
              <g key={s.name}>
                <text x={LABEL_W - 12} y={y + CELL_H - 3} textAnchor="end" className={`${styles.srvText} ${active ? styles.srvActive : ''}`}>
                  {s.name.length > 28 ? `${s.name.slice(0, 27)}…` : s.name}
                </text>
                {cols.map(c => {
                  const st = c.st[s.name];
                  const op = dim(c.axis) ? 0.15 : 1;
                  if (st?.change === '고쳐짐')
                    return (
                      <rect key={c.id} x={mapX + c.x + 0.75} y={y + 0.75} width={CELL - 1.5} height={CELL_H - 1.5} rx={1.5}
                        className={styles.cFixed} stroke={CHAPTER_COLOR[c.axis]} opacity={op} />
                    );
                  const cls = !st ? styles.cNone : st.s === 'ok' ? (st.est ? styles.cEst : styles.cScope) : st.s === 'unk' ? styles.cUnk : undefined;
                  return (
                    <rect key={c.id} x={mapX + c.x} y={y} width={CELL} height={CELL_H} rx={1.5} className={cls}
                      fill={st?.s === 'obs' ? CHAPTER_COLOR[c.axis] : undefined} opacity={op} />
                  );
                })}
                <rect x={mapX + width + 16} y={y + 2} width={(s.n / maxServer) * (TOTAL_W - 34)} height={CELL_H - 4} rx={2} className={styles.totalBar} />
                <text x={mapX + width + 16 + (s.n / maxServer) * (TOTAL_W - 34) + 5} y={y + CELL_H - 3} className={styles.totalText}>
                  {s.n}
                </text>
              </g>
            );
          })}
          {/* 패널에 연 문제 */}
          {openProblem &&
            cols.map(c =>
              c.id === openProblem ? (
                <rect key="open" x={mapX + c.x - 1.5} y={BAND_H + ID_H} width={CELL + 3} height={H - BAND_H - ID_H} rx={2} className={styles.openCol} />
              ) : null,
            )}
          <text x={mapX + width + 16} y={top - 6} className={styles.totalHead}>
            관찰된 문제
          </text>
        </svg>

        {hc && (
          <div
            className={styles.tip}
            style={{
              left: Math.min(hover!.x + 14, (wrapRef.current?.clientWidth ?? 0) - 330),
              top: hover!.y + 16,
            }}
          >
            <div className={styles.tipHead}>
              <span className={styles.tipId} style={{ background: CHAPTER_COLOR[hc.axis] }}>
                {hc.id}
              </span>
              <span className={styles.tipCell}>
                {hc.cell} {hc.cellName}
              </span>
            </div>
            <div className={styles.tipName}>{hc.name}</div>
            <div className={styles.tipMeta}>소제목 {hc.head}</div>
            <div className={styles.tipMeta}>
              관찰됨 {hc.obs.size} / 기능 있는 서버 {hc.den}
            </div>
            {hs && (
              <div className={styles.tipServer}>
                <b>{hs.name}</b>:{' '}
                {(() => {
                  const st = hc.st[hs.name];
                  if (!st) return '기능 없음';
                  if (st.s === 'unk') return '확인 안 함';
                  const name = st.s === 'obs' ? '관찰됨' : st.est ? '문제 없음(추정)' : '문제 없음';
                  return `${name}${st.change ? ` · ${st.change}` : ''} · ${st.commit} (${st.date})`;
                })()}
              </div>
            )}
          </div>
        )}
      </div>
      <p className={styles.note}>
        판정은 대부분 코드 확인(정적 분석)으로 내렸고, 실행 검증은 문제 화면에 따로 적었습니다. 문제 없음(추정)은 근거 대장에서 옮긴 판정으로 아직 코드로 다시 확인하지 않았습니다. 서버별 합계는 기능이 많은 서버일수록 커집니다. 모든 판정은 서버마다 표시된 커밋 기준이며, 서버의 현재 버전과 다를 수 있습니다.
      </p>

      <section className={styles.below}>
        <div className={styles.panel}>
          <h2 className={styles.h2}>가장 많은 서버에서 관찰된 문제</h2>
          <ol className={styles.rank}>
            {ranked.map(c => (
              <li key={c.id}>
                <button type="button" className={styles.rankRow} onClick={() => open(c.cell, c.id)}>
                  <span className={styles.rankId} style={{ color: CHAPTER_COLOR[c.axis] }}>
                    {c.id}
                  </span>
                  <span className={styles.rankName}>{c.name}</span>
                  <span className={styles.rankBar}>
                    <span style={{ width: `${(c.obs.size / maxObs) * 100}%`, background: CHAPTER_COLOR[c.axis] }} />
                  </span>
                  <span className={styles.rankN}>{c.obs.size}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className={styles.panel}>
          <h2 className={styles.h2}>항목별 문제</h2>
          <div className={styles.cellList}>
            {data.cells.map(c => {
              const ps = c.heads.flatMap(h => h.problems);
              const srv = new Set(ps.flatMap(p => p.obs)).size;
              return (
                <button key={c.id} type="button" className={styles.cellRow} onClick={() => open(c.id)}>
                  <span className={styles.cellId} style={{ borderColor: CHAPTER_COLOR[c.axis], color: CHAPTER_COLOR[c.axis] }}>
                    {c.id}
                  </span>
                  <span className={styles.cellName}>{c.name}</span>
                  <span className={styles.cellDots}>
                    {ps.map(p => (
                      <i key={p.id} style={{ background: CHAPTER_COLOR[c.axis], opacity: 0.25 + 0.75 * (p.obs.length / maxObs) }} />
                    ))}
                  </span>
                  <span className={styles.cellMeta}>
                    문제 {ps.length} · 서버 {srv}
                  </span>
                </button>
              );
            })}
          </div>
          <Link to="/problems/" className={styles.more}>
            항목·소제목 구조로 보기 →
          </Link>
        </div>
      </section>

      {openCell && (
        <ProblemDrawer data={data} cellId={openCell} openProblem={openProblem} openServer={openServer} open={open} onClose={() => open(null)} />
      )}
    </div>
  );
}

function Kpi({ n, label }: { n: number; label: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiN}>{n}</span>
      <span className={styles.kpiL}>{label}</span>
    </div>
  );
}

export default function ProblemMap() {
  const isBrowser = useIsBrowser();
  const data = useProblemsData();
  if (!isBrowser || !data) return <div className={styles.loading}>데이터를 불러오는 중입니다...</div>;
  return <ProblemMapView data={data} />;
}
