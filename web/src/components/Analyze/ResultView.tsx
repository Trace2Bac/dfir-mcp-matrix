import React, { useEffect, useMemo, useRef, useState } from "react";
import ToolExplorer from "./ToolExplorer";
import { PromptsPanel, ResourcesPanel, ServerPanel, SharedPanel } from "./McpPanels";
import { Loc, type Analysis } from "./parts";
import { sdkOf, toolsListEntry } from "@site/src/analyzer/toolslist.mjs";
import styles from "./styles.module.css";

// 분석 결과 화면: 위에 요약, 아래에 탭(도구, 리소스, 프롬프트, 공통 경로, 서버).
// 리소스·프롬프트는 없어도 탭을 두어 MCP 서버가 무엇을 제공하는지 한 줄로 보이게 한다

type Tab = "tools" | "resources" | "prompts" | "shared" | "server";

/** data를 JSON 파일로 내려받게 한다 */
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // 바로 풀면 내려받기가 끊기는 브라우저가 있다
}

// blob: GitHub에서 받았을 때 원본 파일 주소의 앞부분(https://github.com/o/r/blob/<ref>/).
// initialTool: 처음 열 도구 이름(공유 링크의 tool=). onTool: 고른 도구가 바뀔 때 이름을 알린다. 있으면 링크 복사를 보인다
export default function ResultView({ file, r, texts, blob, initialTool, onTool }: {
  file: string; r: Analysis; texts: Map<string, string[]>; blob?: string; initialTool?: string; onTool?: (name: string) => void;
}) {
  const { summary: s, tools, mcp } = r;
  const fns = r.graph.functions;
  const sdk = useMemo(() => sdkOf(mcp), [mcp]);
  const [tab, setTab] = useState<Tab>("tools");
  const [sel, setSel] = useState(() => Math.max(0, tools.findIndex((t) => t.name === initialTool)));
  const [copied, setCopied] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tools[sel]) onTool?.(tools[sel].name);
  }, [sel]);
  const base = file.replace(/[^\w.-]+/g, "_");
  // 클립보드를 쓸 수 없으면(권한 거부 등) 주소를 직접 복사하도록 보여 준다
  const copyLink = () => navigator.clipboard.writeText(window.location.href).then(
    () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    () => window.prompt("링크", window.location.href),
  );

  // 다른 탭에서 도구를 누르면 도구 탭에서 그 도구를 연다
  const openTool = (i: number) => {
    setSel(i);
    setTab("tools");
    tabsRef.current?.scrollIntoView({ block: "start" });
  };
  const tabs: [Tab, string, number | null][] = [
    ["tools", "도구", s.tools],
    ["resources", "리소스", mcp.resources.length],
    ["prompts", "프롬프트", mcp.prompts.length],
    ["shared", "공통 경로", s.shared.length],
    ["server", "서버", null],
  ];

  return (
    <>
      <div className={styles.head}>
        <b>{file}</b>
        <div className={styles.stats} title="도구가 직접·간접으로 호출하는 함수와 파일">
          <div><b>{s.tools}</b>도구</div>
          <div><b>{s.functions_reached}</b>호출 함수</div>
          <div><b>{s.files_reached}</b>파일</div>
        </div>
        {r.dynamic.length > 0 && (
          <span className={styles.dynamic} title="반복문 등으로 등록해서 도구 목록에는 없음">
            동적 등록{" "}
            {r.dynamic.map((d, i) => (
              <React.Fragment key={i}>
                {i > 0 && ", "}
                <Loc path={d.path} line={d.line} blob={blob} />
              </React.Fragment>
            ))}
          </span>
        )}
        <div className={styles.actions}>
          <button onClick={() => download(`${base}.analysis.json`, { source: file, ...r })} title="도구, 호출 그래프, MCP 기능, 요약 전체">
            분석 결과 JSON
          </button>
          <button onClick={() => download(`${base}.tools.json`, { tools: tools.map((t) => toolsListEntry(t, sdk).entry) })} title="코드에서 읽은 값으로 만든 tools/list 결과 추정">
            tools/list JSON(추정)
          </button>
          {onTool && (
            <button onClick={copyLink} title="저장소와 고른 도구를 담은 링크">{copied ? "복사했습니다" : "링크 복사"}</button>
          )}
        </div>
      </div>

      <div className={styles.tabs} role="tablist" ref={tabsRef}>
        {tabs.map(([id, name, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? styles.on : undefined} onClick={() => setTab(id)}>
            {name}
            {n !== null && <small>{n}</small>}
          </button>
        ))}
      </div>

      {tab === "tools" && <ToolExplorer tools={tools} fns={fns} texts={texts} blob={blob} sel={sel} onSel={setSel} sdk={sdk} />}
      {tab === "resources" && <ResourcesPanel resources={mcp.resources} texts={texts} blob={blob} />}
      {tab === "prompts" && <PromptsPanel prompts={mcp.prompts} texts={texts} blob={blob} />}
      {tab === "shared" && <SharedPanel shared={s.shared} tools={tools} fns={fns} texts={texts} blob={blob} onTool={openTool} />}
      {tab === "server" && <ServerPanel mcp={mcp} blob={blob} />}
    </>
  );
}
