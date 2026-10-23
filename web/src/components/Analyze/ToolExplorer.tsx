import React, { useEffect, useMemo, useState } from "react";
import { extModule, reachOf } from "@site/src/analyzer/core.mjs";
import styles from "./styles.module.css";

// 분석 결과 화면: 위에 요약, 왼쪽에 도구 목록, 오른쪽에 고른 도구의 명세(설명·인자)와 다이어그램, 누른 함수의 코드.
// 자료 형식은 src/analyzer/core.mjs의 extractTree 출력과 같다

type Call = { line: number; to?: number[]; ext?: string };
type Fn = {
  name: string;
  path: string;
  line: number;
  end: number;
  calls: Call[];
};
type Param = { name: string; type: string | null; default: string | null; required: boolean; description: string | null };
type Tool = {
  name: string;
  path: string;
  line: number;
  reg: string;
  description: string | null;
  description_expr?: string; // 실행할 때 정해지는 설명의 코드(f-string 등)
  params: Param[];
  fn?: number;
  scope?: { functions: number; files: number };
};
export type Result = {
  language: string | null;
  supported: boolean;
  tools?: Tool[];
  dynamic?: { path: string; line: number }[];
  graph?: { functions: Fn[] };
  summary?: {
    tools: number;
    functions_reached: number;
    files_reached: number;
  };
};

const shortPath = (p: string) => p.split("/").slice(-2).join("/");

// ── 다이어그램 ──

const NODE_W = 190;
const NODE_H = 40;
const COL_W = 250;
const ROW_H = 54;
const MAX_NODES = 80;

