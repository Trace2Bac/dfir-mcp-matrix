import React, { useMemo, useState } from "react";
import { Code, Description, Loc, Params, type Fn, type Mcp, type Prompt, type Resource, type Tool } from "./parts";
import styles from "./styles.module.css";

// 도구 탭 밖의 탭: 공통 경로, 리소스, 프롬프트, 서버. 자료는 core.mjs의 summary.shared와 mcp에서 온다

const MAX_CHIPS = 40;

/** 서버가 지원하는 MCP 규격 범위: 의존성 파일의 SDK 버전에서 정한다(python.mjs의 readSdk) */
function Protocols({ sdk }: { sdk: Mcp["sdk"] }) {
  if (!sdk) {
    return (
      <>
        <b>알 수 없음</b>
        <p className={styles.muted}>의존성 파일(pyproject.toml, requirements.txt, uv.lock)에 mcp·fastmcp가 없습니다</p>
      </>
    );
  }
  const pkg = `${sdk.package}${sdk.version ? ` ${sdk.version}` : sdk.spec ?? ""}${sdk.via ? ` → ${sdk.via}` : ""}`;
  // 버전을 고정하지 않았으면(atLeast) 가장 새 규격은 '이상'으로 적는다. 가장 낮은 SDK가 한 규격만 지원하면 시작만 적는다
  const range = !sdk.latest
    ? null
    : sdk.oldest === sdk.latest
      ? sdk.atLeast ? `${sdk.oldest}부터` : sdk.latest
      : `${sdk.oldest} ~ ${sdk.latest}${sdk.atLeast ? " 이상" : ""}`;
  return (
    <>
      <b>{range ?? "알 수 없음"}</b>
      <p className={styles.muted}>
        근거 {sdk.source} · <code>{pkg}</code>
        {!range && (sdk.spec ? " · 하한이 없는 조건이라 정할 수 없음" : " · 버전을 적지 않아 설치할 때의 최신 SDK를 씀")}
        {range && sdk.atLeast && " · 버전을 고정하지 않아 설치 시점에 따라 더 새 규격까지 지원할 수 있음"}
      </p>
    </>
  );
}

