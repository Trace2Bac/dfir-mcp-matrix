import {spawnSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import type {LoadContext, Plugin} from '@docusaurus/types';

// 화면 데이터(static/data/matrix.json)를 만드는 플러그인.
// 원본(matrix/·reports/)이 바뀌면 Docusaurus가 getPathsToWatch로 알아채 loadContent를 다시 부른다.
// 따로 감시 프로세스를 띄우지 않으므로 npm start·npm run build는 docusaurus 명령 하나로 돈다.
// 데이터는 tools/pilot.py build가 만들고, 내용이 같으면 파일을 다시 쓰지 않는다.
// 셀 화면은 이 데이터 가운데 그 셀 부분만 빌드 때 페이지에 넣는다(src/remark/cellData.ts).
// 그래서 셀의 상세 정의가 정적 HTML과 검색 색인에 들어가고, 화면은 matrix.json을 받지 않고 바로 그려진다.
export default function matrixDataPlugin(context: LoadContext): Plugin {
  const root = path.resolve(context.siteDir, '..');
  return {
    name: 'matrix-data',

    getPathsToWatch() {
      return [
        path.join(root, 'matrix', '**', '*.{mdx,yaml,yml,json}'),
        path.join(root, 'reports', '**', '*.mdx'),
      ];
    },

    async loadContent() {
      // Python 실행 파일 이름이 OS마다 달라 scripts/update-data.mjs가 찾아 실행한다
      const r = spawnSync(process.execPath, [path.join(context.siteDir, 'scripts', 'update-data.mjs')], {stdio: 'inherit'});
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(`화면 데이터를 만들지 못했다(종료 코드 ${r.status}). 위 출력을 확인한다.`);
      return JSON.parse(fs.readFileSync(path.join(context.siteDir, 'static', 'data', 'matrix.json'), 'utf8'));
    },

    // 셀마다 .docusaurus/matrix-data/default/cells/<셀>.json을 만든다. 내용이 같으면 다시 쓰지 않으므로 바뀐 셀만 다시 그려진다
    async contentLoaded({content, actions}) {
      const data = content as {cells: {id: string}[]};
      await Promise.all(data.cells.map(c => actions.createData(`cells/${c.id}.json`, JSON.stringify(c))));
    },
  };
}