/** 고른 도구의 호출 그래프. 깊이별 열로 놓는다. 칸 아래 줄은 그 함수가 부르는 외부 모듈(없으면 파일) */
function Diagram({
  fns,
  root,
  sel,
  onSel,
}: {
  fns: Fn[];
  root: number;
  sel: number | null;
  onSel: (id: number) => void;
}) {
  const depth: Map<number, number> = useMemo(
    () => reachOf(fns, root),
    [fns, root],
  );
  const order = [...depth.keys()];
  const nodes = order.slice(0, MAX_NODES);
  const shown = new Set(nodes);
  const cols = new Map<number, number[]>();
  for (const id of nodes)
    cols.set(depth.get(id)!, [...(cols.get(depth.get(id)!) ?? []), id]);
  const pos = new Map<number, { x: number; y: number }>();
  for (const [d, ids] of cols)
    ids.forEach((id, i) => pos.set(id, { x: 8 + d * COL_W, y: 8 + i * ROW_H }));
  const width = 16 + Math.max(...cols.keys()) * COL_W + NODE_W;
  const height =
    16 + Math.max(...[...cols.values()].map((v) => v.length)) * ROW_H;
  const edges = nodes.flatMap((a) =>
    fns[a].calls.flatMap((c) =>
      (c.to ?? []).filter((b) => shown.has(b) && b !== a).map((b) => [a, b]),
    ),
  );

  return (
    <div className={styles.graphWrap}>
      {order.length > MAX_NODES && (
        <p className={styles.muted}>
          함수 {order.length}개 가운데 가까운 {MAX_NODES}개만 그립니다.
        </p>
      )}
      <svg
        width={width}
        height={height}
        className={styles.graph}
        role="img"
        aria-label="도구 호출 그래프"
      >
        {edges.map(([a, b], i) => {
          const p = pos.get(a)!,
            q = pos.get(b)!;
          const x1 = p.x + NODE_W,
            y1 = p.y + NODE_H / 2,
            x2 = q.x,
            y2 = q.y + NODE_H / 2;
          const d =
            x2 <= x1
              ? `M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2 - 30} ${x2},${y2}`
              : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
          return (
            <path
              key={i}
              d={d}
              className={`${styles.edge} ${sel === a || sel === b ? styles.edgeOn : ""}`}
            />
          );
        })}
        {nodes.map((id) => {
          const fn = fns[id];
          const { x, y } = pos.get(id)!;
          const ext = [
            ...new Set(
              fn.calls.filter((c) => c.ext).map((c) => extModule(c.ext!)),
            ),
          ];
          const cls = [
            styles.node,
            sel === id && styles.nodeOn,
            id === root && styles.nodeRoot,
          ];
          return (
            <g
              key={id}
              transform={`translate(${x},${y})`}
              className={cls.filter(Boolean).join(" ")}
              onClick={() => onSel(id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSel(id);
              }}
            >
              <title>{`${fn.name}\n${fn.path}:${fn.line}${ext.length ? `\n외부: ${ext.join(", ")}` : ""}`}</title>
              <rect width={NODE_W} height={NODE_H} rx={2} />
              <text x={8} y={16} className={styles.nodeName}>
                {fn.name.length > 24 ? fn.name.slice(0, 23) + "…" : fn.name}
              </text>
              <text x={8} y={31} className={styles.nodeSub}>
                {(ext.length
                  ? `↗ ${ext.join(", ")}`
                  : shortPath(fn.path)
                ).slice(0, 30)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 코드 ──

const MAX_LINES = 400;

/** 함수 하나의 코드. 호출이 있는 줄을 칠하고, 저장소 안 함수 호출은 눌러서 그 함수로 간다. blob이 있으면 GitHub 원본 링크를 단다 */
function Code({
  fn,
  fns,
  lines,
  onSel,
  blob,
}: {
  fn: Fn;
  fns: Fn[];
  lines: string[];
  onSel: (id: number) => void;
  blob?: string;
}) {
  const body = lines.slice(fn.line - 1, fn.end);
  const byLine = new Map<number, Call[]>();
  for (const c of fn.calls)
    byLine.set(c.line, [...(byLine.get(c.line) ?? []), c]);
  return (
    <div className={styles.codeView}>
      <div className={styles.codeHead}>
        <b>{fn.name}</b>{" "}
        <span className={styles.loc}>
          {fn.path}:{fn.line}
        </span>
        <span className={styles.muted}> · {fn.end - fn.line + 1}줄</span>
        {blob && (
          <a
            className={styles.origin}
            target="_blank"
            rel="noopener noreferrer"
            href={`${blob}${fn.path.split("/").map(encodeURIComponent).join("/")}#L${fn.line}-L${fn.end}`}
          >
            GitHub에서 보기 ↗
          </a>
        )}
      </div>
      <pre className={styles.code}>
        {body.slice(0, MAX_LINES).map((l, i) => {
          const ln = fn.line + i;
          const calls = byLine.get(ln);
          return (
            <span key={ln} className={calls ? styles.callLine : undefined}>
              {String(ln).padStart(5)} {l}
              {calls?.map((c, j) =>
                c.to?.length ? (
                  <button
                    key={j}
                    className={styles.jump}
                    onClick={() => onSel(c.to![0])}
                  >
                    → {fns[c.to[0]].name}
                  </button>
                ) : (
                  <span key={j} className={styles.pill}>
                    {c.ext}
                  </span>
                ),
              )}
              {"\n"}
            </span>
          );
        })}
      </pre>
      {body.length > MAX_LINES && (
        <p className={styles.muted}>
          나머지 {body.length - MAX_LINES}줄은 생략했습니다.
        </p>
      )}
    </div>
  );
}

// ── 도구 명세 ──

const DESC_LINES = 6;

// docstring은 70자 안팎에서 줄을 바꿔 둔다. 화면에서는 문단 안의 줄바꿈을 이어 붙이고, 목록·들여쓴 줄은 그대로 둔다
const reflow = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((para) => (para.split("\n").some((l) => /^\s+\S|^\s*[-*•]\s/.test(l)) ? para : para.replace(/\n/g, " ")))
    .join("\n\n");

/** MCP 클라이언트가 보는 도구 정보: 이름, 설명, 인자 */
function Spec({ tool }: { tool: Tool }) {
  const [open, setOpen] = useState(false);
  const desc = tool.description ? reflow(tool.description) : null;
  const long = (desc?.split("\n").length ?? 0) > DESC_LINES || (desc?.length ?? 0) > 500;
  return (
    <div className={styles.spec}>
      <h3>{tool.name}</h3>
      {desc ? (
        <>
          <p className={`${styles.desc} ${long && !open ? styles.clamp : ""}`}>{desc}</p>
          {long && (
            <button className={styles.more} onClick={() => setOpen(!open)}>
              {open ? "접기" : "더 보기"}
            </button>
          )}
        </>
      ) : tool.description_expr ? (
        <p className={styles.muted}>
          실행할 때 정해지는 설명: <code>{tool.description_expr}</code>
        </p>
      ) : (
        <p className={styles.muted}>설명 없음</p>
      )}
      {tool.params.length > 0 && (
        <div className={styles.params}>
          <span className={styles.paramsHead}>인자</span>
          {tool.params.map((p) => (
            <div key={p.name} className={styles.param}>
              <code>{p.name}</code>
              <span className={styles.ptype}>
                {p.type}
                {p.required ? <span className={styles.req}>필수</span> : <span className={styles.pdef}> = {p.default}</span>}
              </span>
              {p.description && <p className={styles.pdesc}>{p.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 전체 ──

// blob: GitHub에서 받았을 때 원본 파일 주소의 앞부분(https://github.com/o/r/blob/<ref>/)
export default function ToolExplorer({
  file,
  r,
  texts,
  blob,
}: {
  file: string;
  r: Result;
  texts: Map<string, string[]>;
  blob?: string;
}) {
  const s = r.summary!;
  const tools = r.tools!;
  const fns = r.graph!.functions;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [fnSel, setFnSel] = useState<number | null>(null);
  const tool = tools[sel] as Tool | undefined; // 등록 도구가 없으면 undefined
  useEffect(() => setFnSel(tool?.fn ?? null), [tool]);

  // 정의 파일별로 묶은 도구 목록. 검색어(도구 이름, 파일)로 거른다
  const groups = useMemo(() => {
    const m = new Map<string, number[]>();
    tools.forEach((t, i) => {
      const text = `${t.name} ${t.path}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return;
      m.set(t.path, [...(m.get(t.path) ?? []), i]);
    });
    return [...m];
  }, [tools, q]);

  return (
    <>
      <div className={styles.head}>
        <b>{file}</b>
        <div className={styles.stats} title="도구 함수에서 직접·간접으로 호출되는 함수와 그 함수가 있는 파일">
          <div><b>{s.tools}</b>도구</div>
          <div><b>{s.functions_reached}</b>호출 함수</div>
          <div><b>{s.files_reached}</b>파일</div>
        </div>
        {r.dynamic!.length > 0 && (
          <span className={styles.muted} title="반복문 안에서 만든 함수처럼 실행해야 정해지는 도구는 목록에 넣지 못합니다">
            반복문 등으로 등록돼 목록에 없는 도구 {r.dynamic!.length}곳:{" "}
            {r.dynamic!.map((d) => `${d.path}:${d.line}`).join(", ")}
          </span>
        )}
      </div>

      {!tool ? (
        <p className={styles.notice}>
          등록된 MCP 도구(@x.tool, x.add_tool(f), Tool(name=…) 등)를 찾지
          못했습니다. MCP 서버 소스가 맞는지 확인하세요.
        </p>
      ) : (
        <div className={styles.explorer}>
          <aside className={styles.toolList}>
            <input
              className={styles.search}
              placeholder="도구·파일 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className={styles.toolScroll}>
              {groups.map(([path, ids]) => (
                <div key={path}>
                  <div className={styles.toolFile} title={path}>
                    {shortPath(path)}
                  </div>
                  {ids.map((i) => (
                    <button
                      key={i}
                      className={`${styles.toolItem} ${i === sel ? styles.on : ""}`}
                      onClick={() => setSel(i)}
                    >
                      <span>{tools[i].name}</span>
                      <small title="이 도구가 호출하는 함수 수(간접 호출 포함)">
                        {tools[i].scope?.functions ?? "–"}
                      </small>
                    </button>
                  ))}
                </div>
              ))}
              {!groups.length && (
                <p className={styles.muted}>맞는 도구가 없습니다.</p>
              )}
            </div>
          </aside>

          <section className={styles.toolDetail}>
            <Spec key={sel} tool={tool} />
            <p className={styles.meta}>
              <span className={styles.loc}>
                {tool.path}:{tool.line}
              </span>{" "}
              · <code title="등록한 코드">{tool.reg}</code>
              {tool.scope && (
                <>
                  {" "}
                  · 호출 함수 <b>{tool.scope.functions}</b> · 파일{" "}
                  <b>{tool.scope.files}</b>
                </>
              )}
            </p>
            {tool.fn === undefined ? (
              <p className={styles.notice}>
                함수 없이 등록된 도구라(저수준 SDK의 Tool(name=…)) 따라갈
                시작점이 없습니다.
              </p>
            ) : (
              <>
                <Diagram
                  fns={fns}
                  root={tool.fn}
                  sel={fnSel}
                  onSel={setFnSel}
                />
                {fnSel !== null && (
                  <Code
                    fn={fns[fnSel]}
                    fns={fns}
                    lines={texts.get(fns[fnSel].path) ?? []}
                    onSel={setFnSel}
                    blob={blob}
                  />
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