/** 도구 이름 목록. 누르면 도구 탭에서 그 도구를 연다 */
function ToolChips({ ids, tools, onTool }: { ids: number[]; tools: Tool[]; onTool: (i: number) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? ids : ids.slice(0, MAX_CHIPS);
  return (
    <div className={styles.chips}>
      {shown.map((i) => (
        <button key={i} onClick={() => onTool(i)}>{tools[i].name}</button>
      ))}
      {ids.length > MAX_CHIPS && (
        <button className={styles.moreChips} onClick={() => setAll(!all)}>
          {all ? "접기" : `+${ids.length - MAX_CHIPS}`}
        </button>
      )}
    </div>
  );
}

/** 왼쪽 목록과 오른쪽 상세. 공통 경로·리소스·프롬프트 탭이 같이 쓴다 */
function ListDetail<T>({
  items,
  label,
  side,
  detail,
  search,
}: {
  items: T[];
  label: (x: T) => string;
  side?: (x: T) => React.ReactNode;
  detail: (x: T) => React.ReactNode;
  search: string;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const shown = useMemo(
    () => items.map((x, i) => [x, i] as const).filter(([x]) => !q || label(x).toLowerCase().includes(q.toLowerCase())),
    [items, q, label],
  );
  return (
    <div className={styles.explorer}>
      <aside className={styles.toolList}>
        <input className={styles.search} placeholder={search} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className={styles.toolScroll}>
          {shown.map(([x, i]) => (
            <button key={i} className={`${styles.toolItem} ${i === sel ? styles.on : ""}`} onClick={() => setSel(i)}>
              <span>{label(x)}</span>
              {side && <small>{side(x)}</small>}
            </button>
          ))}
          {!shown.length && <p className={styles.muted}>맞는 항목이 없습니다.</p>}
        </div>
      </aside>
      <section className={styles.toolDetail} key={sel}>
        {detail(items[sel])}
      </section>
    </div>
  );
}

// ── 공통 경로 ──

/** 여러 도구가 함께 거치는 함수. 고르면 거치는 도구와 거치지 않는 도구, 그 함수의 코드 */
export function SharedPanel({
  shared,
  tools,
  fns,
  texts,
  blob,
  onTool,
}: {
  shared: { fn: number; tools: number[] }[];
  tools: Tool[];
  fns: Fn[];
  texts: Map<string, string[]>;
  blob?: string;
  onTool: (i: number) => void;
}) {
  const traced = tools.flatMap((t, i) => (t.fn === undefined ? [] : [i]));
  if (!shared.length) return <p className={styles.notice}>여러 도구가 함께 거치는 함수가 없습니다.</p>;
  return (
    <>
      <p className={styles.panelLead}>
        도구 {traced.length}개 가운데 둘 이상이 거치는 함수입니다. 서버가 도구마다 공통으로 하는 처리(사건 확인, 기록, 검증 등)가 여기에 모입니다.
        거치지 않는 도구는 그 처리가 빠졌는지 확인할 곳입니다. 다만 분석기가 따라가지 못한 호출 때문일 수도 있습니다.
      </p>
      <ListDetail
        items={shared}
        search="함수 검색"
        label={(x) => fns[x.fn].name}
        side={(x) => x.tools.length}
        detail={(x) => {
          const fn = fns[x.fn];
          const users = new Set(x.tools);
          const missing = traced.filter((i) => !users.has(i) && tools[i].fn !== x.fn);
          return (
            <>
              <h3>{fn.name}</h3>
              <p className={styles.meta}>
                <Loc path={fn.path} line={fn.line} end={fn.end} blob={blob} /> · 도구 <b>{x.tools.length}</b>/{traced.length}개가 거칩니다
              </p>
              <div className={styles.bar}>
                <span style={{ width: `${(x.tools.length / traced.length) * 100}%` }} />
              </div>
              {missing.length > 0 && missing.length < x.tools.length && (
                <>
                  <h4 className={styles.subhead}>거치지 않는 도구 {missing.length}</h4>
                  <ToolChips ids={missing} tools={tools} onTool={onTool} />
                </>
              )}
              <h4 className={styles.subhead}>거치는 도구 {x.tools.length}</h4>
              <ToolChips ids={x.tools} tools={tools} onTool={onTool} />
              <Code fn={fn} fns={fns} lines={texts.get(fn.path) ?? []} blob={blob} />
            </>
          );
        }}
      />
    </>
  );
}

// ── 리소스·프롬프트 ──

/** 리소스·프롬프트 하나: 제목, 덧붙일 정보, 설명, 인자, 위치, 함수 코드(호출 그래프 밖이라 호출 표시는 없다) */
function EntryDetail({
  title,
  meta,
  x,
  texts,
  blob,
}: {
  title: string;
  meta?: React.ReactNode;
  x: Resource | Prompt;
  texts: Map<string, string[]>;
  blob?: string;
}) {
  return (
    <>
      <div className={styles.spec}>
        <h3>{title}</h3>
        {meta && <p className={styles.meta}>{meta}</p>}
        <Description text={x.description} expr={x.description_expr} />
        <Params params={x.params} />
      </div>
      <p className={styles.meta}>
        <Loc path={x.path} line={x.line} end={x.end} blob={blob} />
      </p>
      <Code fn={{ name: x.name, path: x.path, line: x.line, end: x.end, calls: [] }} fns={[]} lines={texts.get(x.path) ?? []} blob={blob} />
    </>
  );
}

export function ResourcesPanel({ resources, texts, blob }: { resources: Resource[]; texts: Map<string, string[]>; blob?: string }) {
  if (!resources.length) {
    return <p className={styles.notice}>이 서버는 리소스를 제공하지 않습니다. 코드에 @x.resource(…)로 등록한 리소스가 없습니다.</p>;
  }
  return (
    <ListDetail
      items={resources}
      search="리소스 검색"
      label={(x) => x.uri ?? x.name}
      side={(x) => (x.template ? "템플릿" : "")}
      detail={(x) => (
        <EntryDetail
          title={x.uri ?? x.name}
          meta={
            <>
              이름 <code>{x.name}</code>
              {x.mime && <> · 형식 <code>{x.mime}</code></>}
              {x.template && <> · URI 템플릿</>}
            </>
          }
          x={x}
          texts={texts}
          blob={blob}
        />
      )}
    />
  );
}

export function PromptsPanel({ prompts, texts, blob }: { prompts: Prompt[]; texts: Map<string, string[]>; blob?: string }) {
  if (!prompts.length) {
    return <p className={styles.notice}>이 서버는 프롬프트를 제공하지 않습니다. 코드에 @x.prompt(…)로 등록한 프롬프트가 없습니다.</p>;
  }
  return (
    <ListDetail
      items={prompts}
      search="프롬프트 검색"
      label={(x) => x.name}
      detail={(x) => <EntryDetail title={x.name} x={x} texts={texts} blob={blob} />}
    />
  );
}

// ── 서버 ──

/** 서버 객체, 지원하는 MCP 규격, 클라이언트에 주는 지시문, 전송 방식 */
export function ServerPanel({ mcp, blob }: { mcp: Mcp; blob?: string }) {
  const [main, ...others] = mcp.servers;
  return (
    <dl className={styles.serverInfo}>
      <dt>서버</dt>
      <dd>
        {main ? (
          <>
            <b>{main.name ?? "(이름 없음)"}</b> · {main.sdk} · <Loc path={main.path} line={main.line} blob={blob} />
            {others.length > 0 && (
              <details className={styles.others}>
                <summary>다른 서버 객체 {others.length}개 (하위 서버를 붙이는 구조 등)</summary>
                <ul>
                  {others.map((x, i) => (
                    <li key={i}>
                      {x.name ?? "(이름 없음)"} · <Loc path={x.path} line={x.line} blob={blob} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <span className={styles.muted}>FastMCP·MCPServer·Server로 만든 서버 객체가 코드에 없습니다.</span>
        )}
      </dd>

      <dt title="서버의 MCP SDK가 지원하는 규격. 실제 통신 규격은 이 안에서 클라이언트가 요청한 것으로 정해진다">지원 규격</dt>
      <dd>
        <Protocols sdk={mcp.sdk} />
      </dd>

      <dt title="클라이언트가 연결할 때 모델에게 주는 서버 설명(instructions=)">지시문</dt>
      <dd>
        {main ? (
          <Description text={main.instructions} expr={main.instructions_expr} empty="서버 객체에 instructions=가 없습니다." />
        ) : (
          <span className={styles.muted}>–</span>
        )}
      </dd>

      <dt>전송 방식</dt>
      <dd>
        {mcp.transports.length ? (
          mcp.transports.join(", ")
        ) : (
          <span className={styles.muted}>서버를 실행하는 run(…) 호출이 코드에 없습니다.</span>
        )}
      </dd>
    </dl>
  );
}
