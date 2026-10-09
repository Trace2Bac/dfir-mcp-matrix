// 셀 화면(머리말에 question이 있는 파일)에 그 셀의 화면 데이터를 붙인다.
// 데이터는 matrix-data 플러그인이 셀마다 만든 JSON이고(plugins/matrix-data.ts), 이 파일이
// `export {default as cellData} from '@generated/matrix-data/default/cells/<셀>.json'`을 더한다.
// webpack이 이 JSON을 페이지에 묶으므로 셀 화면은 빌드 때 그려지고, JSON이 바뀌면 개발 서버도 다시 그린다.
// 내보낸 값은 DocItem 래퍼가 받아 CellToolList에 넘긴다(src/theme/DocItem/index.tsx).

type Node = {type: string; children?: Node[]; value?: string; data?: any};

export default function cellData() {
  return (tree: Node, file: {data: {frontMatter?: Record<string, unknown>}}) => {
    const fm = file.data.frontMatter ?? {};
    if (typeof fm.question !== 'string' || typeof fm.id !== 'string') return;
    const source = `@generated/matrix-data/default/cells/${fm.id}.json`;
    tree.children?.unshift({
      type: 'mdxjsEsm',
      value: `export {default as cellData} from '${source}'`,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [
            {
              type: 'ExportNamedDeclaration',
              declaration: null,
              specifiers: [
                {
                  type: 'ExportSpecifier',
                  local: {type: 'Identifier', name: 'default'},
                  exported: {type: 'Identifier', name: 'cellData'},
                },
              ],
              source: {type: 'Literal', value: source, raw: JSON.stringify(source)},
            },
          ],
        },
      },
    });
  };
}
