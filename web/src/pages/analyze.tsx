import React, { useRef, useState } from 'react';
import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { unzipSync } from 'fflate';
import { GRAMMARS, extractTree, isSource } from '@site/src/analyzer/core.mjs';
import ToolExplorer, { type Result } from '@site/src/components/Analyze/ToolExplorer';
import styles from '@site/src/components/Analyze/styles.module.css';

// MCP 서버 분석. 소스를 GitHub 링크나 zip으로 받아 브라우저 안에서 등록 도구와 호출 그래프를 만든다.
// 분석 코드는 src/analyzer/에 있다. 파서(web-tree-sitter)와 문법 wasm은 static/parser/에 그대로 두어 번들에 넣지 않는다. 외부 CDN을 쓰지 않는다.

type Source = { paths: string[]; files: [string, string][] };

// zip의 파일 경로와 소스 내용. GitHub zip처럼 최상위 폴더가 하나뿐이면 그 안을 소스 루트로 본다
function readZip(data: Uint8Array): Source {
  const names: string[] = [];
  const entries = unzipSync(data, {
    filter: f => {
      if (!f.name.endsWith('/')) names.push(f.name);
      return isSource(f.name) || isSource(f.name.slice(f.name.indexOf('/') + 1));
    },
  });
  const tops = new Set(names.map(n => (n.includes('/') ? n.slice(0, n.indexOf('/')) : '')));
  const strip = tops.size === 1 && !tops.has('') ? [...tops][0].length + 1 : 0;
  const decoder = new TextDecoder('utf-8');
  const files: [string, string][] = [];
  for (const n of names) {
    const p = n.slice(strip);
    if (isSource(p) && entries[n]) files.push([p, decoder.decode(entries[n])]);
  }
  return { paths: names.map(n => n.slice(strip)), files };
}

