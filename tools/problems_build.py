"""문제 매트릭스 페이지(problems/**.mdx)를 problems/_data/*.csv에서 만든다.

python tools/problems_build.py [저장소 루트]

축은 가이드라인의 장(1~4), 셀은 원고(1.1~4.4), 상세는 원고의 구현방안 소제목(소제목ID 1.3.2)이다.
소제목마다 공개 서버에서 관찰된 문제(문제ID P0001)를 두고, 문제 화면에 해당 기능이 있는 서버와
문제가 관찰된 서버, 수정 전후 검증 실험(dfir-mcp-bench)을 싣는다.
근거의 강도와 시험 기록은 근거 대장에서 관리하며 여기에는 싣지 않는다.
만든 파일은 손으로 고치지 않는다. 데이터를 고친 뒤 이 스크립트를 다시 돌린다.
"""
import csv, json, os, re, shutil, sys, collections as C

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "problems")
DATA = os.path.join(P, "_data")
GEN = "{/* 이 파일은 tools/problems_build.py가 만든다. 손으로 고치지 않는다. */}"

def read(name):
    return list(csv.DictReader(open(os.path.join(DATA, name), encoding="utf-8")))

chapters = read("chapters.csv"); cells = read("cells.csv"); heads = read("headings.csv")
probs = read("problems.csv"); obs = read("observations.csv"); vers = read("verifications.csv"); servers = read("servers.csv")
# 분석 회차(스냅샷). 서버마다 첫 전체 분석의 커밋이 기준 커밋이고, 사례(observations)는 그 커밋에서 찾은 것이다.
# 뒤의 스냅샷에서 다시 본 결과는 checks.csv에 둔다. 전체 분석 스냅샷은 그때까지 관찰된 문제마다 결과가 있어야 하고,
# 일부 확인 스냅샷은 적힌 문제만 갱신한다. 같은 문제·서버는 가장 늦은 스냅샷의 결과가 현재 상태다
snapshots = read("snapshots.csv")
checks = read("checks.csv") if os.path.exists(os.path.join(DATA, "checks.csv")) else []
snaps_of = C.defaultdict(list)
for i, sn in enumerate(snapshots):
    snaps_of[sn["서버"]].append((sn["분석일"], i, sn))
for x in snaps_of:
    snaps_of[x] = [sn for _, _, sn in sorted(snaps_of[x], key=lambda t: t[:2])]
base = {}
for x, sns in snaps_of.items():
    full = [sn for sn in sns if sn["범위"] == "전체"]
    if not full:
        sys.exit(f"snapshots.csv: {x}에 전체 분석 스냅샷이 없다")
    base[x] = full[0]
repo = {s["서버"]: (s["저장소"], base[s["서버"]]["커밋"]) for s in servers if s["서버"] in base}
missing = [s["서버"] for s in servers if s["서버"] not in base]
if missing:
    sys.exit(f"snapshots.csv: 스냅샷이 없는 서버 {missing}")
snap_key = {(sn["서버"], sn["커밋"]): sn for sn in snapshots}
check_at = {}
for k in checks:
    sn = snap_key.get((k["서버"], k["커밋"]))
    if not sn:
        sys.exit(f"checks.csv: {k['문제ID']} {k['서버']} {k['커밋'][:7]}에 해당하는 스냅샷이 없다")
    check_at[(k["문제ID"], k["서버"], k["커밋"])] = {**k, "확인일": sn["분석일"], "범위": sn["범위"]}
observed_at = C.defaultdict(set)  # 서버 → 기준 커밋에서 관찰된 문제
for o in obs:
    observed_at[o["서버"]].add(o["문제ID"])
latest = {}
for x, sns in snaps_of.items():
    for sn in sns:
        if sn is base[x]:
            continue
        for pid in sorted(observed_at[x]):
            k = check_at.get((pid, x, sn["커밋"]))
            if k:
                latest[(pid, x)] = k
            elif sn["범위"] == "전체":
                sys.exit(f"checks.csv: 전체 분석 스냅샷 {x} {sn['커밋'][:7]}에 {pid}의 결과가 없다")

