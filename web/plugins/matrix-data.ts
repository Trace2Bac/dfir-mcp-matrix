import {spawnSync} from 'child_process';
import path from 'path';
import type {LoadContext, Plugin} from '@docusaurus/types';

// 화면 데이터(static/data/matrix.json)를 만드는 플러그인.
// 원본(matrix/·reports/)이 바뀌면 Docusaurus가 getPathsToWatch로 알아채 loadContent를 다시 부른다.
// 따로 감시 프로세스를 띄우지 않으므로 npm start·npm run build는 docusaurus 명령 하나로 돈다.
// 데이터는 tools/pilot.py build가 만들고, 내용이 같으면 파일을 다시 쓰지 않는다.
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
    },
  };
}
