// 서버 원고(머리말에 cell이 있는 파일)는 문장 하나를 한 줄에 쓴다(작성 규칙 0005).
// Markdown은 같은 단락의 줄을 이어 붙여 보이므로, 화면에서도 원고의 한 줄을 한 줄로 떼어 보인다.
// 단락 안의 줄마다 <span class="report-line">으로 감싸고, 줄 사이 간격은 custom.css가 정한다.

type Node = {type: string; value?: string; children?: Node[]; data?: any};

function line(children: Node[]): Node {
  // emphasis를 hName으로 span으로 바꿔 줄 하나를 감싼다
  return {type: 'emphasis', children, data: {hName: 'span', hProperties: {className: ['report-line']}}};
}

function splitParagraph(p: Node): void {
  const lines: Node[][] = [[]];
  for (const c of p.children ?? []) {
    if (c.type === 'break') {
      lines.push([]);
    } else if (c.type === 'text' && c.value?.includes('\n')) {
      c.value.split('\n').forEach((part, i) => {
        if (i > 0) lines.push([]);
        const value = i > 0 ? part.trimStart() : part;
        if (value) lines[lines.length - 1].push({type: 'text', value});
      });
    } else {
      lines[lines.length - 1].push(c);
    }
  }
  const kept = lines.filter(l => l.length);
  if (kept.length > 1) p.children = kept.map(line);
}

function walk(node: Node): void {
  if (node.type === 'paragraph') splitParagraph(node);
  else node.children?.forEach(walk);
}

export default function sentenceLines() {
  return (tree: Node, file: any) => {
    if (!file.data?.frontMatter?.cell) return;
    walk(tree);
  };
}