def ref_link(ref):
    """근거 글의 owner/repo#번호를 PR 링크로 바꾼다."""
    m = re.fullmatch(r"([\w.-]+/[\w.-]+)#(\d+)", (ref or "").strip())
    if m:
        return f"[#{m.group(2)}](https://github.com/{m.group(1)}/pull/{m.group(2)})"
    return f"[링크]({ref})" if (ref or "").startswith("http") else esc(ref)

def check_text(k):
    r, _ = repo.get(k["서버"], ("", ""))
    commit = f"[`{k['커밋'][:7]}`](https://github.com/{r}/tree/{k['커밋']})" if r else f"`{k['커밋'][:7]}`"
    cls = {"고쳐짐": "pm-fixed", "남아 있음": "pm-hit"}.get(k["결과"], "")
    out = f'<span className="pm-state {cls}">{k["결과"]}</span> {commit}'
    return out + (f" {ref_link(k['근거'])}" if k["근거"] else "") + f" ({k['확인일']})"

def esc(text):
    """코드 표기(`...`) 밖의 MDX 특수 글자를 이스케이프한다."""
    parts = re.split(r"(`[^`]*`)", text or "")
    out = []
    for p in parts:
        if p.startswith("`") and p.endswith("`") and len(p) > 1:
            out.append(p)
        else:
            out.append(p.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("<", "&lt;").replace(">", "&gt;"))
    return "".join(out)

def yq(s):
    return '"' + (s or "").replace("\\", "\\\\").replace('"', '\\"') + '"'

def code_links(loc, srv, commit):
    """코드 위치 문자열의 파일:줄 표기를 기준 커밋의 GitHub 링크로 바꾼다."""
    r, c = repo.get(srv, ("", ""))
    c = commit if commit and len(commit) >= 7 else c
    if not r or not loc:
        return esc(loc)
    def rep(m):
        path, a, b = m.group(1), m.group(2), m.group(3)
        anchor = f"#L{a}" + (f"-L{b}" if b else "")
        return f"[{path}:{a}{'-' + b if b else ''}](https://github.com/{r}/blob/{c}/{path}{anchor})"
    pieces = re.split(r"((?:[\w.-]+/)*[\w.-]+\.\w+:\d+(?:-\d+)?)", loc)
    out = []
    for p in pieces:
        m = re.fullmatch(r"((?:[\w.-]+/)*[\w.-]+\.\w+):(\d+)(?:-(\d+))?", p)
        out.append(rep(m) if m else esc(p))
    return "".join(out)

PATH_RE = re.compile(r"((?:[\w.-]+/)*[\w.-]+\.[A-Za-z0-9]+):")
RANGE_RE = re.compile(r"\s*(\d+)(?:\s*[-–]\s*(\d+))?")

def parse_locs(loc):
    """코드 위치 글('a.py:10-20, 30; b.py:5(설명)')을 파일·줄 범위 목록으로 푼다. 괄호 속 설명과 나머지 글은 버린다."""
    refs = []
    for m in PATH_RE.finditer(loc or ""):
        i = m.end()
        while True:
            r = RANGE_RE.match(loc, i)
            if not r:
                break
            a = int(r.group(1)); b = int(r.group(2) or a)
            if b < a:
                a, b = b, a
            refs.append({"path": m.group(1), "from": a, "to": b})
            i = r.end()
            if loc.startswith("(", i):  # 범위 뒤의 괄호 설명은 건너뛴다
                depth = 0
                while i < len(loc):
                    depth += {"(": 1, ")": -1}.get(loc[i], 0)
                    i += 1
                    if depth == 0:
                        break
            sep = re.match(r"\s*,\s*(?=\d)", loc[i:])
            if not sep:
                break
            i += sep.end()
    return refs

def slug_srv(s):
    return re.sub(r"[^A-Za-z0-9_-]", "-", s)

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text.rstrip("\n") + "\n")

# 만든 파일만 지우고 다시 만든다(_data는 남김)
for name in os.listdir(P):
    if name.startswith("_"):
        continue
    full = os.path.join(P, name)
    shutil.rmtree(full) if os.path.isdir(full) else os.remove(full)

