"""문제 매트릭스 페이지(problems/**.mdx)를 problems/_data/*.csv에서 만든다.

python tools/problems_build.py [저장소 루트]

축은 가이드라인의 장(1~4), 셀은 원고(1.1~4.4), 상세는 원고의 구현방안 소제목이다.
상세마다 공개 서버에서 관찰된 문제 묶음을 두고, 문제 화면에 해당 기능이 있는 서버와
문제가 관찰된 서버, 수정 전후 검증 실험(dfir-mcp-bench)을 싣는다.
근거의 강도와 시험 기록은 근거 대장에서 관리하며 여기에는 싣지 않는다.
만든 파일은 손으로 고치지 않는다. 데이터를 고친 뒤 이 스크립트를 다시 돌린다.
"""
import csv, os, re, shutil, sys, collections as C

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "problems")
DATA = os.path.join(P, "_data")
BENCH = "https://github.com/Trace2Bac/dfir-mcp-bench/tree/{commit}/experiments/{exp}"
GEN = "{/* 이 파일은 tools/problems_build.py가 만든다. 손으로 고치지 않는다. */}"

def read(name):
    return list(csv.DictReader(open(os.path.join(DATA, name), encoding="utf-8")))

chapters = read("chapters.csv"); cells = read("cells.csv"); heads = read("headings.csv")
probs = read("problems.csv"); obs = read("observations.csv"); exps = read("experiments.csv"); servers = read("servers.csv")
repo = {s["서버"]: (s["저장소"], s["커밋"]) for s in servers}

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
prob = {(p["원고"], p["묶음ID"]): p for p in probs}
obs_by = C.defaultdict(list)
for o in obs:
    obs_by[(o["원고"], o["묶음ID"])].append(o)
exp_by = C.defaultdict(list)
for e in exps:
    exp_by[(e["원고"], e["묶음ID"])].append(e)
listsplit = lambda s: [x.strip() for x in (s or "").split(";") if x.strip()]

def cell_dir(it):
    return os.path.join(P, it[0], it)

def prob_link(it, gid, base="/problems"):
    return f"{base}/{it[0]}/{it}/{gid}"

def srv_link(s):
    return f"/problems/servers/{slug_srv(s)}"

# 첫 화면
lines = ["---", "title: 문제 매트릭스", "sidebar_position: 0", "---", "", GEN, "",
         "# 문제 매트릭스", "",
         "DFIR MCP 서버 구현 가이드라인의 원고마다, 공개 서버 21개에서 관찰된 문제를 구현방안 소제목별로 묶어 보여 준다.", "",
         "- 축은 가이드라인의 장, 셀은 원고(1.1~4.4), 상세는 원고의 구현방안 소제목이다.",
         "- 상세 아래에 문제 묶음을 두고, 문제 화면에서 그 기능이 있는 서버와 문제가 관찰된 서버를 확인한다.",
         "- 근거의 강도와 시험 기록은 근거 대장에서 관리하며 여기에는 싣지 않는다. 수정 전후 검증은 [dfir-mcp-bench](https://github.com/Trace2Bac/dfir-mcp-bench) 실험으로 잇는다.", "",
         "| 장 | 원고 | 소제목 | 문제 | 관찰된 서버 |", "|---|---|---|---|---|"]
for ch in chapters:
    its = [c["원고"] for c in cells if c["장"] == ch["장"]]
    nh = sum(len(by_cell_heads[i]) for i in its)
    npb = sum(1 for p in probs if p["원고"] in its)
    nsv = len({o["서버"] for o in obs if o["원고"] in its})
    lines.append(f"| [{ch['장']} {ch['이름']}](/problems/{ch['장']}) | {len(its)} | {nh} | {npb} | {nsv} |")
lines += ["", f"서버별로 보려면 [서버 목록](/problems/servers)을 본다."]
write(os.path.join(P, "index.mdx"), "\n".join(lines))

# 축(장)
for ch in chapters:
    its = [c["원고"] for c in cells if c["장"] == ch["장"]]
    lines = ["---", f"title: {yq(ch['장'] + ' ' + ch['이름'])}", f"sidebar_label: {yq(ch['장'] + ' ' + ch['이름'])}", f"sidebar_position: {int(ch['장'])}", "---", "", GEN, "",
             f"# {ch['장']} {ch['이름']}", "", "| 원고 | 소제목 | 문제 | 관찰된 서버 |", "|---|---|---|---|"]
    for it in its:
        npb = sum(1 for p in probs if p["원고"] == it)
        nsv = len({o["서버"] for o in obs if o["원고"] == it})
        lines.append(f"| [{it} {cell_name[it]}](/problems/{it[0]}/{it}) | {len(by_cell_heads[it])} | {npb} | {nsv} |")
    write(os.path.join(P, ch["장"], "index.mdx"), "\n".join(lines))

