import React, { useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import Link from '@docusaurus/Link';
import styles from '../Matrix/Matrix.module.css';

// problems.json의 원고(셀) 하나. tools/problems_build.py가 problems/_data/*.csv에서 만든다.
// 소제목(heads)은 서버가 수행하는 처리 하나이고, 문제는 소제목에 놓인 원래 묶음이다.
// 한 묶음이 여러 소제목에 갈릴 수 있어 문제 번호(id)만으로는 겹치므로, 화면에서는 "소제목/문제" 키(key)로 가리킨다
export type ProblemCellData = {
  id: string; // 1.3
  name: string;
  axis: string; // 장 번호 1~4
  heads: { id: string; name: string; desc: string; problems: ProblemItem[] }[];
};
export type ProblemItem = { key: string; id: string; name: string; den: number | null; obs: string[]; exps: string[]; path: string };
export type ProblemsData = { chapters: Record<string, string>; cells: ProblemCellData[]; updated_at?: string };

// 패널에 연 원고·문제·서버는 ?cell=&problem=&server=로 주소에 남긴다.
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

// 키(소제목/문제)로 문제를 찾는다. path는 baseUrl을 붙이기 전의 문제 페이지 경로다
export const findProblem = (cell: ProblemCellData, key: string | null): ProblemItem | null =>
  key ? cell.heads.flatMap(h => h.problems).find(p => p.key === key) ?? null : null;

type Props = {
  cell: ProblemCellData;
  openProblem: string | null;
  openServer: string | null;
  onOpen: (problem: string, server: string | null) => void; // 문제나 서버를 눌러 문제 화면을 패널에 열 때
};

// 원고의 구현방안 소제목마다 문제 묶음과 문제가 관찰된 서버. 원고 화면과 매트릭스 패널이 함께 쓴다
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
        원고의 소제목(서버가 수행하는 처리)마다, 공개 서버에서 관찰된 문제를 묶어 보여 줍니다. 문제를 누르면 그 문제의 정의와 서버별 사례를 봅니다.
      </div>
      <div className={styles.details}>
        <h2 className={styles.sectionTitle}>소제목과 문제</h2>
        <div className={styles.legend}>
          <span>문제 {total}</span>
        </div>
        {cell.heads.map(h => (
          <section key={h.id} className={styles.row}>
            <h3 className={styles.rowTitle}>{h.id} {h.name}</h3>
            {h.desc && <p className={styles.specialDesc}>{h.desc}</p>}
            {h.problems.length === 0 && <div className={styles.empty}>이 소제목에 묶은 문제가 없습니다</div>}
            {h.problems.map(p => {
              const to = `/${p.path}`;
              return (
                <div key={p.key} style={{ margin: '0.6rem 0 0.9rem' }}>
                  <Link
                    to={to}
                    onClick={e => click(e, p.key, null)}
                    style={{ fontWeight: p.key === openProblem && !openServer ? 700 : 600 }}
                  >
                    {p.id} {p.name}
                  </Link>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ifm-color-emphasis-700)', margin: '0.2rem 0 0.35rem' }}>
                    해당 기능 서버 {p.den ?? '정하지 않음'} · 관찰된 서버 {p.obs.length}
                    {p.exps.length > 0 && <> · 검증 실험 {p.exps.join(', ')}</>}
                  </div>
                  <div className={styles.servers}>
                    {p.obs.map(s => (
                      <Link
                        key={s}
                        to={to}
                        onClick={e => click(e, p.key, s)}
                        className={`${styles.chip} ${p.key === openProblem && s === openServer ? styles.chipActive : ''}`}
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