cell_name = {c["원고"]: c["이름"] for c in cells}
by_cell_heads = C.defaultdict(list)
for h in heads:
    by_cell_heads[h["원고"]].append(h)
# 문제ID(P0001)는 소제목과 따로 매긴 식별자다. 문제는 소제목ID(1.3.2)로 소제목에, 소제목은 원고에 속한다
head_of = {h["소제목ID"]: h for h in heads}
prob = {p["문제ID"]: p for p in probs}
cell_of = {pid: head_of[p["소제목ID"]]["원고"] for pid, p in prob.items()}
probs_in = C.defaultdict(list)
for p in probs:
    probs_in[p["소제목ID"]].append(p["문제ID"])
obs_by = C.defaultdict(list)
for o in obs:
    obs_by[o["문제ID"]].append(o)
# 검증 방법(약한 것부터). 모든 사례는 코드 확인에서 시작하고, 실행한 검증은 verifications.csv에 쌓는다
METHODS = ["코드 확인", "PoC", "시험", "모델 실험"]
RESULTS = {"재현됨", "재현 안 됨", "통과", "실패", "영향 있음", "영향 없음"}
ver_by = C.defaultdict(list)
for v in vers:
    if v["방법"] not in METHODS or v["결과"] not in RESULTS or v["문제ID"] not in prob or v["서버"] not in repo:
        sys.exit(f"verifications.csv: 잘못된 줄 {v}")
    ver_by[(v["문제ID"], v["서버"])].append(v)

def methods_of(pid, x):
    """그 문제·서버에서 쓴 검증 방법. 관찰된 사례는 코드 확인을 기본으로 갖는다"""
    got = {v["방법"] for v in ver_by.get((pid, x), [])}
    if x in observed_at and pid in observed_at[x]:
        got.add("코드 확인")
    return [m for m in METHODS if m in got]

def ver_badges(pid, x):
    return " ".join(f'<span className="pm-v{" pm-v-run" if m != "코드 확인" else ""}">{m}</span>' for m in methods_of(pid, x))
listsplit = lambda s: [x.strip() for x in (s or "").split(";") if x.strip()]

def cell_dir(it):
    return os.path.join(P, it[0], it)

def prob_link(pid):
    it = cell_of[pid]
    return f"/problems/{it[0]}/{it}/{pid}"

def srv_link(s):
    return f"/problems/servers/{slug_srv(s)}"

# 첫 화면
lines = ["---", "title: 문제 매트릭스", "sidebar_position: 0", "hide_table_of_contents: true", "---", "", GEN, "",
         "import ProblemMatrix from '@site/src/components/Problems/ProblemMatrix';", "",
         "# 문제 매트릭스", "",
         "DFIR MCP 서버 구현 가이드라인의 원고마다, 공개 서버 21개에서 관찰된 문제를 구현방안 소제목별로 묶어 보여 준다.", "",
         "- 열은 가이드라인의 장, 칸은 원고(1.1~4.4), 칸 안의 줄은 소제목(1.3.2)이고, 네모 하나가 문제 하나(P0001)다. 색이 진할수록 그 문제가 관찰된 서버가 많다.",
         "- 서버 × 문제 지도는 [첫 화면](/)에 있다.",
         "- 문제 화면에서 그 기능이 있는 서버와 문제가 관찰된 서버, 서버별 사례를 확인한다.",
         "- 근거의 강도와 시험 기록은 근거 대장에서 관리하며 여기에는 싣지 않는다. 수정 전후 검증은 [dfir-mcp-bench](https://github.com/Trace2Bac/dfir-mcp-bench) 실험으로 잇는다.", "",
         "원고 이름을 누르면 오른쪽 패널에 그 원고를 열고, 문제나 칸을 누르면 그 문제를 연다.", "", "<ProblemMatrix />", "",
         "<details>", "<summary>표로 보기</summary>", "",
         "| 장 | 원고 | 소제목 | 문제 | 관찰된 서버 |", "|---|---|---|---|---|"]
