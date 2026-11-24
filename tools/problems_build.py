"""문제 매트릭스 페이지(problems/**.mdx)를 problems/_data/*.csv에서 만든다.

python tools/problems_build.py [저장소 루트]

축은 가이드라인의 장(1~4), 셀은 원고(1.1~4.4), 상세는 원고의 소제목(서버가 수행하는 처리)이다.
소제목마다 공개 서버에서 관찰된 문제를 두고, 문제 화면에 해당 기능이 있는 서버와
문제가 관찰된 서버, 수정 전후 검증 실험(dfir-mcp-bench)을 싣는다.
근거의 강도와 시험 기록은 근거 대장에서 관리하며 여기에는 싣지 않는다.
만든 파일은 손으로 고치지 않는다. 데이터를 고친 뒤 이 스크립트를 다시 돌린다.
"""
import csv, json, os, re, shutil, sys, collections as C

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
    last = None  # 앞에 나온 파일. "a.py:1-2, 5, 9-10"처럼 쉼표 뒤 줄 범위도 그 파일로 링크한다(";"에서 끊는다)
    for p in pieces:
        m = re.fullmatch(r"((?:[\w.-]+/)*[\w.-]+\.\w+):(\d+)(?:-(\d+))?", p)
        if m:
            out.append(rep(m)); last = m.group(1); continue
        segs = re.split(r"(;)", p)
        for i, seg in enumerate(segs):
            if seg == ";":
                last = None; out.append(seg); continue
            if last:
                parts = re.split(r"((?<=,\s)\d+(?:-\d+)?(?=[,;)\s]|$))", seg)
                for q in parts:
                    n = re.fullmatch(r"(\d+)(?:-(\d+))?", q)
                    if n and q:
                        out.append(rep(re.fullmatch(r"(.+):(\d+)(?:-(\d+))?", f"{last}:{q}")))
                    else:
                        out.append(esc(q))
                if "(" in seg or ")" in seg:
                    last = None
            else:
                out.append(esc(seg))
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
listsplit = lambda s: [x.strip() for x in (s or "").split(";") if x.strip()]

def srv_link(s):
    return f"/problems/servers/{slug_srv(s)}"

# ---- 목차: 장 > 원고 > 소제목 > 문제 ----
# 문제 하나는 "소제목에 놓인 원래 묶음"이다. 문제ID(1.1-A1)는 원래 원고와 묶음이며, 한 묶음이 여러 소제목에 갈릴 수 있다.
heads_by_cell = C.defaultdict(list)
for h in heads:
    heads_by_cell[h["원고"]].append(h)
probs_by_sec = C.defaultdict(list)
for p in probs:
    probs_by_sec[p["소제목ID"]].append(p)
obs_by = C.defaultdict(list)
for o in obs:
    obs_by[(o["소제목ID"], o["문제ID"])].append(o)
exp_by = C.defaultdict(list)
for e in exps:
    exp_by[e["문제ID"]].append(e)
head_name = {h["소제목ID"]: h["소제목"] for h in heads}
places = C.defaultdict(list)  # 문제ID -> 놓인 소제목들
for p in probs:
    places[p["문제ID"]].append(p["소제목ID"])

def sec_dir(sec):
    return os.path.join(P, sec[0], sec[:3], sec)

def sec_link(sec):
    return f"/problems/{sec[0]}/{sec[:3]}/{sec}"

def prob_link(sec, pid):
    return f"{sec_link(sec)}/{pid}"

def short(t, n=28):
    return t[:n] + ("…" if len(t) > n else "")

# 첫 화면
lines = ["---", "title: 문제 매트릭스", "sidebar_position: 0", "hide_table_of_contents: true", "---", "", GEN, "",
         "import ProblemMatrix from '@site/src/components/Problems/ProblemMatrix';", "",
         "# 문제 매트릭스", "",
         "DFIR MCP 서버 구현 가이드라인의 원고마다, 공개 서버 21개에서 관찰된 문제를 소제목(서버가 수행하는 처리)별로 묶어 보여 준다.", "",
         "- 축은 가이드라인의 장, 셀은 원고(1.1~4.4), 상세는 원고의 소제목이다.",
         "- 소제목 아래에 문제를 두고, 문제 화면에서 그 기능이 있는 서버와 문제가 관찰된 서버를 확인한다. 문제 번호(1.1-A1)는 문제를 처음 정리한 원고와 묶음이다.",
         "- 사례는 기준 커밋의 코드로 확인한 것만 싣는다. 근거의 강도와 시험 기록은 근거 대장에서 관리하며 여기에는 싣지 않는다. 수정 전후 검증은 [dfir-mcp-bench](https://github.com/Trace2Bac/dfir-mcp-bench) 실험으로 잇는다.", "",
         "원고 칸을 누르면 오른쪽 패널에 그 원고의 소제목과 문제를 연다.", "", "<ProblemMatrix />", "",
         "<details>", "<summary>표로 보기</summary>", "",
         "| 장 | 원고 | 소제목 | 문제 | 관찰된 서버 |", "|---|---|---|---|---|"]
