import React, { useEffect, useMemo, useState } from 'react';
import { extModule, reachOf } from '@site/src/analyzer/core.mjs';
import styles from './styles.module.css';

// 분석 결과 화면: 위에 요약과 외부 모듈, 왼쪽에 도구 목록, 오른쪽에 고른 도구의 다이어그램과 누른 함수의 코드.
// 자료 형식은 src/analyzer/core.mjs의 extractTree 출력과 같다

type Call = { line: number; to?: number[]; ext?: string };
type Fn = { name: string; path: string; line: number; end: number; calls: Call[] };
type Tool = {
  name: string; path: string; line: number; how: string; params: string[]; fn?: number;
  scope?: { functions: number; files: number; depth: number; ext: string[] };
};
export type Result = {
  language: string | null;
  supported: boolean;
  tools?: Tool[];
  dynamic?: { path: string; line: number }[];
  graph?: { functions: Fn[] };
  summary?: {
    tools: number; functions_reached: number; functions_total: number;
    files_reached: number; files_total: number; externals: Record<string, number>;
  };
};

const HOW: Record<string, string> = { decorator: '@x.tool', add_tool: 'x.add_tool(f)', call: 'x.tool()(f)', Tool: 'Tool(name=…)' };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const shortPath = (p: string) => p.split('/').slice(-2).join('/');

// ── 다이어그램 ──

const NODE_W = 190;
const NODE_H = 40;
const COL_W = 250;
const ROW_H = 54;
const MAX_NODES = 80;

