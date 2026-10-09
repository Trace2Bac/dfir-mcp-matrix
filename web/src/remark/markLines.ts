// 서버 원고(머리말에 cell이 있는 파일)의 글을 근거 표지로 끝나는 문장마다 끊어 보인다.
// 원고는 문장 하나를 한 줄에 쓰지만(작성 규칙 0005), 줄마다 떼면 글이 잘게 끊겨 읽기 어렵다.
// 그래서 근거 표지 [n]로 끝나는 줄 뒤에서만 끊고, 표지가 없는 줄은 다음 줄과 이어 보인다.
// 대상은 evidenceLinks가 markLines 표지를 단 단락(근거 소절 밖)이다. reportLayout 뒤에 둔다(구현·한계 머리를 먼저 읽게).

type Node = {type: string; value?: string; children?: Node[]; data?: any; url?: string};

// 끊은 덩어리마다 <span class="report-line">으로 감싼다. 덩어리 사이 간격은 custom.css가 정해, 화면 폭 때문에 꺾인 줄과 새 문장이 구분된다.
// 표지 링크 바로 뒤의 글이 마침표 따위와 줄바꿈으로 시작하면 그 줄바꿈에서 끊는다
const AFTER_MARK = /^([^\S\n]*[.,;:)]*)\n[^\S\n]*/;

function line(children: Node[]): Node {
  // emphasis를 hName으로 span으로 바꿔 덩어리 하나를 감싼다
  return {type: 'emphasis', children, data: {hName: 'span', hProperties: {className: ['report-line']}}};
}

function breakAfterMarks(p: Node): void {
  const lines: Node[][] = [[]];
  for (const c of p.children ?? []) {
    const cur = lines[lines.length - 1];
    const prev = cur[cur.length - 1];
    const m = c.type === 'text' && prev?.type === 'link' && prev.url?.startsWith('#ev-') ? AFTER_MARK.exec(c.value ?? '') : null;
    if (!m) {
      cur.push(c);
      continue;
    }
    if (m[1]) cur.push({type: 'text', value: m[1]});
    const rest = c.value!.slice(m[0].length);
    lines.push(rest ? [{type: 'text', value: rest}] : []);
  }
  const kept = lines.filter(l => l.length);
  if (kept.length > 1) p.children = kept.map(line);
}

function walk(node: Node): void {
  if (node.type === 'paragraph' && node.data?.markLines) breakAfterMarks(node);
  else node.children?.forEach(walk);
}

export default function markLines() {
  return (tree: Node, file: any) => {
    if (!file.data?.frontMatter?.cell) return;
    walk(tree);
  };
}
