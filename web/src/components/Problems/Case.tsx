import React, { type ReactNode, useEffect, useState } from 'react';
import CodeBlock from '@theme/CodeBlock';
import styles from './Case.module.css';

// 문제 화면의 서버 사례 하나. 요지(children) 아래에 코드 위치를 두고, 누르면 기준 커밋의 그 줄을 펼친다.
// 코드는 빌드에 넣지 않고 펼칠 때 raw.githubusercontent.com에서 받는다(tools/problems_build.py의 parse_locs가 refs를 만든다)
type Ref = { path: string; from: number; to: number };
type Props = { label: string; ok: boolean; repo: string; commit: string; refs: Ref[]; raw: string; children: ReactNode };

const CONTEXT = 3; // 범위 앞뒤로 더 보이는 줄
const MAX_LINES = 120; // 한 번에 보이는 줄 수 상한

const LANG: Record<string, string> = {
  py: 'python', ts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', go: 'go', rs: 'rust', cs: 'csharp',
  java: 'java', rb: 'ruby', sh: 'bash', ps1: 'powershell', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', md: 'markdown',
};
const langOf = (path: string) => LANG[path.split('.').pop()!.toLowerCase()] ?? 'text';

// 같은 파일을 여러 사례가 가리키므로 받은 파일은 한 번만 받는다
const files = new Map<string, Promise<string[]>>();
function loadFile(repo: string, commit: string, path: string): Promise<string[]> {
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${path}`;
  if (!files.has(url)) {
    files.set(
      url,
      fetch(url).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text().then(t => t.split('\n'));
      }),
    );
    files.get(url)!.catch(() => files.delete(url));
  }
  return files.get(url)!;
}

function Excerpt({ repo, commit, r }: { repo: string; commit: string; r: Ref }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadFile(repo, commit, r.path)
      .then(ls => alive && setLines(ls))
      .catch(e => alive && setError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, [repo, commit, r.path]);
  if (error) return <div className={styles.msg}>코드를 불러오지 못했습니다({error}). 위 링크에서 GitHub로 확인하세요.</div>;
  if (!lines) return <div className={styles.msg}>코드를 불러오는 중입니다...</div>;
  const from = Math.max(1, r.from - CONTEXT);
  const to = Math.min(lines.length, r.to + CONTEXT, from + MAX_LINES - 1);
  const hi = `{${r.from - from + 1}-${Math.min(r.to, to) - from + 1}}`;
  return (
    <CodeBlock language={langOf(r.path)} metastring={`${hi} showLineNumbers=${from}`} className={styles.code}>
      {lines.slice(from - 1, to).join('\n')}
    </CodeBlock>
  );
}

export default function Case({ label, ok, repo, commit, refs, raw, children }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  const allOpen = refs.length > 0 && open.size === refs.length;
  return (
    <div className={`${styles.card} ${ok ? styles.cardOk : styles.cardHit}`}>
      <div className={styles.head}>
        <span className={styles.n}>{label}</span>
        {refs.length > 1 && (
          <button type="button" className={styles.all} onClick={() => setOpen(allOpen ? new Set() : new Set(refs.map((_, i) => i)))}>
            {allOpen ? '코드 모두 접기' : '코드 모두 펼치기'}
          </button>
        )}
      </div>
      <div className={styles.body}>{children}</div>
      {raw && <div className={styles.raw}>코드 위치: {raw}</div>}
      {refs.map((r, i) => {
        const range = r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`;
        const gh = `https://github.com/${repo}/blob/${commit}/${r.path}#L${r.from}${r.to !== r.from ? `-L${r.to}` : ''}`;
        const isOpen = open.has(i);
        return (
          <div key={i} className={styles.ref}>
            <div className={styles.refRow}>
              <button type="button" className={styles.refBtn} onClick={() => toggle(i)} aria-expanded={isOpen}>
                <span className={styles.caret}>{isOpen ? '▾' : '▸'}</span>
                <code>
                  {r.path}:{range}
                </code>
              </button>
              <a href={gh} target="_blank" rel="noopener noreferrer" className={styles.gh}>
                GitHub ↗
              </a>
            </div>
            {isOpen && <Excerpt repo={repo} commit={commit} r={r} />}
          </div>
        );
      })}
    </div>
  );
}