for ch in chapters:
    its = [c["원고"] for c in cells if c["장"] == ch["장"]]
    nh = sum(len(heads_by_cell[i]) for i in its)
    npb = sum(1 for p in probs if p["원고"] in its)
    nsv = len({o["서버"] for o in obs if o["원고"] in its})
    lines.append(f"| [{ch['장']} {ch['이름']}](/problems/{ch['장']}) | {len(its)} | {nh} | {npb} | {nsv} |")
lines += ["", "</details>", "", "서버별로 보려면 [서버 목록](/problems/servers)을 본다."]
write(os.path.join(P, "index.mdx"), "\n".join(lines))

# 장
for ch in chapters:
    its = [c["원고"] for c in cells if c["장"] == ch["장"]]
    lines = ["---", f"title: {yq(ch['장'] + ' ' + ch['이름'])}", f"sidebar_label: {yq(ch['장'] + ' ' + ch['이름'])}", f"sidebar_position: {int(ch['장'])}", "---", "", GEN, "",
             f"# {ch['장']} {ch['이름']}", ""]
    if ch.get("설명"):
        lines += [esc(ch["설명"]), ""]
    lines += ["| 원고 | 소제목 | 문제 | 관찰된 서버 |", "|---|---|---|---|"]
    for it in its:
        npb = sum(1 for p in probs if p["원고"] == it)
        nsv = len({o["서버"] for o in obs if o["원고"] == it})
        lines.append(f"| [{it} {cell_name[it]}](/problems/{it[0]}/{it}) | {len(heads_by_cell[it])} | {npb} | {nsv} |")
    write(os.path.join(P, ch["장"], "index.mdx"), "\n".join(lines))

# 원고, 소제목, 문제
cells_json = []
for c in cells:
    it = c["원고"]
    lines = ["---", f"title: {yq(it + ' ' + c['이름'])}", f"sidebar_label: {yq(it + ' ' + c['이름'])}",
             f"sidebar_position: {int(it.split('.')[1])}", "hide_table_of_contents: true", "---", "", GEN, "",
             "import ProblemCell from '@site/src/components/Problems/ProblemCell';", "",
             f"# {it} {c['이름']}", "", f'<ProblemCell id="{it}" />', "",
             "<details>", "<summary>목록으로 보기</summary>", ""]
    cjson = {"id": it, "name": c["이름"], "axis": it[0], "heads": []}
    for h in heads_by_cell[it]:
        sec = h["소제목ID"]
        ps = probs_by_sec[sec]
        hjson = {"id": sec, "name": h["소제목"], "desc": h["설명"], "problems": []}
        cjson["heads"].append(hjson)
        lines += [f"### [{sec} {h['소제목']}]({sec_link(sec)})", ""]
        # 소제목 화면
        sl = ["---", f"title: {yq(sec + ' ' + h['소제목'])}", f"sidebar_label: {yq(sec + ' ' + h['소제목'])}", f"sidebar_position: {int(h['순서'])}", "---", "", GEN, "",
              f"# {sec} {h['소제목']}", "", f"원고 [{it} {c['이름']}](/problems/{it[0]}/{it})", ""]
        if h["설명"]:
            sl += [esc(h["설명"]), ""]
        if not ps:
            lines += ["이 소제목에 놓인 문제가 없다.", ""]
            sl += ["이 소제목에 놓인 문제가 없다."]
            write(os.path.join(sec_dir(sec), "index.mdx"), "\n".join(sl))
            continue
        tbl = ["| 문제 | 해당 기능 서버 | 관찰된 서버 |", "|---|---|---|"]
        for order, p in enumerate(ps, 1):
            pid = p["문제ID"]
            den = listsplit(p["해당 기능 서버"]); ob = listsplit(p["관찰된 서버"])
            hjson["problems"].append({"key": f"{sec}/{pid}", "id": pid, "name": p["문제"], "den": len(den) if den else None, "obs": ob,
                                      "exps": [e["실험"] for e in exp_by.get(pid, [])], "path": prob_link(sec, pid).lstrip("/")})
            tbl.append(f"| [{pid} {esc(p['문제'])}]({prob_link(sec, pid)}) | {len(den) if den else '정하지 않음'} | {len(ob)} |")
            # 문제 화면
            pl = ["---", f"title: {yq(pid + ' ' + p['문제'])}", f"sidebar_label: {yq(pid + ' ' + short(p['문제']))}",
                  f"sidebar_position: {order}", "---", "", GEN, "", f"# {pid} {esc(p['문제'])}", "",
                  f"원고 [{it} {c['이름']}](/problems/{it[0]}/{it}) · 소제목 [{sec} {h['소제목']}]({sec_link(sec)})", ""]
            others = [s for s in places[pid] if s != sec]
            if others:
                pl += ["같은 묶음의 다른 사례는 " + ", ".join(f"[{s} {head_name[s]}]({prob_link(s, pid)})" for s in others) + "에 있다.", ""]
            if p["현상과 피해"]:
                pl += ["## 현상과 피해", "", esc(p["현상과 피해"]), ""]
            pl += [f"## 해당 기능이 있는 서버 ({len(den) if den else '정하지 않음'})", ""]
            if den:
                pl += [", ".join(f"[{s}]({srv_link(s)})" for s in den), ""]
            else:
                pl += ["이 문제가 생길 수 있는 서버(분모)는 아직 정하지 않았다.", ""]
            pl += [f"## 문제가 관찰된 서버 ({len(ob)})", ""]
            grouped = C.OrderedDict()
            for o in sorted(obs_by[(sec, pid)], key=lambda o: (o["서버"].lower(), o["사례ID"])):
                grouped.setdefault(o["서버"], []).append(o)
            for s, os_ in grouped.items():
                pl += [f"### [{s}]({srv_link(s)})", ""]
                for o in os_:
                    item = f"- {esc(o['요지'])}"
                    if o["코드위치"]:
                        item += f" 코드: {code_links(o['코드위치'], s, o['커밋'])}"
                    pl.append(item)
                pl.append("")
            ex = exp_by.get(pid, [])
            if ex:
                pl += ["## 검증 실험 (dfir-mcp-bench)", ""]
                for e in ex:
                    pl.append(f"- [{e['실험']}]({BENCH.format(commit=e['bench 커밋'], exp=e['실험'])}) {e['서버']}: {esc(e['내용'])}. 서버 변경: {esc(e['서버 변경'])}")
                pl.append("")
            write(os.path.join(sec_dir(sec), f"{pid}.mdx"), "\n".join(pl))
        lines += tbl + [""]
        sl += tbl
        write(os.path.join(sec_dir(sec), "index.mdx"), "\n".join(sl))
    lines += ["</details>"]
    cells_json.append(cjson)
    write(os.path.join(P, it[0], it, "index.mdx"), "\n".join(lines))

