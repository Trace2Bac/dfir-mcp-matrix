import React, { useMemo, useState } from "react";
import { Code, Description, Loc, Params, type Fn, type Mcp, type Prompt, type Resource, type Tool } from "./parts";
import styles from "./styles.module.css";

// 도구 탭 밖의 탭: 공통 경로, 리소스, 프롬프트, 서버. 자료는 core.mjs의 summary.shared와 mcp에서 온다

const MAX_CHIPS = 40;

const NONE = <span className={styles.muted}>–</span>;

/** 서버가 지원하는 MCP 규격 범위: 의존성 파일의 SDK 버전에서 정한다(python.mjs의 readSdk). 근거는 마우스를 올리면 보인다 */
function Protocols({ sdk }: { sdk: Mcp["sdk"] }) {
  if (!sdk?.latest) return NONE;
  // 버전을 고정하지 않았으면(atLeast) 가장 새 규격은 '이상'으로 적는다. 가장 낮은 SDK가 한 규격만 지원하면 시작만 적는다
  const range =
    sdk.oldest === sdk.latest
      ? sdk.atLeast ? `${sdk.oldest}부터` : sdk.latest
      : `${sdk.oldest} ~ ${sdk.latest}${sdk.atLeast ? " 이상" : ""}`;
  const pkg = `${sdk.package}${sdk.version ? ` ${sdk.version}` : sdk.spec ?? ""}${sdk.via ? ` → ${sdk.via}` : ""}`;
  return <span title={`${sdk.source}의 ${pkg}`}>{range}</span>;
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
          {!shown.length && <p className={styles.muted}>검색 결과 없음</p>}
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
  if (!shared.length) return <p className={styles.notice}>공통 경로 없음</p>;
  return (
    <>
      <p className={styles.panelLead} title="분석기가 놓친 호출 때문에 거치지 않는 것으로 보일 수도 있음">
        도구 {traced.length}개 중 둘 이상이 거치는 함수 · 거치지 않는 도구는 공통 처리(기록·검증 등) 누락을 확인할 대상
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
                <Loc path={fn.path} line={fn.line} end={fn.end} blob={blob} /> · 도구 <b>{x.tools.length}</b>/{traced.length}개가 거침
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

/** 리소스·프롬프트 하나: 제목, 덧붙일 정보, 설명, 파라미터, 위치, 함수 코드(호출 그래프 밖이라 호출 표시는 없다) */
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
    return <p className={styles.notice}>등록된 리소스 없음</p>;
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
    return <p className={styles.notice}>등록된 프롬프트 없음</p>;
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
            <b>{main.name ?? "–"}</b> · {main.sdk} · <Loc path={main.path} line={main.line} blob={blob} />
            {others.length > 0 && (
              <details className={styles.others}>
                <summary>서버 객체 {others.length}개 더</summary>
                <ul>
                  {others.map((x, i) => (
                    <li key={i}>
                      {x.name ?? "–"} · <Loc path={x.path} line={x.line} blob={blob} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          NONE
        )}
      </dd>

      <dt title="서버 SDK가 지원하는 규격. 실제 통신 규격은 이 범위에서 클라이언트 요청에 따라 정해짐">지원 규격</dt>
      <dd>
        <Protocols sdk={mcp.sdk} />
      </dd>

      <dt title="연결 시 클라이언트 모델에 전달되는 서버 설명(instructions=)">지시문</dt>
      <dd>
        {main?.instructions || main?.instructions_expr ? (
          <Description text={main.instructions} expr={main.instructions_expr} />
        ) : (
          NONE
        )}
      </dd>

      <dt>전송 방식</dt>
      <dd>
        {mcp.transports.length ? mcp.transports.join(", ") : NONE}
      </dd>
    </dl>
  );
}
