// 의존성 패키지의 알려진 취약점을 osv.dev에서 조회한다. 분석 화면의 의존성 탭이 쓴다.
// 분석(core.mjs)은 네트워크 없이 끝나고, 이 조회는 사용자가 누를 때만 따로 한다(패키지 이름과 버전이 osv.dev로 나간다).
//
// OSV는 GitHub Advisory(GHSA)와 PyPI advisory(PYSEC)를 함께 모아서, 같은 취약점이 두 ID로 나온다.
// aliases로 묶어 하나로 보이고, 대표 ID는 GHSA를 쓴다.
//
// 출력(queryOsv): [{name, version, scope, group, vulns}]. 취약점이 있는 패키지만.
//   vulns  [{id, ids(묶인 OSV ID), cves, summary, fixed(지금 버전보다 높은 수정 버전 중 가장 낮은 것), url}]

import { normName, versionAtLeast } from './python.mjs';

const API = 'https://api.osv.dev/v1';
const BATCH = 1000; // querybatch 한 번에 넣을 수 있는 질의 수
const PARALLEL = 6; // 취약점 상세를 동시에 받는 수

/** body가 있으면 JSON으로 POST, 없으면 GET */
async function request(f, path, body) {
  const init = body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await f(API + path, init);
  if (!res.ok) throw new Error(`osv.dev 응답 오류(${res.status})`);
  return res.json();
}

/** 패키지마다 해당하는 취약점 ID. 결과가 많아 next_page_token이 오면 그 패키지만 이어서 받는다 */
async function idsOf(f, packages) {
  const out = packages.map(() => []);
  for (let start = 0; start < packages.length; start += BATCH) {
    const chunk = packages.slice(start, start + BATCH);
    let queries = chunk.map((p, i) => ({ i: start + i, q: { package: { name: p.name, ecosystem: 'PyPI' }, version: p.version } }));
    while (queries.length) {
      const { results } = await request(f, '/querybatch', { queries: queries.map(x => x.q) });
      const next = [];
      results.forEach((r, k) => {
        out[queries[k].i].push(...(r.vulns ?? []).map(v => v.id));
        if (r.next_page_token) next.push({ i: queries[k].i, q: { ...queries[k].q, page_token: r.next_page_token } });
      });
      queries = next;
    }
  }
  return out;
}

/** ID마다 상세. 같은 ID는 한 번만 받는다 */
async function details(f, ids) {
  const out = new Map();
  const todo = [...new Set(ids)];
  const worker = async () => {
    while (todo.length) {
      const id = todo.pop();
      out.set(id, await request(f, `/vulns/${encodeURIComponent(id)}`));
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return out;
}

const rank = id => (id.startsWith('GHSA-') ? 0 : id.startsWith('PYSEC-') ? 1 : 2);
const urlOf = id => (id.startsWith('GHSA-') ? `https://github.com/advisories/${id}` : `https://osv.dev/vulnerability/${id}`);

/** 한 패키지의 OSV 항목들을 aliases로 묶는다. 서로 가리키거나 같은 별칭(CVE 등)이 있으면 같은 취약점이다 */
function group(entries) {
  const groups = [];
  for (const v of entries) {
    const keys = new Set([v.id, ...(v.aliases ?? [])]);
    const hit = groups.filter(g => [...keys].some(k => g.keys.has(k)));
    const merged = { keys, items: [v] };
    for (const g of hit) {
      g.keys.forEach(k => merged.keys.add(k));
      merged.items.push(...g.items);
      groups.splice(groups.indexOf(g), 1);
    }
    groups.push(merged);
  }
  return groups;
}

/** 이 패키지에 대한 수정 버전 중 지금 버전보다 높은 가장 낮은 것 */
function fixedFor(items, name, version) {
  const fixed = items
    .flatMap(v => v.affected ?? [])
    .filter(a => a.package?.ecosystem === 'PyPI' && normName(a.package.name ?? '') === name)
    .flatMap(a => (a.ranges ?? []).flatMap(r => (r.events ?? []).map(e => e.fixed).filter(Boolean)))
    .filter(x => !versionAtLeast(version, x));
  return fixed.sort((a, b) => (versionAtLeast(a, b) ? 1 : -1))[0] ?? null;
}

/**
 * packages(readDeps의 packages)를 조회한다. f: fetch(시험에서 바꿔 넣는다).
 * onStatus: 진행 상황 문구를 받는다
 * @param {{name: string, version: string}[]} packages
 * @param {{f?: typeof fetch, onStatus?: (status: string) => void}} [options]
 */
export async function queryOsv(packages, { f = globalThis.fetch.bind(globalThis), onStatus = _status => {} } = {}) {
  onStatus(`패키지 ${packages.length}개 조회 중…`);
  const ids = await idsOf(f, packages);
  const all = ids.flat();
  if (!all.length) return [];
  onStatus(`취약점 ${new Set(all).size}건 상세 받는 중…`);
  const info = await details(f, all);
  const out = [];
  packages.forEach((p, i) => {
    const entries = ids[i].map(id => info.get(id)).filter(v => v && !v.withdrawn);
    if (!entries.length) return;
    const vulns = group(entries).map(({ keys, items }) => {
      const id = [...items.map(v => v.id)].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))[0];
      const main = items.find(v => v.id === id);
      return {
        id,
        ids: items.map(v => v.id).sort(),
        cves: [...keys].filter(k => k.startsWith('CVE-')).sort(),
        summary: main.summary ?? items.find(v => v.summary)?.summary ?? main.details?.split('\n')[0] ?? null,
        fixed: fixedFor(items, p.name, p.version),
        url: urlOf(id),
      };
    });
    out.push({ ...p, vulns: vulns.sort((a, b) => (a.id < b.id ? -1 : 1)) });
  });
  return out;
}