for ch in chapters:
    its = [c["원고"] for c in cells if c["장"] == ch["장"]]
    nh = sum(len(by_cell_heads[i]) for i in its)
    npb = sum(1 for p in probs if cell_of[p["문제ID"]] in its)
    nsv = len({o["서버"] for o in obs if cell_of[o["문제ID"]] in its})
    lines.append(f"| [{ch['장']} {ch['이름']}](/problems/{ch['장']}) | {len(its)} | {nh} | {npb} | {nsv} |")
lines += ["", "</details>", "", f"서버별로 보려면 [서버 목록](/problems/servers)을 본다."]
write(os.path.join(P, "index.mdx"), "\n".join(lines))

# 축(장)
for ch in chapters:
    its = [c["원고"] for c in cells if c["장"] == ch["장"]]
    lines = ["---", f"title: {yq(ch['장'] + ' ' + ch['이름'])}", f"sidebar_label: {yq(ch['장'] + ' ' + ch['이름'])}", f"sidebar_position: {int(ch['장'])}", "---", "", GEN, "",
             f"# {ch['장']} {ch['이름']}", "", "| 원고 | 소제목 | 문제 | 관찰된 서버 |", "|---|---|---|---|"]
    for it in its:
        npb = sum(1 for p in probs if cell_of[p["문제ID"]] == it)
        nsv = len({o["서버"] for o in obs if cell_of[o["문제ID"]] == it})
        lines.append(f"| [{it} {cell_name[it]}](/problems/{it[0]}/{it}) | {len(by_cell_heads[it])} | {npb} | {nsv} |")
    write(os.path.join(P, ch["장"], "index.mdx"), "\n".join(lines))