# 셀(원고)과 문제
for c in cells:
    it = c["원고"]
    lines = ["---", f"title: {yq(it + ' ' + c['이름'])}", f"sidebar_label: {yq(it + ' ' + c['이름'])}",
             f"sidebar_position: {int(it.split('.')[1])}", "---", "", GEN, "", f"# {it} {c['이름']}", ""]
    order = 0
    for h in by_cell_heads[it]:
        ids = [g for g in h["묶음"].split() if (it, g) in prob]
        lines += [f"## {h['소제목']}", ""]
        if not ids:
            lines += ["이 소제목에 묶은 문제가 없다.", ""]
            continue
        lines += ["| 문제 | 해당 기능 서버 | 관찰된 서버 |", "|---|---|---|"]
        for gid in ids:
            p = prob[(it, gid)]
            den = listsplit(p["해당 기능 서버"]); ob = listsplit(p["관찰된 서버"])
            lines.append(f"| [{gid} {esc(p['문제'])}](/problems/{it[0]}/{it}/{gid}) | {len(den) if den else '정하지 않음'} | {len(ob)} |")
            order += 1
            # 문제 화면
            pl = ["---", f"title: {yq(gid + ' ' + p['문제'])}", f"sidebar_label: {yq(gid + ' ' + p['문제'][:28] + ('…' if len(p['문제']) > 28 else ''))}",
                  f"sidebar_position: {order}", "---", "", GEN, "", f"# {gid} {esc(p['문제'])}", "",
                  f"원고 [{it} {c['이름']}](/problems/{it[0]}/{it}) · 소제목 「{h['소제목']}」", ""]
            if p["현상과 피해"]:
                pl += ["## 현상과 피해", "", esc(p["현상과 피해"]), ""]
            pl += [f"## 해당 기능이 있는 서버 ({len(den) if den else '정하지 않음'})", ""]
            if den:
                pl += [", ".join(f"[{s}]({srv_link(s)})" for s in den), ""]
            else:
                pl += ["이 문제가 생길 수 있는 서버(분모)는 아직 정하지 않았다.", ""]
            pl += [f"## 문제가 관찰된 서버 ({len(ob)})", ""]
            grouped = C.OrderedDict()
            for o in sorted(obs_by[(it, gid)], key=lambda o: (o["서버"].lower(), o["사례ID"])):
                grouped.setdefault(o["서버"], []).append(o)
            for s, os_ in grouped.items():
                r, cm = repo.get(s, ("", ""))
                head = f"### [{s}]({srv_link(s)})"
                pl += [head, ""]
                for o in os_:
                    item = f"- {esc(o['요지'])}"
                    if o["코드위치"]:
                        item += f" 코드: {code_links(o['코드위치'], s, o['커밋'])}"
                    pl.append(item)
                pl.append("")
            ex = exp_by.get((it, gid), [])
            if ex:
                pl += ["## 검증 실험 (dfir-mcp-bench)", ""]
                for e in ex:
                    pl.append(f"- [{e['실험']}]({BENCH.format(commit=e['bench 커밋'], exp=e['실험'])}) {e['서버']}: {esc(e['내용'])}. 서버 변경: {esc(e['서버 변경'])}")
                pl.append("")
            write(os.path.join(cell_dir(it), f"{gid}.mdx"), "\n".join(pl))
        lines.append("")
    write(os.path.join(cell_dir(it), "index.mdx"), "\n".join(lines))

# 서버
lines = ["---", "title: 서버 목록", "sidebar_label: 서버 목록", "sidebar_position: 9", "---", "", GEN, "", "# 서버 목록", "",
         "| 서버 | 기준 커밋 | 문제가 관찰된 묶음 | 원고 |", "|---|---|---|---|"]
for s in sorted(repo, key=str.lower):
    gs = {(o["원고"], o["묶음ID"]) for o in obs if o["서버"] == s}
    its = sorted({g[0] for g in gs})
    r, cm = repo[s]
    lines.append(f"| [{s}]({srv_link(s)}) | [{cm[:7]}](https://github.com/{r}/tree/{cm}) | {len(gs)} | {', '.join(its)} |")
write(os.path.join(P, "servers", "index.mdx"), "\n".join(lines))
for s in sorted(repo, key=str.lower):
    r, cm = repo[s]
    sl = ["---", f"title: {yq(s)}", f"sidebar_label: {yq(s)}", "---", "", GEN, "", f"# {s}", "",
          f"저장소 [{r}](https://github.com/{r}), 기준 커밋 [{cm[:7]}](https://github.com/{r}/tree/{cm})", ""]
    mine = [o for o in obs if o["서버"] == s]
    by_it = C.OrderedDict()
    for c in cells:
        rows = [o for o in mine if o["원고"] == c["원고"]]
        if rows:
            by_it[c["원고"]] = rows
    if not by_it:
        sl += ["관찰된 문제가 없다."]
    for it, rows in by_it.items():
        sl += [f"## {it} {cell_name[it]}", ""]
        gids = list(dict.fromkeys(o["묶음ID"] for o in rows))
        for gid in gids:
            n = sum(1 for o in rows if o["묶음ID"] == gid)
            sl.append(f"- [{gid} {esc(prob[(it, gid)]['문제'])}](/problems/{it[0]}/{it}/{gid}) (사례 {n})")
        sl.append("")
    write(os.path.join(P, "servers", f"{slug_srv(s)}.mdx"), "\n".join(sl))

print("문제", len(probs), "서버", len(repo), "셀", len(cells))
