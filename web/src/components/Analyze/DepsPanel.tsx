import React from "react";
import { queryOsv } from "@site/src/analyzer/osv.mjs";
import type { Dep, Deps, DepScope, VulnDep } from "./parts";
import styles from "./styles.module.css";

// 의존성 탭: 의존성 파일에서 읽은 패키지(python.mjs의 readDeps)와, 누르면 osv.dev에서 받는 알려진 취약점(osv.mjs).
// 조회 결과는 탭을 옮겨도 남도록 ResultView가 들고 있다

export type OsvState =
  | { state: "idle" }
  | { state: "loading"; status: string }
  | { state: "done"; result: VulnDep[] }
  | { state: "error"; message: string };

// 쓰임 표시. 이 순서로 센 수를 보이고 표를 정렬한다
const SCOPES: [DepScope, string][] = [["main", "실행용"], ["extra", "선택"], ["dev", "개발용"], [null, "구분 못함"]];
const scopeIndex = (d: Dep) => SCOPES.findIndex(([s]) => s === d.scope);
const scopeLabel = (d: Dep) => SCOPES[scopeIndex(d)][1] + (d.scope === "extra" && d.group ? ` (${d.group})` : "");

function count(packages: Dep[]) {
  return SCOPES.map(([s, name]) => [name, packages.filter((p) => p.scope === s).length] as const)
    .filter(([, k]) => k > 0)
    .map(([name, k]) => `${name} ${k}`)
    .join(" · ");
}

/** 조회하지 않은 패키지: PyPI 밖에서 설치한 것, 버전이 정해지지 않은 것 */
function NotQueried({ deps }: { deps: Deps }) {
  const n = deps.skipped.length + deps.unpinned.length;
  if (!n) return null;
  return (
    <details className={styles.others}>
      <summary>조회하지 않은 패키지 {n}개</summary>
      <ul>
        {deps.skipped.map((s, i) => (
          <li key={`s${i}`}>
            <code>{s.name}</code> {s.version ?? ""} · {s.reason} 설치라 PyPI 버전이 아님
          </li>
        ))}
        {deps.unpinned.map((u, i) => (
          <li key={`u${i}`}>
            <code>{u.name}</code> {u.spec || "(조건 없음)"} · 버전이 정해지지 않음 ({u.source})
          </li>
        ))}
      </ul>
    </details>
  );
}

function VulnTable({ result }: { result: VulnDep[] }) {
  const rows = [...result].sort(
    (a, b) => scopeIndex(a) - scopeIndex(b) || (a.name < b.name ? -1 : 1),
  );
  return (
    <div className={styles.depTableWrap}>
      <table className={styles.depTable}>
        <thead>
          <tr>
            <th>패키지</th>
            <th>쓰임</th>
            <th>취약점</th>
            <th title="지금 버전보다 높은 수정 버전 중 가장 낮은 것">수정 버전</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) =>
            p.vulns.map((v, i) => (
              <tr key={`${p.name}@${p.version}/${v.id}`}>
                {i === 0 && (
                  <>
                    <td rowSpan={p.vulns.length}>
                      <code>{p.name}</code> <span className={styles.pill}>{p.version}</span>
                    </td>
                    <td rowSpan={p.vulns.length}>{scopeLabel(p)}</td>
                  </>
                )}
                <td>
                  <a href={v.url} target="_blank" rel="noreferrer">{v.id}</a>
                  {v.cves.length > 0 && <span className={styles.pill}> {v.cves.join(", ")}</span>}
                  {v.ids.length > 1 && (
                    <span className={styles.pill} title="같은 취약점의 다른 OSV ID"> = {v.ids.filter((x) => x !== v.id).join(", ")}</span>
                  )}
                  {v.summary && <div className={styles.depSummary}>{v.summary}</div>}
                </td>
                <td>{v.fixed ?? <span className={styles.muted}>–</span>}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function DepsPanel({ deps, osv, setOsv }: { deps: Deps | null; osv: OsvState; setOsv: (s: OsvState) => void }) {
  if (!deps) return <p className={styles.notice}>의존성 파일(pyproject.toml, uv.lock, poetry.lock, requirements*.txt) 없음</p>;
  const { packages } = deps;

  const run = async () => {
    setOsv({ state: "loading", status: "조회 준비 중…" });
    try {
      const result: VulnDep[] = await queryOsv(packages, { onStatus: (status: string) => setOsv({ state: "loading", status }) });
      setOsv({ state: "done", result });
    } catch (e: any) {
      setOsv({ state: "error", message: String(e?.message ?? e) });
    }
  };

  const vulnCount = osv.state === "done" ? osv.result.reduce((n, p) => n + p.vulns.length, 0) : 0;
  const mainCount = osv.state === "done" ? osv.result.filter((p) => p.scope === "main").length : 0;

  return (
    <div>
      <p className={styles.panelLead}>
        <code>{deps.source}</code>에서 읽은 패키지 {packages.length}개{packages.length > 0 && ` (${count(packages)})`}
      </p>

      {packages.length === 0 ? (
        <p className={styles.notice}>버전을 정확히 아는 패키지가 없어 조회할 수 없습니다. lock 파일이나 == 고정 버전이 필요합니다.</p>
      ) : osv.state === "idle" || osv.state === "error" ? (
        <div className={styles.depQuery}>
          <button onClick={run}>osv.dev에서 알려진 취약점 조회</button>
          <span className={styles.muted}>패키지 이름과 버전이 osv.dev로 전송됩니다.</span>
        </div>
      ) : osv.state === "loading" ? (
        <p className={styles.muted}>{osv.status}</p>
      ) : null}
      {osv.state === "error" && <pre className={styles.error}>{osv.message}</pre>}

      {osv.state === "done" &&
        (osv.result.length === 0 ? (
          <p className={styles.notice}>알려진 취약점 없음 (패키지 {packages.length}개 조회)</p>
        ) : (
          <>
            <p className={styles.depHead}>
              취약점이 알려진 패키지 <b>{osv.result.length}</b>개 (실행용 {mainCount}개) · 취약점 <b>{vulnCount}</b>건
            </p>
            <p className={styles.muted}>
              의존성 파일에 고정된 버전이 취약 범위에 든다는 뜻입니다. 서버 코드가 그 기능을 쓰는지는 확인하지 않습니다.
              같은 취약점의 GHSA·PYSEC ID는 하나로 묶었습니다.
            </p>
            <VulnTable result={osv.result} />
          </>
        ))}

      <NotQueried deps={deps} />
    </div>
  );
}
