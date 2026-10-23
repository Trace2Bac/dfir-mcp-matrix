import React, { useState } from "react";
import styles from "./styles.module.css";

// 분석 화면의 탭들이 같이 쓰는 자료 형식과 조각(위치 링크, 설명, 인자 목록, 코드).
// 자료 형식은 src/analyzer/core.mjs의 extractTree 출력과 같다

export type Call = { line: number; to?: number[]; ext?: string };
export type Fn = { name: string; path: string; line: number; end: number; calls: Call[] };
export type Param = { name: string; type: string | null; default: string | null; required: boolean; description: string | null };
export type Tool = {
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
export type Resource = {
  uri: string | null; name: string; mime: string | null; template: boolean;
  description: string | null; description_expr?: string; params: Param[]; path: string; line: number; end: number;
};
export type Prompt = {
  name: string; description: string | null; description_expr?: string; params: Param[]; path: string; line: number; end: number;
};
export type Mcp = {
  servers: { name: string | null; sdk: string; path: string; line: number; instructions: string | null; instructions_expr?: string }[];
  transports: string[];
  resources: Resource[];
  prompts: Prompt[];
  // MCP SDK 버전과 지원 규격 범위(oldest~latest). exact: lock 파일의 정확한 버전, atLeast: 조건의 가장 낮은 버전
  sdk: {
    package: string; version: string | null; spec: string | null; source: string;
    exact: boolean; atLeast: boolean; oldest: string | null; latest: string | null; via?: string;
  } | null;
};
// 분석한 결과. 지원하지 않는 언어면 language만 있다
export type Analysis = {
  language: string;
  supported: true;
  tools: Tool[];
  dynamic: { path: string; line: number }[];
  graph: { functions: Fn[] };
  mcp: Mcp;
  summary: {
    tools: number;
    functions_reached: number;
    files_reached: number;
    shared: { fn: number; tools: number[] }[];
  };
};
export type Result = Analysis | { language: string | null; supported: false };

export const shortPath = (p: string) => p.split("/").slice(-2).join("/");

/** GitHub 원본의 줄 주소. blob은 원본 파일 주소의 앞부분(https://github.com/o/r/blob/<ref>/) */
const blobHref = (blob: string, path: string, line: number, end?: number) =>
  `${blob}${path.split("/").map(encodeURIComponent).join("/")}#L${line}${end ? `-L${end}` : ""}`;

/** 파일:줄. blob이 있으면 원본으로 가는 링크 */
export function Loc({ path, line, end, blob }: { path: string; line: number; end?: number; blob?: string }) {
  const text = `${path}:${line}`;
  if (!blob) return <span className={styles.loc}>{text}</span>;
  return <a className={styles.loc} href={blobHref(blob, path, line, end)} target="_blank" rel="noopener noreferrer">{text}</a>;
}

// ── 설명 ──

const DESC_LINES = 6;

// docstring은 70자 안팎에서 줄을 바꿔 둔다. 화면에서는 문단 안의 줄바꿈을 이어 붙이고, 목록·들여쓴 줄은 그대로 둔다
const reflow = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((para) => (para.split("\n").some((l) => /^\s+\S|^\s*[-*•]\s/.test(l)) ? para : para.replace(/\n/g, " ")))
    .join("\n\n");

/** 클라이언트가 받는 설명. 길면 접어 두고, 코드만으로 못 읽으면 그 코드를 보인다 */
export function Description({ text, expr, empty = "설명 없음" }: { text: string | null; expr?: string; empty?: string }) {
  const [open, setOpen] = useState(false);
  const desc = text ? reflow(text) : null;
  if (!desc) {
    return expr ? (
      <p className={styles.muted}>실행할 때 정해지는 값: <code>{expr}</code></p>
    ) : (
      <p className={styles.muted}>{empty}</p>
    );
  }
  const long = desc.split("\n").length > DESC_LINES || desc.length > 500;
  return (
    <>
      <p className={`${styles.desc} ${long && !open ? styles.clamp : ""}`}>{desc}</p>
      {long && (
        <button className={styles.more} onClick={() => setOpen(!open)}>
          {open ? "접기" : "더 보기"}
        </button>
      )}
    </>
  );
}

/** 인자 목록: 이름 | 타입, 필수 또는 기본값, Field(description=…) */
export function Params({ params }: { params: Param[] }) {
  if (!params.length) return null;
  return (
    <div className={styles.params}>
      <span className={styles.paramsHead}>인자</span>
      {params.map((p) => (
        <div key={p.name} className={styles.param}>
          <code>{p.name}</code>
          <span className={styles.ptype}>
            {p.type}
            {p.required ? <span className={styles.req}>필수</span> : <span> = {p.default}</span>}
          </span>
          {p.description && <p className={styles.pdesc}>{p.description}</p>}
        </div>
      ))}
    </div>
  );
}

// ── 코드 ──

const MAX_LINES = 400;

/** 함수 하나의 코드. 호출이 있는 줄을 칠하고, 저장소 안 함수 호출은 눌러서 그 함수로 간다(onSel이 있을 때) */
export function Code({
  fn,
  fns,
  lines,
  onSel,
  blob,
}: {
  fn: Fn;
  fns: Fn[];
  lines: string[];
  onSel?: (id: number) => void;
  blob?: string;
}) {
  const body = lines.slice(fn.line - 1, fn.end);
  const byLine = new Map<number, Call[]>();
  for (const c of fn.calls) byLine.set(c.line, [...(byLine.get(c.line) ?? []), c]);
  return (
    <div className={styles.codeView}>
      <div className={styles.codeHead}>
        <b>{fn.name}</b> <span className={styles.loc}>{fn.path}:{fn.line}</span>
        <span className={styles.muted}> · {fn.end - fn.line + 1}줄</span>
        {blob && (
          <a className={styles.origin} target="_blank" rel="noopener noreferrer" href={blobHref(blob, fn.path, fn.line, fn.end)}>
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
                  onSel ? (
                    <button key={j} className={styles.jump} onClick={() => onSel(c.to![0])}>
                      → {fns[c.to[0]].name}
                    </button>
                  ) : (
                    <span key={j} className={styles.pill}>→ {fns[c.to[0]].name}</span>
                  )
                ) : (
                  <span key={j} className={styles.pill}>{c.ext}</span>
                ),
              )}
              {"\n"}
            </span>
          );
        })}
      </pre>
      {body.length > MAX_LINES && <p className={styles.muted}>나머지 {body.length - MAX_LINES}줄은 생략했습니다.</p>}
    </div>
  );
}
