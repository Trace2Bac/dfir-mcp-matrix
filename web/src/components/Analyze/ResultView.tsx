import React, { useRef, useState } from "react";
import ToolExplorer from "./ToolExplorer";
import { PromptsPanel, ResourcesPanel, ServerPanel, SharedPanel } from "./McpPanels";
import { Loc, type Analysis } from "./parts";
import styles from "./styles.module.css";

// 분석 결과 화면: 위에 요약, 아래에 탭(도구, 리소스, 프롬프트, 공통 경로, 서버).
// 리소스·프롬프트는 없어도 탭을 두어 MCP 서버가 무엇을 제공하는지 한 줄로 보이게 한다

type Tab = "tools" | "resources" | "prompts" | "shared" | "server";

// blob: GitHub에서 받았을 때 원본 파일 주소의 앞부분(https://github.com/o/r/blob/<ref>/)
export default function ResultView({ file, r, texts, blob }: { file: string; r: Analysis; texts: Map<string, string[]>; blob?: string }) {
  const { summary: s, tools, mcp } = r;
  const fns = r.graph.functions;
  const [tab, setTab] = useState<Tab>("tools");
  const [sel, setSel] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);

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
      </div>

      <div className={styles.tabs} role="tablist" ref={tabsRef}>
        {tabs.map(([id, name, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? styles.on : undefined} onClick={() => setTab(id)}>
            {name}
            {n !== null && <small>{n}</small>}
          </button>
        ))}
      </div>

      {tab === "tools" && <ToolExplorer tools={tools} fns={fns} texts={texts} blob={blob} sel={sel} onSel={setSel} />}
      {tab === "resources" && <ResourcesPanel resources={mcp.resources} texts={texts} blob={blob} />}
      {tab === "prompts" && <PromptsPanel prompts={mcp.prompts} texts={texts} blob={blob} />}
      {tab === "shared" && <SharedPanel shared={s.shared} tools={tools} fns={fns} texts={texts} blob={blob} onTool={openTool} />}
      {tab === "server" && <ServerPanel mcp={mcp} blob={blob} />}
    </>
  );
}