# 셀(원고)과 문제
cells_json = []
for c in cells:
    it = c["원고"]
    lines = ["---", f"title: {yq(it + ' ' + c['이름'])}", f"sidebar_label: {yq(it + ' ' + c['이름'])}",
             f"sidebar_position: {int(it.split('.')[1])}", "hide_table_of_contents: true", "---", "", GEN, "",
             "import ProblemCell from '@site/src/components/Problems/ProblemCell';", "",
             f"# {it} {c['이름']}", "", f'<ProblemCell id="{it}" />', "",
             "<details>", "<summary>목록으로 보기</summary>", ""]
    order = 0
    cjson = {"id": it, "name": c["이름"], "axis": it[0], "heads": []}
    for h in by_cell_heads[it]:
        ids = probs_in[h["소제목ID"]]
        hjson = {"id": h["소제목ID"], "name": h["소제목"], "problems": []}
        cjson["heads"].append(hjson)
        lines += [f"### {h['소제목ID']} {h['소제목']}", ""]
        if not ids:
            lines += ["이 소제목에 묶은 문제가 없다.", ""]
            continue
        lines += ["| 문제 | 해당 기능 서버 | 관찰된 서버 |", "|---|---|---|"]
        for gid in ids:
            p = prob[gid]
            den = listsplit(p["해당 기능 서버"]); ob = listsplit(p["관찰된 서버"])
            hjson["problems"].append({"id": gid, "name": p["문제"], "den": len(den) if den else None, "denList": den, "obs": ob,
                                      "ver": {x: methods_of(gid, x) for x in ob},
                                      "checks": {x: {"result": k["결과"], "commit": k["커밋"][:7], "date": k["확인일"], "ref": k["근거"]}
                                                 for (q, x), k in latest.items() if q == gid}})
            lines.append(f"| [{gid} {esc(p['문제'])}]({prob_link(gid)}) | {len(den) if den else '정하지 않음'} | {len(ob)} |")
            order += 1
            # 문제 화면
            pl = ["---", f"title: {yq(gid + ' ' + p['문제'])}", f"sidebar_label: {yq(gid + ' ' + p['문제'][:28] + ('…' if len(p['문제']) > 28 else ''))}",
                  f"sidebar_position: {order}", "---", "", GEN, "", "import Case from '@site/src/components/Problems/Case';", "",
                  f"# {gid} {esc(p['문제'])}", "",
                  f"원고 [{it} {c['이름']}](/problems/{it[0]}/{it}) · 소제목 {h['소제목ID']} 「{h['소제목']}」", ""]
            if p["현상과 피해"]:
                pl += ["## 현상과 피해", "", esc(p["현상과 피해"]), ""]
            grouped = C.OrderedDict()
            for o in sorted(obs_by[gid], key=lambda o: (o["서버"].lower(), o["사례ID"])):
                grouped.setdefault(o["서버"], []).append(o)
            rows = list(grouped) + sorted((x for x in den if x not in grouped), key=str.lower)
            pl += [f"## 서버별 상태", "",
                   f"문제가 관찰된 서버 {len(ob)}개, 해당 기능이 있는 서버 {len(den) if den else '정하지 않음'}"
                   + ("" if den else " (기능이 있는 서버는 아직 정하지 않았다)") + ".", "",
                   "| 서버 | 기준 커밋에서 | 검증 | 사례 | 기준 커밋 | 최신 확인 |", "|---|---|---|---|---|---|"]
            for x in rows:
                r, cm = repo.get(x, ("", ""))
                n = len(grouped.get(x, []))
                state = '<span className="pm-state pm-hit">관찰됨</span>' if n else '<span className="pm-state">관찰되지 않음</span>'
                cases = f"[{n}건](#case-{slug_srv(x).lower()})" if n else ""
                commit = f"[`{cm[:7]}`](https://github.com/{r}/tree/{cm})" if r else ""
                k = latest.get((gid, x))
                pl.append(f"| [{x}]({srv_link(x)}) | {state} | {ver_badges(gid, x) if n else ''} | {cases} | {commit} | {check_text(k) if k else ''} |")
            pl += ["", "## 서버별 사례", "", "사례의 코드를 누르면 기준 커밋의 해당 줄을 펼쳐 볼 수 있다.", ""]
            for x, os_ in grouped.items():
                r, cm = repo.get(x, ("", ""))
                pl += [f'<a id="case-{slug_srv(x).lower()}"></a>', "", f"### [{x}]({srv_link(x)})", ""]
                for k, o in enumerate(os_, 1):
                    refs = parse_locs(o["코드위치"])
                    commit = o["커밋"] if o["커밋"] and len(o["커밋"]) >= 7 else cm
                    raw = "" if refs or not o["코드위치"] else o["코드위치"]
                    pl += [f"<Case n={{{k}}} repo={json.dumps(o['저장소'] or r)} commit={json.dumps(commit)} refs={{{json.dumps(refs, ensure_ascii=False)}}} raw={{{json.dumps(raw, ensure_ascii=False)}}}>",
                           "", esc(o["요지"]), "", "</Case>", ""]
            vs = [v for x in grouped for v in ver_by.get((gid, x), [])]
            if vs:
                pl += ["## 실행 검증", "", "코드 확인 밖에 실행으로 확인한 기록이다. 방법은 PoC, 시험, 모델 실험이고, 수준은 함수 직접 호출, MCP 연결, 에이전트(모델 포함)다.", "",
                       "| 서버 | 방법 | 수준 | 커밋 | 결과 | 근거 | 메모 |", "|---|---|---|---|---|---|---|"]
                for v in vs:
                    r, cm = repo[v["서버"]]
                    vc = v["커밋"] or cm
                    link = f"[{'PR #' + v['근거'].rsplit('/', 1)[1] if '/pull/' in v['근거'] else v['근거'].rstrip('/').rsplit('/', 1)[1]}]({v['근거']})" if v["근거"].startswith("http") else esc(v["근거"])
                    pl.append(f"| {v['서버']} | {v['방법']} | {v['수준']} | [`{vc[:7]}`](https://github.com/{r}/tree/{vc}) | {v['결과']} | {link} | {esc(v['메모'])} |")
                pl.append("")
            write(os.path.join(cell_dir(it), f"{gid}.mdx"), "\n".join(pl))
        lines.append("")
    lines += ["</details>"]
    cells_json.append(cjson)
    write(os.path.join(cell_dir(it), "index.mdx"), "\n".join(lines))