/** github.com/o/r, github.com/o/r/tree/<브랜치·커밋>, github.com/o/r/commit/<커밋>, o/r */
function parseGitHub(url: string): { owner: string; repo: string; ref: string } | null {
  const m = url.trim().replace(/^https?:\/\//, '').replace(/^(www\.)?github\.com\//, '')
    .match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|commit|blob)\/([^/?#]+))?(?:[/?#].*)?$/);
  return m ? { owner: m[1], repo: m[2], ref: m[3] ?? 'HEAD' } : null;
}

// GitHub zip 다운로드는 브라우저에서 막혀 있다(CORS). 파일 목록 API(호출 1번)와 raw 파일은 열려 있어서 이 둘로 받는다
async function readGitHub({ owner, repo, ref }: { owner: string; repo: string; ref: string }, progress: (s: string) => void): Promise<Source> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  if (res.status === 404 || res.status === 422) throw new Error(`${owner}/${repo}@${ref}를 찾지 못했습니다. 공개 저장소이고 브랜치·커밋 이름이 맞는지 확인하세요.`);
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    throw new Error(`GitHub API 호출 한도(로그인 없이 한 시간에 60번)를 넘었습니다. ${reset ? `${new Date(reset * 1000).toLocaleTimeString()} 뒤에` : '잠시 뒤'} 다시 하거나 zip을 올리세요.`);
  }
  if (!res.ok) throw new Error(`GitHub API 오류 ${res.status}`);
  const tree = await res.json();
  if (tree.truncated) throw new Error('저장소가 너무 커서 GitHub가 파일 목록을 다 주지 않았습니다. zip을 올리세요.');
  const paths: string[] = tree.tree.filter((e: any) => e.type === 'blob').map((e: any) => e.path);
  const wanted = paths.filter(isSource);
  const files: [string, string][] = [];
  let next = 0;
  // 16개씩 동시에 받는다
  const worker = async () => {
    while (next < wanted.length) {
      const p = wanted[next++];
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${p.split('/').map(encodeURIComponent).join('/')}`);
      if (!r.ok) throw new Error(`${p}를 받지 못했습니다(${r.status}).`);
      files.push([p, await r.text()]);
      progress(`소스 파일을 받는 중입니다... ${files.length}/${wanted.length}`);
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  return { paths, files };
}

let parserModule: Promise<any> | null = null;

// 번들러가 손대지 않게 static/parser/의 파서를 실행할 때 불러온다. 파서는 자기 옆의 web-tree-sitter.wasm을 찾는다
function loadParserOnce(parserUrl: string): Promise<any> {
  parserModule ??= import(/* webpackIgnore: true */ parserUrl).then(async m => {
    await m.Parser.init();
    return m;
  });
  parserModule.catch(() => { parserModule = null; });
  return parserModule;
}

function Analyzer() {
  const parserUrl = useBaseUrl('/parser/web-tree-sitter.js');
  const grammarBase = useBaseUrl('/parser/');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ label: string; r: Result; texts: Map<string, string[]> } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // label: 결과 위에 보일 이름. load: 소스를 가져온다
  const run = async (label: string, load: () => Promise<Source>) => {
    setError('');
    setResult(null);
    try {
      const { paths, files } = await load();
      setStatus('도구를 찾고 호출을 따라가는 중입니다...');
      const r: Result = await extractTree(paths, files, async (lang: string) => {
        const { Parser, Language } = await loadParserOnce(parserUrl);
        const p = new Parser();
        p.setLanguage(await Language.load(grammarBase + (GRAMMARS as Record<string, string>)[lang]));
        return p;
      });
      setResult({ label, r, texts: new Map(files.map(([p, t]) => [p, t.split('\n')])) });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setStatus('');
      if (input.current) input.current.value = '';
    }
  };

  const onUrl = (e: { preventDefault(): void }) => {
    e.preventDefault();
    const gh = parseGitHub(url);
    if (!gh) return setError('GitHub 저장소 링크(github.com/소유자/저장소)를 넣으세요.');
    const ref = /^[0-9a-f]{40}$/.test(gh.ref) ? gh.ref.slice(0, 7) : gh.ref;
    const label = `${gh.owner}/${gh.repo}${gh.ref === 'HEAD' ? '' : `@${ref}`}`;
    setStatus(`${label}의 파일 목록을 받는 중입니다...`);
    run(label, () => readGitHub(gh, setStatus));
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setStatus(`${file.name}을 읽는 중입니다...`);
    run(file.name, async () => readZip(new Uint8Array(await file.arrayBuffer())));
  };

  return (
    <>
      <div className={styles.sources}>
        <form className={styles.source} onSubmit={onUrl}>
          <h2>GitHub 링크</h2>
          <div className={styles.urlRow}>
            <input type="text" inputMode="url" placeholder="https://github.com/소유자/저장소" value={url}
                   disabled={!!status} onChange={e => setUrl(e.target.value)} aria-label="GitHub 저장소 링크" />
            <button type="submit" disabled={!!status || !url.trim()}>분석</button>
          </div>
          <small>공개 저장소만 됩니다. 브랜치나 커밋은 …/tree/&lt;이름&gt; 링크로 고릅니다. 소스는 GitHub에서 이 브라우저로 바로 받습니다.</small>
        </form>
        <div className={styles.source}>
          <h2>zip 파일</h2>
          <input ref={input} type="file" accept=".zip" aria-label="소스 zip 파일" disabled={!!status} onChange={e => onFile(e.target.files?.[0])} />
          <small>비공개 저장소나 내 컴퓨터의 소스. 파일은 이 브라우저 밖으로 나가지 않습니다.</small>
        </div>
      </div>
      {status && <p className={styles.muted}>{status}</p>}
      {error && <pre className={styles.error}>{error}</pre>}
      {result && !result.r.supported && (
        <p className={styles.notice}>주 언어가 {result.r.language ?? '알 수 없음'}입니다. 지금은 Python 서버만 분석합니다.</p>
      )}
      {result?.r.supported && <ToolExplorer file={result.label} r={result.r} texts={result.texts} />}
    </>
  );
}

export default function Analyze() {
  return (
    <Layout title="MCP 서버 분석" description="MCP 서버 소스에서 등록 도구를 찾고 도구마다 코드를 따라가 다이어그램으로 보여 줍니다.">
      <main className={styles.page}>
        <h1>MCP 서버 분석</h1>
        <p className={styles.lead}>
          MCP 서버 소스를 GitHub 링크나 zip으로 넣으면 등록 도구를 찾고, 도구마다 실제 코드를 따라가 다이어그램으로 보여 줍니다.
          칸을 누르면 그 함수의 코드가 나오고, 외부 모듈을 누르면 그 모듈에 닿는 도구만 남습니다. 지금은 Python 서버만 지원합니다.
        </p>
        <Analyzer />
      </main>
    </Layout>
  );
}
