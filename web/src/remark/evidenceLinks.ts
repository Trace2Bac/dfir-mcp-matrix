// 서버 원고(머리말에 cell이 있는 파일)의 근거 표지 [n]을 화면에서 링크로 바꾼다.
// 원고는 [n]으로 쓰고(reports/README.mdx), 링크와 앵커는 여기서만 만든다.
// - "### 근거" 소절에서 "[n] "으로 시작하는 단락 앞에 앵커 <a id="ev-n">를 단다.
// - 그 밖의 글에서 근거 항목이 있는 [n]만 #ev-n 링크로 바꾼다. 코드·인라인 코드·링크 안은 건드리지 않는다.
// - 본문의 표지 링크마다 id ev-n-ref-k(k는 그 근거를 가리킨 차례)를 달고, 근거 항목 머리에 첫 표지의 id를 남겨
//   reportLayout이 번호 이름표를 본문으로 돌아가는 링크로 만들게 한다(src/components/Matrix/EvidenceRefs.tsx).
// - 근거 소절 밖의 단락에 표지를 달아, markLines가 표지로 끝나는 문장마다 끊게 한다.
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
        // 표지는 화면에서 앞 글자에 붙은 위첨자로 보이므로(custom.css의 .report-mark) 앞의 빈칸을 빼고,
        // 여는 괄호 앞에서 줄이 바뀌어 표지만 다음 줄로 떨어지지 않게 단어 결합 문자(U+2060)를 둔다.
        // 단락 맨 앞의 표지(근거 항목의 머리)에는 붙일 글이 없으므로 두지 않는다
        const before = m.index! > last ? c.value.slice(last, m.index).replace(/ $/, '') : '';
        if (before || out.length) out.push({type: 'text', value: `${before}\u2060`});
        out.push({
          type: 'link',
          url: `#ev-${m[1]}`,
          children: [{type: 'text', value: m[0]}],
          data: {hProperties: {className: ['report-mark']}},
        });
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
    // 근거 소절 밖의 단락은 표지로 끝나는 문장마다 끊어 보인다(src/remark/markLines.ts)
    inEvid = false;
    for (const n of top) {
      if (n.type === 'heading') inEvid = n.depth === 3 && textOf(n).trim() === EVID_HEADING;
      else if (!inEvid && n.type === 'paragraph') n.data = {...n.data, markLines: true};
    }
    for (const p of heads) {
      // 항목 머리의 [n]은 링크가 아니라 앵커 자리다. linkMarks가 바꾼 첫 링크를 글로 되돌린다.
      const [first, ...rest] = p.children!;
      const n = HEAD.exec(textOf(p))![1];
      if (first.type === 'link') p.children = [anchor(n), {type: 'text', value: `[${n}]`}, ...rest];
      else p.children = [anchor(n), ...p.children!];
    }
    // 머리를 되돌린 뒤에 남은 표지 링크만 본문의 참조다. 문서 차례대로 번호를 매긴다
    const refs = new Map<string, number>();
    const numberRefs = (node: Node): void => {
      if (node.type === 'link' && node.data?.hProperties?.className?.includes('report-mark')) {
        const n = node.url!.slice('#ev-'.length);
        const k = (refs.get(n) ?? 0) + 1;
        refs.set(n, k);
        node.data.hProperties.id = `ev-${n}-ref-${k}`;
        return;
      }
      node.children?.forEach(numberRefs);
    };
    numberRefs(tree);
    for (const p of heads) {
      const n = HEAD.exec(textOf(p))![1];
      if (refs.has(n)) p.data = {...p.data, evidenceRef: `ev-${n}-ref-1`};
    }
  };
}
