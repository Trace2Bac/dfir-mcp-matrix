// MCP 서버 정적 분석의 입구. 분석 화면(src/pages/analyze.tsx)이 쓴다.
//   core.mjs    언어 판별, 읽을 파일 고르기, 요약(도구별 범위)
//   python.mjs  Python 서버: 등록 도구, 호출 그래프
// 파서(web-tree-sitter)는 부르는 쪽이 만들어 넘긴다. wasm 위치는 화면이 안다.
//
// 출력(extractTree):
//   tools     등록 도구. name·path·line·reg, description(MCP 클라이언트가 보는 설명. 코드만으로 못 읽으면 description_expr), params(인자),
//             fn(graph.functions의 시작 함수 번호), scope(호출하는 함수·파일 수)
//             line은 함수 정의(def) 줄이다. reg는 등록한 코드 한 줄이다(python.mjs의 findTools).
//   dynamic   코드만 보고 함수를 정할 수 없는 등록(반복문 안의 x.tool()(변수) 등)
//   graph     도구가 호출하는 함수와 호출(python.mjs의 buildGraph)
//   summary   도구 수, 도구가 호출하는 함수·파일 수
// 다른 언어는 EXTRACTORS와 GRAMMARS에 더한다.

import { extractPython } from './python.mjs';

const SKIP_DIRS = new Set(['.git', '.venv', 'venv', 'node_modules', 'tests', 'test', '__pycache__']);

const LANG_BY_EXT = { '.py': 'python', '.java': 'java', '.ts': 'typescript', '.js': 'javascript', '.cs': 'csharp', '.go': 'go' };

// 언어마다 tree-sitter 문법 wasm 파일 이름. 파일은 static/parser/에 둔다
export const GRAMMARS = { python: 'tree-sitter-python.wasm' };
const EXTRACTORS = { python: extractPython };

const ext = path => {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i) : '';
};

/** 건너뛸 폴더 아래의 파일인가. path는 소스 루트 기준 상대 경로(구분자 /) */
function isSkipped(path) {
  return path.split('/').slice(0, -1).some(d => SKIP_DIRS.has(d));
}

/** 분석할 소스 파일인가. 이 파일만 압축을 풀거나 읽는다 */
export function isSource(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return !isSkipped(path) && ext(path) === '.py' && !base.startsWith('test_');
}

/** 파일 수가 가장 많은 언어 */
function detectLanguage(paths) {
  const counts = {};
  for (const p of paths) {
    const lang = isSkipped(p) ? null : LANG_BY_EXT[ext(p)];
    if (lang) counts[lang] = (counts[lang] ?? 0) + 1;
  }
  let best = null;
  for (const [lang, n] of Object.entries(counts)) if (best === null || n > counts[best]) best = lang;
  return best;
}

/** 도구 하나가 직접·간접으로 호출하는 함수(번호 → 깊이). 너비 우선이라 Map 순서가 가까운 순서다. 화면의 다이어그램도 쓴다 */
export function reachOf(functions, root) {
  const depth = new Map([[root, 0]]);
  const queue = [root];
  for (let i = 0; i < queue.length; i++) {
    for (const c of functions[queue[i]].calls) {
      for (const to of c.to ?? []) if (!depth.has(to)) { depth.set(to, depth.get(queue[i]) + 1); queue.push(to); }
    }
  }
  return depth;
}

// 외부 호출을 묶는 이름은 최상위 패키지다: subprocess.run → subprocess, os.path.join → os. 화면의 다이어그램이 쓴다
export const extModule = e => e.split('.')[0];

function summarize(tools, graph) {
  for (const t of tools) {
    if (t.fn === undefined) continue;
    const fns = [...reachOf(graph.functions, t.fn).keys()].map(i => graph.functions[i]);
    t.scope = { functions: fns.length, files: new Set(fns.map(f => f.path)).size };
  }
  return {
    tools: tools.length,
    functions_reached: graph.functions.length,
    files_reached: new Set(graph.functions.map(f => f.path)).size,
  };
}

/**
 * 풀어 둔 소스 하나를 분석한다.
 * paths: 소스 루트 기준 모든 파일 경로. files: isSource()인 파일의 [경로, 내용] 목록.
 * makeParser(lang): 그 언어 문법을 넣은 web-tree-sitter Parser를 돌려준다.
 */
export async function extractTree(paths, files, makeParser) {
  const language = detectLanguage(paths);
  if (!EXTRACTORS[language]) return { language, supported: false };
  const parser = await makeParser(language);
  try {
    const sorted = [...files].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const out = EXTRACTORS[language](sorted, parser);
    return { language, supported: true, ...out, summary: summarize(out.tools, out.graph) };
  } finally {
    parser.delete();
  }
}
