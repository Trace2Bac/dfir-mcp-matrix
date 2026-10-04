// 서버 원고(머리말에 cell이 있는 파일)를 셀 화면처럼 읽기 쉽게 묶는다. 원고 글은 바꾸지 않고 화면의 틀만 만든다.
// - 상세 소제목(###)과 "근거" 소제목에 클래스를 달아 구분선으로 나눈다.
// - "**구현.**"·"**예외.**"·"**판단.**"로 시작하는 단락부터 다음 이름표나 소제목 앞까지를 한 덩어리로 묶고
//   굵은 머리를 셀 화면의 포함·제외처럼 이름표로 보인다.
// - 근거 소절은 "[n] "으로 시작하는 단락부터 다음 항목 앞까지를 한 덩어리로 묶고, 발췌 아래 출처 링크 단락에 클래스를 단다.
// - 발췌 코드의 공통 들여쓰기를 화면에서만 걷어 낸다.
// evidenceLinks 뒤, sentenceLines 앞에 둔다(근거 앵커가 먼저 붙고, 줄 나누기는 묶은 뒤에 한다).

type Node = {type: string; value?: string; depth?: number; children?: Node[]; data?: any; url?: string};

const EVID_HEADING = '근거';
const LABELS: Record<string, string> = {구현: 'impl', 예외: 'exc', 판단: 'judge'};
const EVID_HEAD = /^\[(\d+)\]\s?/;

const textOf = (n: Node): string => n.value ?? (n.children ?? []).map(textOf).join('');

const box = (className: string, children: Node[], tag = 'div'): Node => ({
  type: 'reportBox',
  children,
  data: {hName: tag, hProperties: {className: className.split(' ')}},
});

const addClass = (n: Node, className: string): void => {
  n.data = {...n.data, hProperties: {...n.data?.hProperties, className: [className]}};
};

// "**구현.** 본문"이면 이름표 종류를 돌려주고 단락에서 굵은 머리를 뗀다
function takeLabel(p: Node): string | null {
  const [first, second] = p.children ?? [];
  if (first?.type !== 'strong') return null;
  const name = textOf(first).trim().replace(/\.$/, '');
  const kind = LABELS[name];
  if (!kind) return null;
  p.children = p.children!.slice(1);
  if (second?.type === 'text') second.value = second.value!.replace(/^\s+/, '');
  if (second?.type === 'text' && !second.value) p.children = p.children.slice(1);
  return kind;
}

function labelNode(kind: string): Node {
  const name = Object.keys(LABELS).find(k => LABELS[k] === kind)!;
  return box(`report-label report-label--${kind}`, [{type: 'text', value: name}], 'span');
}

// 근거 항목 머리의 "[n]"을 번호 이름표로 바꾼다. 앞에 붙은 앵커(evidenceLinks)는 그대로 둔다
function markEvidenceNo(p: Node): void {
  const children = p.children ?? [];
  const i = children.findIndex(c => c.type === 'text');
  if (i < 0) return;
  const m = EVID_HEAD.exec(children[i].value!);
  if (!m) return;
  const rest = children[i].value!.slice(m[0].length);
  const no = box('report-evidence-no', [{type: 'text', value: `[${m[1]}]`}], 'span');
  p.children = [...children.slice(0, i), no, ...(rest ? [{type: 'text', value: rest}] : []), ...children.slice(i + 1)];
}

const isSourceLink = (n: Node): boolean =>
  n.type === 'paragraph' && n.children?.length === 1 && n.children[0].type === 'link';

function dedent(node: Node): void {
  if (node.type === 'code' && node.value) {
    const lines = node.value.split('\n');
    const indents = lines.filter(l => l.trim()).map(l => /^[ \t]*/.exec(l)![0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    if (cut) node.value = lines.map(l => l.slice(cut)).join('\n');
  }
  node.children?.forEach(dedent);
}

export default function reportLayout() {
  return (tree: Node, file: any) => {
    if (!file.data?.frontMatter?.cell) return;
    dedent(tree);

    const out: Node[] = [];
    let inEvid = false;
    let group: Node | null = null; // 지금 채우는 덩어리
    for (const n of tree.children ?? []) {
      if (n.type === 'heading') {
        group = null;
        if (n.depth === 3) {
          inEvid = textOf(n).trim() === EVID_HEADING;
          addClass(n, inEvid ? 'report-evidence-heading' : 'report-detail');
        }
        out.push(n);
        continue;
      }
      if (!inEvid && n.type === 'paragraph') {
        const kind = takeLabel(n);
        if (kind) {
          group = box(`report-part report-part--${kind}`, [labelNode(kind)]);
          out.push(group);
          if (n.children!.length) group.children!.push(n);
          continue;
        }
      }
      if (inEvid && n.type === 'paragraph' && EVID_HEAD.test(textOf(n))) {
        markEvidenceNo(n);
        addClass(n, 'report-evidence-title');
        group = box('report-evidence', [n]);
        out.push(group);
        continue;
      }
      if (inEvid && isSourceLink(n)) addClass(n, 'report-source');
      if (group) group.children!.push(n);
      else out.push(n);
    }
    tree.children = out;
  };
}
