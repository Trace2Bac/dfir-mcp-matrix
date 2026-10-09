import React, { useState, useEffect } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import BrowserOnly from '@docusaurus/BrowserOnly';
import CellDrawer, { isPlainClick, useCellDrawerQuery } from '@site/src/components/Matrix/CellDrawer';
import styles from './compare.module.css';

// 셀(행) × 서버(열) 표. 칸에는 그 서버가 해당하는 상세(또는 미구현·비적용)를 둔다.
// 원고 폴더가 있는 서버만 열로 두고, 원고가 없는 칸은 비워 둔다(미확인).
// 셀을 누르면 매트릭스처럼 셀 패널을, 상세를 누르면 그 원고를 패널에 연다(CellDrawer.tsx)
type Hit = { detail: string; label: string; title: string; special: boolean };

// 칸에는 행의 셀 번호를 되풀이하지 않고 상세의 끝 번호만 둔다(P01.02 → 02). 전체 번호와 이름은 마우스를 올리면 보인다
const hitsOf = (cell: any, server: string): Hit[] =>
  cell.rows
    .filter((r: any) => r.m?.some((m: any) => m.s === server))
    .map((r: any) => ({
      detail: r.special ? r.name : r.id,
      label: r.special ? r.name : r.id.slice(cell.id.length + 1),
      title: r.special ? `${cell.id} ${r.name}` : `${r.id} ${r.name}`,
      special: !!r.special,
    }));

function CompareTable() {
  const [data, setData] = useState<any>(null);
  const dataUrl = useBaseUrl('/data/matrix.json');
  const { openCell, openServer, openDetail, open, close } = useCellDrawerQuery();

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
  const servers: { name: string; studied: number }[] = data.samples
    .filter((s: string) => data.pilot.servers.includes(s))
    .map((s: string) => ({ name: s, studied: studied(s) }))
    .sort((a: { studied: number }, b: { studied: number }) => b.studied - a.studied);
  const cell = openCell ? data.cells.find((c: any) => c.id === openCell) : null;

  const onClick = (e: React.MouseEvent, cellId: string, server: string | null = null, detail: string | null = null) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    open(cellId, server, detail);
  };

  return (
    <>
      <div className={styles.legend}>
        <span><span className={styles.hit}>02</span> 해당하는 상세</span>
        <span><span className={styles.special}>미구현</span> 미구현·비적용 판정</span>
        <span><span className={styles.unknownMark}>–</span> 원고 없음</span>
      </div>

      <div className={styles.scroll}>
        <table className={styles.table} style={{ '--servers': servers.length } as React.CSSProperties}>
          <colgroup>
            <col className={styles.cellCol} />
            {servers.map(s => <col key={s.name} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={styles.corner}>셀</th>
              {servers.map(s => (
                <th key={s.name} className={styles.serverHead}>
                  <span className={styles.serverName}>{s.name}</span>
                  <span className={styles.serverCount} title="원고가 있는 셀 수">셀 {s.studied}개</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(data.axes).map(ax => (
              <React.Fragment key={ax}>
                <tr className={styles.axisRow}>
                  <th colSpan={servers.length + 1}>
                    <Link to={`/${ax}/`}>
                      <span className={styles.axisId}>{ax}</span>
                      {data.axes[ax]}
                    </Link>
                  </th>
                </tr>
                {data.cells.filter((c: any) => c.axis === ax).map((c: any) => (
                  <tr key={c.id} className={c.id === openCell ? styles.activeRow : undefined}>
                    <th className={styles.cellName}>
                      <Link to={`/${c.axis}/${c.id}`} onClick={e => onClick(e, c.id)}>
                        <span className={styles.cellId}>{c.id}</span>
                        <span>{c.name}</span>
                      </Link>
                    </th>
                    {servers.map(({ name: s }) => {
                      const hs = hitsOf(c, s);
                      return (
                        <td key={s}>
                          {hs.length === 0 ? (
                            <span className={styles.unknownMark} title="원고 없음(미확인)">–</span>
                          ) : (
                            <div className={styles.hits}>
                              {hs.map(h => (
                                <Link
                                  key={h.detail}
                                  to={`/reports/${s}/${c.axis}/${c.id}`}
                                  title={h.title}
                                  onClick={e => onClick(e, c.id, s, h.detail)}
                                  className={[
                                    h.special ? styles.special : styles.hit,
                                    s === openServer && c.id === openCell && h.detail === openDetail ? styles.active : '',
                                  ].join(' ')}
                                >
                                  {h.label}
                                </Link>
                              ))}
                            </div>
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

      {cell && <CellDrawer cell={cell} openServer={openServer} openDetail={openDetail} open={open} onClose={close} />}
    </>
  );
}

export default function Compare() {
  return (
    <Layout title="서버 비교" description="셀마다 서버가 어느 상세에 해당하는지 나란히 봅니다.">
      <main className={styles.page}>
        <h1 className={styles.title}>서버 비교</h1>
        <p className={styles.lead}>
          셀마다 각 서버가 해당하는 상세를 나란히 봅니다. 셀을 누르면 그 셀의 정의를, 상세 번호를 누르면 그 서버의 원고를 봅니다.
        </p>
        {/* CellDrawer가 window·localStorage를 쓰므로 브라우저에서만 그린다 */}
        <BrowserOnly fallback={<p className={styles.loading}>데이터를 불러오는 중입니다...</p>}>
          {() => <CompareTable />}
        </BrowserOnly>
      </main>
    </Layout>
  );
}
