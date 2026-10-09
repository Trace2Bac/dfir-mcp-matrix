import React, { useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useIsBrowser from '@docusaurus/useIsBrowser';
import Link from '@docusaurus/Link';
import PageDrawer from './PageDrawer';
import styles from './Matrix.module.css';

// 정의 글은 여러 문장이라 원고처럼 문장마다 줄을 나눠 보인다("~다." 뒤에서 나눈다)
function Sentences({ text }: { text: string }) {
  const parts = text.split(/(?<=[다요]\.)\s+/).filter(Boolean);
  if (parts.length < 2) return <>{text}</>;
  return <>{parts.map((t, i) => <span key={i} className={styles.sentence}>{t}</span>)}</>;
}

type DetailsProps = {
  cell: any; // matrix.json의 셀 하나
  openServer: string | null; // 패널에 연 서버. 그 서버 링크를 진하게 보인다
  openDetail: string | null;
  onOpen: (server: string, detail: string) => void; // 서버 링크를 눌러 원고를 패널에 열 때
};

// 셀의 정의와 상세 항목, 상세마다 해당하는 서버. 셀 화면과 매트릭스 패널이 함께 쓴다
export function CellDetails({ cell, openServer, openDetail, onOpen }: DetailsProps) {
  const defined = cell.defined || false;
  const studied = cell.studied || 0;

  // detail은 원고 소제목의 머리(상세 번호, 또는 미구현·비적용). 패널이 그 소제목으로 스크롤한다
  const open = (e: React.MouseEvent, server: string, detail: string) => {
    // 수정 키나 가운데 버튼으로 누르면 원래대로 원고 페이지를 연다
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(server, detail);
  };

  return (
    <div className={styles.cellPage}>
      {/* 확인 사항: 이 셀이 서버에서 무엇을 분류하는지 */}
      {cell.q && (
        <div className={styles.question}>
          <span className={styles.questionLabel}>확인 사항</span>
          {cell.q}
        </div>
      )}

      {!defined && <p className={styles.notice}>상세 항목 이름만 정했고 조사는 아직 없습니다.</p>}
      {defined && studied === 0 && <p className={styles.notice}>상세 항목 정의는 있지만 조사한 서버가 없습니다.</p>}

      {(cell.dscope || cell.note) && (
        <dl className={styles.defs}>
          {cell.dscope && (
            <div>
              <dt>확인 범위</dt>
              <dd><Sentences text={cell.dscope} /></dd>
            </div>
          )}
          {cell.note && (
            <div>
              <dt>다른 셀과 차이점</dt>
              <dd><Sentences text={cell.note} /></dd>
            </div>
          )}
        </dl>
      )}

      <div className={styles.details}>
        <h2 className={styles.sectionTitle}>상세 항목</h2>
        {/* 원고가 없는 서버(미확인)는 행으로 늘어놓지 않고 수만 보인다 */}
        <div className={styles.legend}>
          <span title="이 셀의 원고가 있는 서버 수">조사한 서버 {studied}</span>
        </div>
        {cell.rows?.map((r: any) => {
          const detail = r.special ? r.name : r.id;
          const hasTools = r.m && r.m.length > 0;
          const hasSeen = r.seen && r.seen.length > 0;
          return (
            <section key={r.id} className={styles.row}>
              <h3 className={styles.rowTitle}>{r.special ? r.name : `${r.id} ${r.name}`}</h3>
              {/* 미구현·비적용 행의 글은 포함 기준이 아니라 그 판정의 뜻이라 이름표 없이 설명으로만 보인다 */}
              {r.special && r.inc && (
                <p className={styles.specialDesc}><Sentences text={r.inc} /></p>
              )}
              {!r.special && (r.inc || r.exc) && (
                <dl className={styles.criteria}>
                  {r.inc && (
                    <div>
                      <dt className={styles.inc}>포함</dt>
                      <dd><Sentences text={r.inc} /></dd>
                    </div>
                  )}
                  {r.exc && (
                    <div>
                      <dt className={styles.exc}>제외</dt>
                      <dd><Sentences text={r.exc} /></dd>
                    </div>
                  )}
                </dl>
              )}

              {r.cand ? (
                <div className={styles.empty}>구현 사례 없음 (후보)</div>
              ) : !hasTools && !hasSeen ? (
                <div className={styles.empty}>해당 서버 없음</div>
              ) : (
                <div className={styles.servers}>
                  {r.m?.map((m: any) => (
                    <Link
                      key={m.s}
                      to={`/reports/${m.s}/${cell.axis}/${cell.id}`}
                      onClick={e => open(e, m.s, detail)}
                      className={`${styles.chip} ${m.s === openServer && detail === openDetail ? styles.chipActive : ''}`}
                    >
                      {m.s}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// 셀 화면. 서버 링크를 누르면 오른쪽 패널에 그 원고를 연다
export default function CellToolList({ cell }: { cell: any }) {
  const reportsUrl = useBaseUrl('/reports/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
  const isBrowser = useIsBrowser();
  const history = useHistory();
  const location = useLocation();
  // 패널에 연 서버와 원고에서 보일 소제목은 ?server=&detail=로 주소에 남긴다.
  // push로 바꾸면 Docusaurus가 페이지 맨 위로 초점을 옮겨 스크롤이 올라가므로 replace만 쓴다
  const query = new URLSearchParams(location.search);
  const openServer = query.get('server');
  const openDetail = query.get('detail');

  const withServer = (server: string | null, detail: string | null = null) => {
    const params = new URLSearchParams(location.search);
    for (const [k, v] of [['server', server], ['detail', detail]] as const) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const search = params.toString();
    return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash };
  };

  const closeDrawer = useCallback(() => {
    history.replace(withServer(null));
  }, [history, location]);

  return (
    <>
      <CellDetails
        cell={cell}
        openServer={openServer}
        openDetail={openDetail}
        onOpen={(server, detail) => history.replace(withServer(server, detail))}
      />
      {/* 셀 화면은 빌드 때 그려지고 주소의 ?server=는 브라우저에서만 알므로, 패널은 브라우저에서만 그린다 */}
      {isBrowser && openServer && (
        <PageDrawer
          title={openServer}
          subtitle={cell.id}
          label={`${openServer} ${cell.id} 원고`}
          page={{ url: `${reportsUrl}${openServer}/${cell.axis}/${cell.id}`, detail: openDetail }}
          editUrl={`https://github.com/${organizationName}/${projectName}/edit/main/reports/${openServer}/${cell.axis}/${cell.id}.mdx`}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}