# 서버
lines = ["---", "title: 서버 목록", "sidebar_label: 서버 목록", "sidebar_position: 9", "---", "", GEN, "", "# 서버 목록", "",
         "기준 커밋은 그 서버를 처음 전체 분석한 커밋이고, 관찰된 문제는 그 커밋에서 찾은 것이다. 최근 분석은 그 뒤에 다시 확인한 가장 늦은 스냅샷이다.", "",
         "| 서버 | 기준 커밋 | 최근 분석 | 관찰된 문제 | 고쳐짐 | 원고 |", "|---|---|---|---|---|---|"]
for s in sorted(repo, key=str.lower):
    gs = {o["문제ID"] for o in obs if o["서버"] == s}
    its = sorted({cell_of[g] for g in gs})
    r, cm = repo[s]
    last = snaps_of[s][-1]
    recent = "" if last is base[s] else f"[`{last['커밋'][:7]}`](https://github.com/{r}/tree/{last['커밋']}) {last['분석일']} ({last['범위']})"
    nfix = sum(1 for (g, x), k in latest.items() if x == s and k["결과"] == "고쳐짐")
    lines.append(f"| [{s}]({srv_link(s)}) | [`{cm[:7]}`](https://github.com/{r}/tree/{cm}) | {recent} | {len(gs)} | {nfix or ''} | {', '.join(its)} |")
write(os.path.join(P, "servers", "index.mdx"), "\n".join(lines))
for s in sorted(repo, key=str.lower):
    r, cm = repo[s]
    sl = ["---", f"title: {yq(s)}", f"sidebar_label: {yq(s)}", "---", "", GEN, "", f"# {s}", "",
          f"저장소 [{r}](https://github.com/{r}), 기준 커밋 [{cm[:7]}](https://github.com/{r}/tree/{cm})", "",
          "## 분석 기록", "", "| 커밋 | 분석일 | 범위 | 결과 | 메모 |", "|---|---|---|---|---|"]
    for sn in snaps_of[s]:
        if sn is base[s]:
            res = f"관찰된 문제 {len(observed_at[s])}"
        else:
            got = C.Counter(k["결과"] for (g, x, c), k in check_at.items() if x == s and c == sn["커밋"])
            res = ", ".join(f"{k} {v}" for k, v in got.items())
        sl.append(f"| [`{sn['커밋'][:7]}`](https://github.com/{r}/tree/{sn['커밋']}) | {sn['분석일']} | {sn['범위']} | {res} | {esc(sn['메모'])} |")
    sl.append("")
    mine = [o for o in obs if o["서버"] == s]
    by_it = C.OrderedDict()
    for c in cells:
        rows = [o for o in mine if cell_of[o["문제ID"]] == c["원고"]]
        if rows:
            by_it[c["원고"]] = rows
    if not by_it:
        sl += ["관찰된 문제가 없다."]
    else:
        sl += ["## 관찰된 문제", ""]
    for it, rows in by_it.items():
        sl += [f"### {it} {cell_name[it]}", ""]
        gids = sorted(dict.fromkeys(o["문제ID"] for o in rows))
        for gid in gids:
            n = sum(1 for o in rows if o["문제ID"] == gid)
            k = latest.get((gid, s))
            tail = f" · 최신 확인 {k['결과']} `{k['커밋'][:7]}`" + (f" {ref_link(k['근거'])}" if k["근거"] else "") if k else ""
            sl.append(f"- [{gid} {esc(prob[gid]['문제'])}]({prob_link(gid)}) (사례 {n}){tail}")
        sl.append("")
    write(os.path.join(P, "servers", f"{slug_srv(s)}.mdx"), "\n".join(sl))

data = {"chapters": {ch["장"]: ch["이름"] for ch in chapters}, "servers": sorted(repo, key=str.lower), "cells": cells_json}
with open(os.path.join(DATA, "problems.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write("\n")
print("문제", len(probs), "서버", len(repo), "셀", len(cells))
