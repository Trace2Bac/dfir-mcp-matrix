import fs from 'fs';
import path from 'path';
import type {LoadContext, Plugin} from '@docusaurus/types';

// 문제 매트릭스 화면 데이터(static/data/problems.json)를 두는 플러그인.
// 데이터 원본은 tools/problems_build.py가 problems/_data/*.csv에서 만든 problems/_data/problems.json이다.
// 그 파일이 바뀌면 Docusaurus가 getPathsToWatch로 알아채 loadContent를 다시 부른다.
// static/data/는 생성물이라 저장소에 넣지 않는다(.gitignore).
export default function problemsDataPlugin(context: LoadContext): Plugin {
  const root = path.resolve(context.siteDir, '..');
  const src = path.join(root, 'problems', '_data', 'problems.json');
  return {
    name: 'problems-data',

    getPathsToWatch() {
      return [src];
    },

    async loadContent() {
      if (!fs.existsSync(src)) {
        throw new Error(`문제 매트릭스 데이터가 없다: ${src}. 저장소 루트에서 python tools/problems_build.py를 실행한다.`);
      }
      const text = fs.readFileSync(src, 'utf8');
      const out = path.join(context.siteDir, 'static', 'data', 'problems.json');
      fs.mkdirSync(path.dirname(out), {recursive: true});
      // 내용이 같으면 다시 쓰지 않는다
      if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== text) fs.writeFileSync(out, text);
      return null;
    },
  };
}
