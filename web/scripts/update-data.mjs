// 화면 데이터(web/static/data/matrix.json)를 만든다: 저장소 루트에서 python tools/pilot.py build.
// Python 실행 파일 이름이 OS마다 달라(macOS·Linux는 python3만 있는 경우, Windows는 py 런처만 있는 경우) 있는 것을 차례로 찾는다.
// 환경변수 PYTHON을 주면 그것만 쓴다.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const candidates = process.env.PYTHON
  ? [process.env.PYTHON]
  : process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'];

for (const cmd of candidates) {
  const r = spawnSync(cmd, ['tools/pilot.py', 'build'], {cwd: root, stdio: 'inherit'});
  // 없는 명령(ENOENT)과 Windows의 Microsoft Store 바로가기(종료 코드 9009)는 다음 후보로 넘어간다
  if (r.error?.code === 'ENOENT' || r.status === 9009) continue;
  if (r.error) throw r.error;
  process.exit(r.status ?? 1);
}
console.error(`Python을 찾지 못했다(${candidates.join(', ')}). Python을 설치하거나 환경변수 PYTHON에 실행 파일 경로를 준다.`);
process.exit(1);
