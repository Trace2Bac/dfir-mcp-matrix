import React, { useState, useEffect, useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Link from '@docusaurus/Link';
import ReportDrawer from './ReportDrawer';
import styles from './Matrix.module.css';

// 정의 글은 여러 문장이라 원고처럼 문장마다 줄을 나눠 보인다("~다." 뒤에서 나눈다)
function Sentences({ text }: { text: string }) {
  const parts = text.split(/(?<=[다요]\.)\s+/).filter(Boolean);
  if (parts.length < 2) return <>{text}</>;
  return <>{parts.map((t, i) => <span key={i} className={styles.sentence}>{t}</span>)}</>;
}

export default function CellToolList({ cellId }: { cellId: string }) {
  const [data, setData] = useState<any>(null);
  const dataUrl = useBaseUrl('/data/matrix.json');
  const reportsUrl = useBaseUrl('/reports/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
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

  // detail은 원고 소제목의 머리(상세 번호, 또는 미구현·비적용). 패널이 그 소제목으로 스크롤한다
  const openDrawer = (e: React.MouseEvent, server: string, detail: string) => {
    // 수정 키나 가운데 버튼으로 누르면 원래대로 원고 페이지를 연다
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.replace(withServer(server, detail));
  };

  const closeDrawer = useCallback(() => {
    history.replace(withServer(null));
  }, [history, location]);

  useEffect(() => {
    fetch(dataUrl)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error);
  }, [dataUrl]);

  if (!data) return null;

  const cell = data.cells.find((c: any) => c.id === cellId);
  if (!cell) return null;

  const defined = cell.defined || false;
  const studied = cell.studied || 0;
  
  return (
    <div className={styles.cellPage}>
      {/* 셀 질문: 이 셀이 서버에 묻는 것 */}
      {cell.q && <p className={styles.question}>{cell.q}</p>}

      {!defined && <p className={styles.notice}>상세 항목 이름만 정했고 조사는 아직 없습니다.</p>}
      {defined && studied === 0 && <p className={styles.notice}>상세 항목 정의는 있지만 조사한 서버가 없습니다.</p>}

      {(cell.dscope || cell.note) && (
        <dl className={styles.defs}>
          {cell.dscope && (
            <div>
              <dt>적용 범위</dt>
              <dd><Sentences text={cell.dscope} /></dd>
            </div>
          )}
          {cell.note && (
            <div>
              <dt>다른 셀과의 경계</dt>
              <dd><Sentences text={cell.note} /></dd>
            </div>
          )}
        </dl>
      )}

      <div className={styles.details}>
        <h2 className={styles.sectionTitle}>상세 항목</h2>
        {/* 원고가 없는 서버(미확인)는 행으로 늘어놓지 않고 수만 보인다 */}
        <div className={styles.legend}>
          <span title="이 셀의 원고가 있는 서버 수 / 매트릭스의 전체 서버 수">조사한 서버 {studied}/{cell.total}</span>
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
                      to={`/reports/${m.s}/${cell.axis}/${cellId}`}
                      onClick={e => openDrawer(e, m.s, detail)}
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

      {openServer && (
        <ReportDrawer
          server={openServer}
          cellId={cellId}
          url={`${reportsUrl}${openServer}/${cell.axis}/${cellId}`}
          detail={openDetail}
          editUrl={`https://github.com/${organizationName}/${projectName}/edit/main/reports/${openServer}/${cell.axis}/${cellId}.mdx`}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
