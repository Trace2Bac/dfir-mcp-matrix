// GFM은 물결표 하나(~글~)도 취소선으로 읽는다. 원고는 "T04.04~T04.07"처럼 물결표를 범위로 쓰므로,
// 물결표 하나로 생긴 취소선은 글로 되돌린다. 물결표 둘(~~글~~)로 쓴 취소선은 그대로 둔다.
// Docusaurus가 remark-gfm의 singleTilde 설정을 열어 두지 않아 여기서 고친다.

type Node = {type: string; value?: string; children?: Node[]; position?: {start: {offset?: number}}};

function unwrap(node: Node, source: string): void {
  if (!node.children) return;
  const out: Node[] = [];
  const push = (n: Node) => {
    const last = out[out.length - 1];
    if (n.type === 'text' && last?.type === 'text') last.value = (last.value ?? '') + (n.value ?? '');
    else out.push(n);
  };
  for (const child of node.children) {
    unwrap(child, source);
    const start = child.position?.start.offset;
    if (child.type === 'delete' && start !== undefined && source[start + 1] !== '~') {
      push({type: 'text', value: '~'});
      child.children?.forEach(push);
      push({type: 'text', value: '~'});
    } else {
      push(child);
    }
  }
  node.children = out;
}

export default function noSingleTilde() {
  return (tree: Node, file: {value?: unknown}) => {
    unwrap(tree, String(file.value ?? ''));
  };
}