/** 고른 도구의 호출 그래프. 깊이별 열로 놓고, 고른 외부 모듈을 부르는 칸은 칠한다 */
function Diagram({ fns, root, sel, onSel, mark }: { fns: Fn[]; root: number; sel: number | null; onSel: (id: number) => void; mark: string | null }) {
  const depth: Map<number, number> = useMemo(() => reachOf(fns, root), [fns, root]);
  const order = [...depth.keys()];
  const nodes = order.slice(0, MAX_NODES);
  const shown = new Set(nodes);
  const cols = new Map<number, number[]>();
  for (const id of nodes) cols.set(depth.get(id)!, [...(cols.get(depth.get(id)!) ?? []), id]);
  const pos = new Map<number, { x: number; y: number }>();
  for (const [d, ids] of cols) ids.forEach((id, i) => pos.set(id, { x: 8 + d * COL_W, y: 8 + i * ROW_H }));
  const width = 16 + Math.max(...cols.keys()) * COL_W + NODE_W;
  const height = 16 + Math.max(...[...cols.values()].map(v => v.length)) * ROW_H;
  const edges = nodes.flatMap(a => fns[a].calls.flatMap(c => (c.to ?? []).filter(b => shown.has(b) && b !== a).map(b => [a, b])));

  return (
    <div className={styles.graphWrap}>
      {order.length > MAX_NODES && <p className={styles.muted}>함수 {order.length}개 가운데 가까운 {MAX_NODES}개만 그립니다.</p>}
      <svg width={width} height={height} className={styles.graph} role="img" aria-label="도구 호출 그래프">
        {edges.map(([a, b], i) => {
          const p = pos.get(a)!, q = pos.get(b)!;
          const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2, x2 = q.x, y2 = q.y + NODE_H / 2;
          const d = x2 <= x1
            ? `M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2 - 30} ${x2},${y2}`
            : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
          return <path key={i} d={d} className={`${styles.edge} ${sel === a || sel === b ? styles.edgeOn : ''}`} />;
        })}
        {nodes.map(id => {
          const fn = fns[id];
          const { x, y } = pos.get(id)!;
          const ext = [...new Set(fn.calls.filter(c => c.ext).map(c => extModule(c.ext!)))];
          const cls = [styles.node, sel === id && styles.nodeOn, id === root && styles.nodeRoot, mark && ext.includes(mark) && styles.nodeMark];
          return (
            <g key={id} transform={`translate(${x},${y})`} className={cls.filter(Boolean).join(' ')}
               onClick={() => onSel(id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onSel(id); }}>
              <title>{`${fn.name}\n${fn.path}:${fn.line}${ext.length ? `\n외부: ${ext.join(', ')}` : ''}`}</title>
              <rect width={NODE_W} height={NODE_H} rx={5} />
              <text x={8} y={16} className={styles.nodeName}>{fn.name.length > 24 ? fn.name.slice(0, 23) + '…' : fn.name}</text>
              <text x={8} y={31} className={styles.nodeSub}>{(ext.length ? `↗ ${ext.join(', ')}` : shortPath(fn.path)).slice(0, 30)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 코드 ──

const MAX_LINES = 400;

/** 함수 하나의 코드. 호출이 있는 줄을 칠하고, 저장소 안 함수 호출은 눌러서 그 함수로 간다 */
function Code({ fn, fns, lines, onSel }: { fn: Fn; fns: Fn[]; lines: string[]; onSel: (id: number) => void }) {
  const body = lines.slice(fn.line - 1, fn.end);
  const byLine = new Map<number, Call[]>();
  for (const c of fn.calls) byLine.set(c.line, [...(byLine.get(c.line) ?? []), c]);
  return (
    <div className={styles.codeView}>
      <div className={styles.codeHead}>
        <b>{fn.name}</b> <span className={styles.loc}>{fn.path}:{fn.line}</span>
        <span className={styles.muted}> · {fn.end - fn.line + 1}줄</span>
      </div>
      <pre className={styles.code}>
        {body.slice(0, MAX_LINES).map((l, i) => {
          const ln = fn.line + i;
          const calls = byLine.get(ln);
          return (
            <span key={ln} className={calls ? styles.callLine : undefined}>
              {String(ln).padStart(5)}  {l}
              {calls?.map((c, j) => (c.to?.length
                ? <button key={j} className={styles.jump} onClick={() => onSel(c.to![0])}>→ {fns[c.to[0]].name}</button>
                : <span key={j} className={styles.pill}>{c.ext}</span>))}
              {'\n'}
            </span>
          );
        })}
      </pre>
      {body.length > MAX_LINES && <p className={styles.muted}>나머지 {body.length - MAX_LINES}줄은 생략했습니다.</p>}
    </div>
  );
}

// ── 전체 ──

export default function ToolExplorer({ file, r, texts }: { file: string; r: Result; texts: Map<string, string[]> }) {
  const s = r.summary!;
  const tools = r.tools!;
  const fns = r.graph!.functions;
  const [q, setQ] = useState('');
  const [mod, setMod] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [fnSel, setFnSel] = useState<number | null>(null);
  const tool = tools[sel] as Tool | undefined; // 등록 도구가 없으면 undefined
  useEffect(() => setFnSel(tool?.fn ?? null), [tool]);

  // 정의 파일별로 묶은 도구 목록. 검색어(도구 이름, 파일)와 외부 모듈로 거른다
  const groups = useMemo(() => {
    const m = new Map<string, number[]>();
    tools.forEach((t, i) => {
      const text = `${t.name} ${t.path}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return;
      if (mod && !t.scope?.ext.includes(mod)) return;
      m.set(t.path, [...(m.get(t.path) ?? []), i]);
    });
    return [...m];
  }, [tools, q, mod]);

  return (
    <>
      <div className={styles.head}>
        <b>{file}</b>
        <span>
          도구 <b>{s.tools}</b> · 도구에서 닿는 함수 <b>{s.functions_reached}</b>/{s.functions_total} ({pct(s.functions_reached, s.functions_total)}%)
          · 파일 <b>{s.files_reached}</b>/{s.files_total}
        </span>
        {r.dynamic!.length > 0 && (
          <span>코드만 보고 함수를 정할 수 없는 등록 {r.dynamic!.length}곳: {r.dynamic!.map(d => `${d.path}:${d.line}`).join(', ')}</span>
        )}
        {s.tools > 0 && <div className={styles.mods}>
          <span>외부 모듈</span>
          {Object.entries(s.externals).slice(0, 16).map(([m, n]) => (
            <button key={m} className={mod === m ? styles.on : undefined} onClick={() => setMod(mod === m ? null : m)}
                    title={`이 모듈에 닿는 도구 ${n}개. 누르면 그 도구만 보입니다`}>
              {m} <small>{n}</small>
            </button>
          ))}
        </div>}
      </div>

      {!tool ? (
        <p className={styles.notice}>등록된 MCP 도구(@x.tool, x.add_tool(f), Tool(name=…) 등)를 찾지 못했습니다. MCP 서버 소스가 맞는지 확인하세요.</p>
      ) : <div className={styles.explorer}>
        <aside className={styles.toolList}>
          <input className={styles.search} placeholder="도구·파일 검색" value={q} onChange={e => setQ(e.target.value)} />
          <div className={styles.toolScroll}>
            {groups.map(([path, ids]) => (
              <div key={path}>
                <div className={styles.toolFile} title={path}>{shortPath(path)}</div>
                {ids.map(i => (
                  <button key={i} className={`${styles.toolItem} ${i === sel ? styles.on : ''}`} onClick={() => setSel(i)}>
                    <span>{tools[i].name}</span>
                    <small title="도구에서 닿는 함수 수">{tools[i].scope?.functions ?? '–'}</small>
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && <p className={styles.muted}>맞는 도구가 없습니다.</p>}
          </div>
        </aside>

        <section className={styles.toolDetail}>
          <h3>{tool.name}</h3>
          <p className={styles.meta}>
            <span className={styles.loc}>{tool.path}:{tool.line}</span> · <code>{HOW[tool.how] ?? tool.how}</code>
            {tool.params.length > 0 && <> · 인자 {tool.params.map(p => <code key={p} className={styles.param}>{p}</code>)}</>}
          </p>
          {tool.scope && (
            <p className={styles.meta}>
              닿는 함수 <b>{tool.scope.functions}</b> · 파일 <b>{tool.scope.files}</b> · 깊이 <b>{tool.scope.depth}</b>
              {tool.scope.ext.length > 0 && <> · 외부 {tool.scope.ext.map(m => <span key={m} className={styles.pill}>{m}</span>)}</>}
            </p>
          )}
          {tool.fn === undefined ? (
            <p className={styles.notice}>함수 없이 등록된 도구라(저수준 SDK의 Tool(name=…)) 따라갈 시작점이 없습니다.</p>
          ) : (
            <>
              <Diagram fns={fns} root={tool.fn} sel={fnSel} onSel={setFnSel} mark={mod} />
              {fnSel !== null && <Code fn={fns[fnSel]} fns={fns} lines={texts.get(fns[fnSel].path) ?? []} onSel={setFnSel} />}
            </>
          )}
        </section>
      </div>}
    </>
  );
}