# 서버
lines = ["---", "title: 서버 목록", "sidebar_label: 서버 목록", "sidebar_position: 9", "---", "", GEN, "", "# 서버 목록", "",
         "| 서버 | 기준 커밋 | 문제가 관찰된 문제 | 원고 |", "|---|---|---|---|"]
for s in sorted(repo, key=str.lower):
    gs = {(o["소제목ID"], o["문제ID"]) for o in obs if o["서버"] == s}
    its = sorted({g[0][:3] for g in gs})
    r, cm = repo[s]
    lines.append(f"| [{s}]({srv_link(s)}) | [{cm[:7]}](https://github.com/{r}/tree/{cm}) | {len(gs)} | {', '.join(its)} |")
write(os.path.join(P, "servers", "index.mdx"), "\n".join(lines))
pname = {(p["소제목ID"], p["문제ID"]): p["문제"] for p in probs}
for s in sorted(repo, key=str.lower):
    r, cm = repo[s]
    sl = ["---", f"title: {yq(s)}", f"sidebar_label: {yq(s)}", "---", "", GEN, "", f"# {s}", "",
          f"저장소 [{r}](https://github.com/{r}), 기준 커밋 [{cm[:7]}](https://github.com/{r}/tree/{cm})", ""]
    mine = [o for o in obs if o["서버"] == s]
    if not mine:
        sl += ["관찰된 문제가 없다."]
    for c in cells:
        rows = [o for o in mine if o["원고"] == c["원고"]]
        if not rows:
            continue
        sl += [f"## {c['원고']} {c['이름']}", ""]
        for key in dict.fromkeys((o["소제목ID"], o["문제ID"]) for o in rows):
            n = sum(1 for o in rows if (o["소제목ID"], o["문제ID"]) == key)
            sec, pid = key
            sl.append(f"- {sec} {esc(head_name[sec])}: [{pid} {esc(pname[key])}]({prob_link(sec, pid)}) (사례 {n})")
        sl.append("")
    write(os.path.join(P, "servers", f"{slug_srv(s)}.mdx"), "\n".join(sl))

data = {"chapters": {ch["장"]: ch["이름"] for ch in chapters}, "cells": cells_json}
with open(os.path.join(DATA, "problems.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write("\n")
print("문제", len(probs), "소제목", len(heads), "서버", len(repo), "원고", len(cells))
