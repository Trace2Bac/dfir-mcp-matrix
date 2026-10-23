import React, { useEffect, useMemo, useState } from "react";
import { extModule, reachOf } from "@site/src/analyzer/core.mjs";
import { Code, Description, Loc, Params, ReturnInfo, shortPath, type Fn, type Tool } from "./parts";
import styles from "./styles.module.css";

// 도구 탭: 왼쪽에 도구 목록, 오른쪽에 고른 도구의 명세(설명·인자)와 다이어그램, 누른 함수의 코드

// ── 다이어그램 ──

const NODE_W = 190;
const NODE_H = 40;
const COL_W = 250;
const ROW_H = 54;
const MAX_NODES = 80;

/** 고른 도구의 호출 그래프. 깊이별 열로 놓는다. 칸 아래 줄은 그 함수가 부르는 외부 모듈(없으면 파일) */
function Diagram({ fns, root, sel, onSel }: { fns: Fn[]; root: number; sel: number | null; onSel: (id: number) => void }) {
  const depth: Map<number, number> = useMemo(() => reachOf(fns, root), [fns, root]);
  const order = [...depth.keys()];
  const nodes = order.slice(0, MAX_NODES);
  const shown = new Set(nodes);
  const cols = new Map<number, number[]>();
  for (const id of nodes) cols.set(depth.get(id)!, [...(cols.get(depth.get(id)!) ?? []), id]);
  const pos = new Map<number, { x: number; y: number }>();
  for (const [d, ids] of cols) ids.forEach((id, i) => pos.set(id, { x: 8 + d * COL_W, y: 8 + i * ROW_H }));
  const width = 16 + Math.max(...cols.keys()) * COL_W + NODE_W;
  const height = 16 + Math.max(...[...cols.values()].map((v) => v.length)) * ROW_H;
  const edges = nodes.flatMap((a) =>
    fns[a].calls.flatMap((c) => (c.to ?? []).filter((b) => shown.has(b) && b !== a).map((b) => [a, b])),
  );

  return (
    <div className={styles.graphWrap}>
      {order.length > MAX_NODES && (
        <p className={styles.muted}>함수 {order.length}개 중 가까운 {MAX_NODES}개만 표시</p>
      )}
      <svg width={width} height={height} className={styles.graph} role="img" aria-label="도구 호출 그래프">
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
          return <path key={i} d={d} className={`${styles.edge} ${sel === a || sel === b ? styles.edgeOn : ""}`} />;
        })}
        {nodes.map((id) => {
          const fn = fns[id];
          const { x, y } = pos.get(id)!;
          const ext = [...new Set(fn.calls.filter((c) => c.ext).map((c) => extModule(c.ext!)))];
          const cls = [styles.node, sel === id && styles.nodeOn, id === root && styles.nodeRoot];
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
                {(ext.length ? `↗ ${ext.join(", ")}` : shortPath(fn.path)).slice(0, 30)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 도구 탭 ──

// sel은 고른 도구 번호. 다른 탭에서 도구를 누르면 바뀌므로 부르는 쪽(ResultView)이 가진다
export default function ToolExplorer({
  tools,
  fns,
  texts,
  blob,
  sel,
  onSel,
}: {
  tools: Tool[];
  fns: Fn[];
  texts: Map<string, string[]>;
  blob?: string;
  sel: number;
  onSel: (i: number) => void;
}) {
  const [q, setQ] = useState("");
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

  if (!tool) {
    return (
      <p className={styles.notice}>등록된 MCP 도구가 없습니다.</p>
    );
  }
  return (
    <div className={styles.explorer}>
      <aside className={styles.toolList}>
        <input className={styles.search} placeholder="도구·파일 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className={styles.toolScroll}>
          {groups.map(([path, ids]) => (
            <div key={path}>
              <div className={styles.toolFile} title={path}>
                {shortPath(path)}
              </div>
              {ids.map((i) => (
                <button key={i} className={`${styles.toolItem} ${i === sel ? styles.on : ""}`} onClick={() => onSel(i)}>
                  <span>{tools[i].name}</span>
                  <small title="호출 함수 수(간접 포함)">{tools[i].scope?.functions ?? "–"}</small>
                </button>
              ))}
            </div>
          ))}
          {!groups.length && <p className={styles.muted}>검색 결과 없음</p>}
        </div>
      </aside>

      <section className={styles.toolDetail}>
        <div className={styles.spec} key={sel}>
          <h3>{tool.name}</h3>
          <Description text={tool.description} expr={tool.description_expr} />
          <Params params={tool.params} />
          <ReturnInfo r={tool.returns} />
        </div>
        <p className={styles.meta}>
          <Loc path={tool.path} line={tool.line} blob={blob} /> · <code title="등록 코드">{tool.reg}</code>
          {tool.scope && (
            <>
              {" "}
              · 호출 함수 <b>{tool.scope.functions}</b> · 파일 <b>{tool.scope.files}</b>
            </>
          )}
        </p>
        {tool.fn === undefined ? (
          <p className={styles.notice}>함수 없이 등록된 도구(Tool(name=…))라 호출 구조가 없습니다.</p>
        ) : (
          <>
            <Diagram fns={fns} root={tool.fn} sel={fnSel} onSel={setFnSel} />
            {fnSel !== null && (
              <Code fn={fns[fnSel]} fns={fns} lines={texts.get(fns[fnSel].path) ?? []} onSel={setFnSel} blob={blob} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
