import React, { useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import Link from '@docusaurus/Link';
import styles from './Problems.module.css';

// problems.json의 항목(셀) 하나. tools/problems_build.py가 problems/_data/*.csv에서 만든다
export type ProblemCellData = {
  id: string; // 1.3
  name: string;
  axis: string; // 장 번호 1~4
  heads: { id: string; name: string; problems: { id: string; name: string; den: number; denList: string[]; obs: string[]; ver: Record<string, string[]>; states: Record<string, State>; cwe?: string[]; cweName?: string[]; astm?: string[]; obsOnly?: boolean }[] }[];
};
// 결과 범주(ASTM E3016-18). tools/problems_build.py의 ASTM과 같은 이름이다
export const ASTM_LABEL: Record<string, string> = {
  INCOMP: '불완전', INAC_EX: '없는 것을 있다고 함', INAC_ALT: '내용 변경', INAC_AS: '잘못된 연결', INAC_COR: '손상 감지 못함', MISINT: '오해를 부르는 표시',
};
// 서버별 마지막 판정. obs 관찰됨, ok 문제 없음, unk 확인 안 함이고, 없는 서버는 기능 없음이다(tools/problems_build.py)
export type State = { s: 'obs' | 'ok' | 'unk'; est?: boolean; commit?: string; date?: string };
export type ProblemsData = { chapters: Record<string, string>; servers: string[]; cells: ProblemCellData[]; updated_at?: string };

// 패널에 연 항목·문제·서버는 ?cell=&problem=&server=로 주소에 남긴다.
// push로 바꾸면 Docusaurus가 페이지 맨 위로 초점을 옮겨 스크롤이 올라가므로 replace만 쓴다(매트릭스 화면과 같음)
export function useProblemQuery() {
  const history = useHistory();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const open = useCallback(
    (cell: string | null, problem: string | null = null, server: string | null = null) => {
      const params = new URLSearchParams(location.search);
      for (const [k, v] of [['cell', cell], ['problem', problem], ['server', server]] as const) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      const search = params.toString();
      history.replace({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash });
    },
    [history, location],
  );
  return { openCell: query.get('cell'), openProblem: query.get('problem'), openServer: query.get('server'), open };
}

export const isPlainClick = (e: React.MouseEvent) => e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

export const problemPath = (cell: ProblemCellData, problem: string) => `problems/${cell.axis}/${cell.id}/${problem}`;

type Props = {
  cell: ProblemCellData;
  openProblem: string | null;
  openServer: string | null;
  onOpen: (problem: string, server: string | null) => void; // 문제나 서버를 눌러 문제 화면을 패널에 열 때
};

// 항목의 소제목마다 문제와 문제가 관찰된 서버. 항목 화면과 매트릭스 패널이 함께 쓴다
export function ProblemDetails({ cell, openProblem, openServer, onOpen }: Props) {
  const click = (e: React.MouseEvent, problem: string, server: string | null) => {
    if (!isPlainClick(e)) return; // 수정 키나 가운데 버튼은 원래대로 문제 페이지를 연다
    e.preventDefault();
    onOpen(problem, server);
  };
  const total = cell.heads.reduce((n, h) => n + h.problems.length, 0);
  return (
    <div className={styles.cellPage}>
      <div className={styles.question}>
        <span className={styles.questionLabel}>확인 사항</span>
        항목의 소제목(1.3.2)마다, 공개 서버에서 관찰된 문제(P1001)를 보여 줍니다. 문제를 누르면 그 문제의 정의와 서버별 사례를 봅니다.
      </div>
      <div className={styles.details}>
        <h2 className={styles.sectionTitle}>소제목과 문제</h2>
        <div className={styles.legend}>
          <span>문제 {total}</span>
        </div>
        {cell.heads.map(h => (
          <section key={h.id} className={styles.row}>
            <h3 className={styles.rowTitle}>{h.id} {h.name}</h3>
            {h.problems.length === 0 && <div className={styles.empty}>이 소제목에 묶은 문제가 없습니다</div>}
            {h.problems.map(p => {
              const to = `/${problemPath(cell, p.id)}`;
              return (
                <div key={p.id} style={{ margin: '0.6rem 0 0.9rem' }}>
                  <Link
                    to={to}
                    onClick={e => click(e, p.id, null)}
                    style={{ fontWeight: p.id === openProblem && !openServer ? 700 : 600 }}
                  >
                    {p.id} {p.name}
                  </Link>
                  {(p.cwe?.length || p.astm?.length) ? (
                    <div style={{ margin: '0.3rem 0 0.1rem' }}>
                      {p.cwe?.map((c, i) => (
                        <span key={c} style={{ marginRight: '0.5rem', fontSize: '0.8rem' }}>
                          <a className="pm-cwe" href={`https://cwe.mitre.org/data/definitions/${c.slice(4)}.html`} target="_blank" rel="noopener noreferrer">{c}</a>
                          {p.cweName?.[i]}
                        </span>
                      ))}
                      {p.astm?.map(a => (
                        <span key={a} className="pm-astm" title={`ASTM E3016: ${ASTM_LABEL[a] ?? a}`}>{a} {ASTM_LABEL[a]}</span>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ fontSize: '0.8rem', color: 'var(--ifm-color-emphasis-700)', margin: '0.2rem 0 0.35rem' }}>
                    {p.obsOnly ? <>관찰됨 {p.obs.length}</> : <>기능 있음 {p.den} · 관찰됨 {p.obs.length}</>}
                    {(() => {
                      const run = Object.values(p.ver).filter(ms => ms.some(m => m !== '코드 확인')).length;
                      return run > 0 ? <> · 실행 검증 {run}</> : null;
                    })()}
                  </div>
                  <div className={styles.servers}>
                    {p.obs.map(s => (
                      <Link
                        key={s}
                        to={to}
                        onClick={e => click(e, p.id, s)}
                        className={`${styles.chip} ${p.id === openProblem && s === openServer ? styles.chipActive : ''}`}
                      >
                        {s}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
