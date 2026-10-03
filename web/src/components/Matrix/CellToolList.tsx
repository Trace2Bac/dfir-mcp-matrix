import React, { useState, useEffect, useCallback } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Link from '@docusaurus/Link';
import Admonition from '@theme/Admonition';
import ReportDrawer from './ReportDrawer';

// 이 셀의 원고가 없는 서버를 모은 행(tools/pilot.py의 TERMS["unknown"]). 열 원고가 없어 링크를 달지 않는다
const UNKNOWN_ROW = '미확인';

export default function CellToolList({ cellId }: { cellId: string }) {
  const [data, setData] = useState<any>(null);
  const dataUrl = useBaseUrl('/data/matrix.json');
  const reportsUrl = useBaseUrl('/reports/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
  const history = useHistory();
  const location = useLocation();
  // 패널에 연 서버는 ?server=로 주소에 남긴다.
  // push로 바꾸면 Docusaurus가 페이지 맨 위로 초점을 옮겨 스크롤이 올라가므로 replace만 쓴다
  const openServer = new URLSearchParams(location.search).get('server');

  const withServer = (server: string | null) => {
    const params = new URLSearchParams(location.search);
    if (server) params.set('server', server);
    else params.delete('server');
    const search = params.toString();
    return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash };
  };

  const openDrawer = (e: React.MouseEvent, server: string) => {
    // 수정 키나 가운데 버튼으로 누르면 원래대로 원고 페이지를 연다
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.replace(withServer(server));
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
        {cell.rows?.map((r: any) => {
          const hasTools = r.m && r.m.length > 0;
          const hasSeen = r.seen && r.seen.length > 0;
          return (
            <div key={r.id} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>{r.id === r.name ? r.name : `${r.id} ${r.name}`}</h3>
              {r.inc && <div style={{ fontSize: '0.9rem', marginBottom: '0.2rem' }}><strong>포함:</strong> {r.inc}</div>}
              {r.exc && <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}><strong>제외:</strong> {r.exc}</div>}
              
              {r.cand ? (
                <div style={{ fontStyle: 'italic', color: 'var(--ifm-color-emphasis-600)' }}>구현 사례 없음 (후보)</div>
              ) : !hasTools && !hasSeen ? (
                <div style={{ fontStyle: 'italic', color: 'var(--ifm-color-emphasis-600)' }}>해당 서버 없음</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {r.m?.map((m: any) => r.id === UNKNOWN_ROW ? (
                    <span
                      key={m.s}
                      className="button button--sm button--outline button--secondary"
                      style={{ fontWeight: 'normal', cursor: 'default', opacity: 0.6 }}
                      title="이 셀의 원고가 아직 없습니다"
                    >
                      {m.s}
                    </span>
                  ) : (
                    <Link 
                      key={m.s} 
                      to={`/reports/${m.s}/${cellId}`}
                      onClick={e => openDrawer(e, m.s)}
                      className={`button button--sm ${m.s === openServer ? 'button--primary' : 'button--secondary'}`}
                      style={{ fontWeight: 'normal' }}
                    >
                      {m.s}
                      {m.d && <span style={{ color: 'var(--ifm-color-danger)', marginLeft: '4px' }}>†</span>}
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
          url={`${reportsUrl}${openServer}/${cellId}`}
          editUrl={`https://github.com/${organizationName}/${projectName}/edit/main/reports/${openServer}/${cellId}.mdx`}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
