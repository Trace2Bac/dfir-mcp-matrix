// npm start 동안 matrix/와 reports/를 지켜보다가 원본이 바뀌면 화면 데이터를 다시 만든다(update-data.mjs).
// 파일 감시 이벤트는 OS마다 다르게 온다. Windows에서는 파일을 읽기만 해도 이벤트가 오는 경우가 있어,
// 이벤트만 믿고 다시 만들면 "다시 만듦 → 파일을 읽음 → 이벤트 → 다시 만듦"이 끝없이 돈다.
// 그래서 이벤트가 오면 지켜보는 파일들의 수정 시각과 크기를 다시 재고, 실제로 달라졌을 때만 다시 만든다.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(web, '..');
const dirs = ['matrix', 'reports'].map(d => path.join(root, d));
const exts = new Set(['.yaml', '.yml', '.mdx', '.md', '.json']);
const DELAY = 300; // 저장이 여러 이벤트로 나뉘어 와도 한 번만 다시 만든다(ms)

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

// 지켜보는 파일 전체의 경로·수정 시각·크기. 읽기만 해서는 바뀌지 않는다
function signature() {
  return dirs
    .flatMap(d => walk(d, []))
    .sort()
    .map(p => {
      const s = fs.statSync(p, {throwIfNoEntry: false});
      return s ? `${p}:${s.mtimeMs}:${s.size}` : p;
    })
    .join('\n');
}

let last = signature();
let timer = null;
let running = false;
let again = false;

function rebuild() {
  if (running) {
    again = true;
    return;
  }
  const now = signature();
  if (now === last) return;
  last = now;
  running = true;
  const child = spawn(process.execPath, [path.join(web, 'scripts', 'update-data.mjs')], {stdio: 'inherit'});
  child.on('exit', () => {
    running = false;
    if (again) {
      again = false;
      rebuild();
    }
  });
}

for (const d of dirs) {
  fs.watch(d, {recursive: true}, (_event, file) => {
    if (file && !exts.has(path.extname(file))) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, DELAY);
  });
}
console.log(`[watch-data] ${dirs.map(d => path.relative(root, d)).join(', ')}의 원본이 바뀌면 화면 데이터를 다시 만든다`);
