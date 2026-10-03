// 서버 원고(머리말에 cell이 있는 파일)의 근거 표지 [n]을 화면에서 링크로 바꾼다.
// 원고는 [n]으로 쓰고(reports/README.mdx), 링크와 앵커는 여기서만 만든다.
// - "### 근거" 소절에서 "[n] "으로 시작하는 단락 앞에 앵커 <a id="ev-n">를 단다.
// - 그 밖의 글에서 근거 항목이 있는 [n]만 #ev-n 링크로 바꾼다. 코드·인라인 코드·링크 안은 건드리지 않는다.
// - 코드의 제어 문자를 보이는 기호로 바꾼다(showControls).
// 앵커는 MDXComponents의 a(Link)로 그려져 Docusaurus 앵커 검사에 잡힌다.

type Node = {type: string; value?: string; depth?: number; children?: Node[]; data?: any; url?: string};

const EVID_HEADING = '근거';
const HEAD = /^\[(\d+)\] /;
const MARK = /\[(\d+)\]/g;

const textOf = (n: Node): string =>
  n.value ?? (n.children ?? []).map(textOf).join('');

function anchor(n: string): Node {
  // emphasis를 hName으로 a로 바꿔 내용 없는 앵커를 만든다
  return {type: 'emphasis', children: [], data: {hName: 'a', hProperties: {id: `ev-${n}`}}};
}

function linkMarks(node: Node, ids: Set<string>): void {
  if (!node.children) return;
  const out: Node[] = [];
  for (const c of node.children) {
    if (c.type === 'text' && c.value) {
      let last = 0;
      for (const m of c.value.matchAll(MARK)) {
        if (!ids.has(m[1])) continue;
        if (m.index! > last) out.push({type: 'text', value: c.value.slice(last, m.index)});
        out.push({type: 'link', url: `#ev-${m[1]}`, children: [{type: 'text', value: m[0]}]});
        last = m.index! + m[0].length;
      }
      if (last === 0) out.push(c);
      else if (last < c.value.length) out.push({type: 'text', value: c.value.slice(last)});
    } else {
      if (!['link', 'linkReference', 'heading'].includes(c.type)) linkMarks(c, ids);
      out.push(c);
    }
  }
  node.children = out;
}

// 발췌에 든 제어 문자(예: C#의 '\x01')는 HTML에 그대로 둘 수 없어 화면에서만 기호(␁)로 보인다. 원고는 원문 그대로 둔다.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

function showControls(node: Node): void {
  if ((node.type === 'code' || node.type === 'inlineCode') && node.value)
    node.value = node.value.replace(CONTROL, (c) => String.fromCharCode(0x2400 + c.charCodeAt(0)));
  node.children?.forEach(showControls);
}

export default function evidenceLinks() {
  return (tree: Node, file: any) => {
    if (!file.data?.frontMatter?.cell) return;
    showControls(tree);
    const top = tree.children ?? [];
    const ids = new Set<string>();
    const heads: Node[] = [];
    let inEvid = false;
    for (const n of top) {
      if (n.type === 'heading') inEvid = n.depth === 3 && textOf(n).trim() === EVID_HEADING;
      else if (inEvid && n.type === 'paragraph') {
        const first = n.children?.[0];
        const m = first?.type === 'text' ? HEAD.exec(first.value ?? '') : null;
        if (m) {
          ids.add(m[1]);
          heads.push(n);
        }
      }
    }
    if (!ids.size) return;
    linkMarks(tree, ids);
    for (const p of heads) {
      // 항목 머리의 [n]은 링크가 아니라 앵커 자리다. linkMarks가 바꾼 첫 링크를 글로 되돌린다.
      const [first, ...rest] = p.children!;
      const n = HEAD.exec(textOf(p))![1];
      if (first.type === 'link') p.children = [anchor(n), {type: 'text', value: `[${n}]`}, ...rest];
      else p.children = [anchor(n), ...p.children!];
    }
  };
}
