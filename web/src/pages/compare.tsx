import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useHistory, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import BrowserOnly from '@docusaurus/BrowserOnly';
import PageDrawer from '@site/src/components/Matrix/PageDrawer';
import styles from './compare.module.css';

// 셀(행) × 서버(열) 표. 칸에는 그 서버가 해당하는 상세 번호(또는 미구현·비적용)를 둔다.
// 원고 폴더가 있는 서버만 열로 두고, 원고가 없는 칸은 비워 둔다(미확인).
type Hit = { detail: string; label: string; title: string; special: boolean };

function CompareTable() {
  const [data, setData] = useState<any>(null);
  const dataUrl = useBaseUrl('/data/matrix.json');
  const reportsUrl = useBaseUrl('/reports/');
  const { organizationName, projectName } = useDocusaurusContext().siteConfig;
  const history = useHistory();
  const location = useLocation();
  // 연 원고는 ?server=&cell=&detail=로 주소에 남긴다. 셀 화면과 같이 replace만 쓴다
  const query = new URLSearchParams(location.search);
  const openServer = query.get('server');
  const openCell = query.get('cell');
  const openDetail = query.get('detail');

  const withOpen = (server: string | null, cell: string | null = null, detail: string | null = null) => {
    const params = new URLSearchParams(location.search);
    for (const [k, v] of [['server', server], ['cell', cell], ['detail', detail]] as const) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const search = params.toString();
    return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash };
  };

  const openDrawer = (e: React.MouseEvent, server: string, cell: string, detail: string) => {
    // 수정 키나 가운데 버튼으로 누르면 원래대로 원고 페이지를 연다
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.replace(withOpen(server, cell, detail));
  };

  const closeDrawer = useCallback(() => {
    history.replace(withOpen(null));
  }, [history, location]);

  useEffect(() => {
    fetch(dataUrl)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error);
  }, [dataUrl]);

  if (!data) return <p className={styles.loading}>데이터를 불러오는 중입니다...</p>;

  // 열은 원고가 있는 셀이 많은 서버부터 둔다. 같으면 config.yaml의 servers 차례를 따른다
  const studied = (s: string) =>
    data.cells.filter((c: any) => c.rows.some((r: any) => r.m?.some((m: any) => m.s === s))).length;
  const servers: string[] = data.samples
    .filter((s: string) => data.pilot.servers.includes(s))
    .sort((a: string, b: string) => studied(b) - studied(a));
  const hits = (cell: any, server: string): Hit[] =>
    cell.rows
      .filter((r: any) => r.m?.some((m: any) => m.s === server))
      .map((r: any) => ({
        detail: r.special ? r.name : r.id,
        label: r.special ? r.name : r.id,
        title: r.special ? r.name : `${r.id} ${r.name}`,
        special: !!r.special,
      }));
  const open = openServer && openCell ? data.cells.find((c: any) => c.id === openCell) : null;

  return (
    <>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.cellHead}>셀</th>
              {servers.map(s => <th key={s} className={styles.serverHead}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.keys(data.axes).map(ax => (
              <React.Fragment key={ax}>
                <tr className={styles.axisRow}>
                  <th colSpan={servers.length + 1}>
                    <Link to={`/${ax}/`}>{ax} {data.axes[ax]}</Link>
                  </th>
                </tr>
                {data.cells.filter((c: any) => c.axis === ax).map((c: any) => (
                  <tr key={c.id}>
                    <th className={styles.cellName}>
                      <Link to={`/${c.axis}/${c.id}`}>
                        <span className={styles.cellId}>{c.id}</span>
                        <span>{c.name}</span>
                      </Link>
                    </th>
                    {servers.map(s => {
                      const hs = hits(c, s);
                      return (
                        <td key={s} className={hs.length ? undefined : styles.unknown}>
                          {hs.length === 0 ? (
                            <span title="원고 없음(미확인)">·</span>
                          ) : (
                            hs.map(h => (
                              <Link
                                key={h.detail}
                                to={`/reports/${s}/${c.axis}/${c.id}`}
                                title={h.title}
                                onClick={e => openDrawer(e, s, c.id, h.detail)}
                                className={[
                                  styles.hit,
                                  h.special ? styles.special : '',
                                  s === openServer && c.id === openCell && h.detail === openDetail ? styles.active : '',
                                ].join(' ')}
                              >
                                {h.label}
                              </Link>
                            ))
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {open && openServer && (
        <PageDrawer
          title={openServer}
          subtitle={open.id}
          label={`${openServer} ${open.id} 원고`}
          page={{ url: `${reportsUrl}${openServer}/${open.axis}/${open.id}`, detail: openDetail }}
          editUrl={`https://github.com/${organizationName}/${projectName}/edit/main/reports/${openServer}/${open.axis}/${open.id}.mdx`}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}

export default function Compare() {
  return (
    <Layout title="서버 비교" description="셀마다 서버가 어느 상세에 해당하는지 나란히 봅니다.">
      <main className={styles.page}>
        <h1>서버 비교</h1>
        <p className={styles.lead}>
          셀마다 각 서버가 해당하는 상세를 나란히 봅니다. 번호에 마우스를 올리면 상세 이름이, 누르면 그 원고가 보입니다.
          빈칸(·)은 아직 원고가 없는 셀입니다.
        </p>
        {/* PageDrawer가 window·localStorage를 쓰므로 브라우저에서만 그린다 */}
        <BrowserOnly fallback={<p className={styles.loading}>데이터를 불러오는 중입니다...</p>}>
          {() => <CompareTable />}
        </BrowserOnly>
      </main>
    </Layout>
  );
}
