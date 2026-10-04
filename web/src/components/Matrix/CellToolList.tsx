import React, { useState, useEffect, useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Link from '@docusaurus/Link';
import Admonition from '@theme/Admonition';
import ReportDrawer from './ReportDrawer';
import styles from './Matrix.module.css';

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
    <div style={{ marginTop: '2rem' }}>
      {!defined && (
        <Admonition type="danger" title="미조사">
          상세 항목 이름만 정했고 조사는 아직 없습니다.
        </Admonition>
      )}
      
      {defined && studied === 0 && (
        <Admonition type="warning" title="미조사">
          상세 항목 정의는 있지만 조사한 서버가 없습니다.
        </Admonition>
      )}
      
      {(cell.dscope || cell.note) && (
        <Admonition type="info" title="상세 항목 정의">
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {cell.dscope && <li><strong>적용 범위:</strong> {cell.dscope}</li>}
            {cell.note && <li><strong>다른 셀과의 경계:</strong> {cell.note}</li>}
          </ul>
        </Admonition>
      )}

      <div style={{ marginTop: '3rem', borderTop: '1px solid var(--ifm-color-emphasis-200)', paddingTop: '2rem' }}>
        {/* 원고가 없는 서버(미확인)는 행으로 늘어놓지 않고 수만 보인다 */}
        <div className={styles.legend}>
          <span title="이 셀의 원고가 있는 서버 수 / 매트릭스의 전체 서버 수">조사한 서버 {studied}/{cell.total}</span>
          {cell.rows?.some((r: any) => r.m?.some((m: any) => m.d)) && (
            <>
              <span aria-hidden="true">·</span>
              <span className={`button button--sm button--secondary ${styles.exception}`} aria-hidden="true">서버</span>
              예외가 있는 서버(원고의 예외 단락 참고)
            </>
          )}
        </div>
        {cell.rows?.map((r: any) => {
          const detail = r.special ? r.name : r.id;
          const hasTools = r.m && r.m.length > 0;
          const hasSeen = r.seen && r.seen.length > 0;
          return (
            <div key={r.id} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>{r.special ? r.name : `${r.id} ${r.name}`}</h3>
              {r.inc && <div style={{ fontSize: '0.9rem', marginBottom: '0.2rem' }}><strong>포함:</strong> {r.inc}</div>}
              {r.exc && <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}><strong>제외:</strong> {r.exc}</div>}
              
              {r.cand ? (
                <div style={{ fontStyle: 'italic', color: 'var(--ifm-color-emphasis-600)' }}>구현 사례 없음 (후보)</div>
              ) : !hasTools && !hasSeen ? (
                <div style={{ fontStyle: 'italic', color: 'var(--ifm-color-emphasis-600)' }}>해당 서버 없음</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {r.m?.map((m: any) => (
                    <Link 
                      key={m.s} 
                      to={`/reports/${m.s}/${cell.axis}/${cellId}`}
                      onClick={e => openDrawer(e, m.s, detail)}
                      className={`button button--sm ${m.s === openServer && detail === openDetail ? 'button--primary' : 'button--secondary'} ${m.d ? styles.exception : ''}`}
                      style={{ fontWeight: 'normal' }}
                      title={m.d ? '예외 있음' : undefined}
                    >
                      {m.s}
                    </Link>
                  ))}
                </div>
              )}
            </div>
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
