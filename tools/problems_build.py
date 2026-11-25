"""문제 매트릭스 페이지(problems/**.mdx)를 problems/_data/*.csv에서 만든다.

python tools/problems_build.py [저장소 루트]

장(1~4) → 항목(1.1~4.4) → 소제목(1.3.2) → 문제(P0001) 차례로 놓고, 문제 화면에 서버별 판정과
근거 코드, 실행 검증을 싣는다. 판정은 분석 회차(snapshots.csv)마다 근거(findings.csv)로 정한다.
만든 파일은 손으로 고치지 않는다. 데이터를 고친 뒤 이 스크립트를 다시 돌린다.
"""
import csv, json, os, re, shutil, sys, collections as C

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "problems")
DATA = os.path.join(P, "_data")
GEN = "{/* 이 파일은 tools/problems_build.py가 만든다. 손으로 고치지 않는다. */}"

def read(name):
    return list(csv.DictReader(open(os.path.join(DATA, name), encoding="utf-8")))

# 1·3장은 근거 대장에서 내보낸 headings·problems·findings.csv를 쓰고, 2·4장은 ch2/·ch4/에서 직접 관리한다(정의·판정 기준·CWE·ASTM 칸이 더 있다).
# 폴더가 있는 장은 위의 공용 파일에 그 장 줄이 있어도(내보내기가 다시 쓴 경우) 폴더 쪽만 쓴다
CH = sorted(d for d in os.listdir(DATA) if re.fullmatch(r"ch\d+", d))
own = {d[2:] for d in CH}
chap_of = lambda hid: hid.split(".")[0]
def read_ch(name):
    return [r for d in CH for r in read(os.path.join(d, name))]
chapters = read("chapters.csv"); cells = read("cells.csv")
heads = [h for h in read("headings.csv") if chap_of(h["소제목ID"]) not in own] + read_ch("headings.csv")
probs = [p for p in read("problems.csv") if chap_of(p["소제목ID"]) not in own] + read_ch("problems.csv")
shared_ids = {p["문제ID"] for p in probs if chap_of(p["소제목ID"]) not in own}
finds = [f for f in read("findings.csv") if f["문제ID"] in shared_ids] + read_ch("findings.csv")
vers = read("verifications.csv"); servers = read("servers.csv")
# 폴더로 관리하는 장(2·4장)은 문제가 관찰된 사례만 근거로 둔다. 근거가 없는 서버는 "관찰되지 않음"이다(기능 유무를 따지지 않는다)
obs_only = {p["문제ID"] for p in read_ch("problems.csv")}
snapshots = read("snapshots.csv")

head_of = {h["소제목ID"]: h for h in heads}
prob = {p["문제ID"]: p for p in probs}
cell_of = {pid: head_of[p["소제목ID"]]["원고"] for pid, p in prob.items()}

# 분석 회차(스냅샷)는 서버의 한 커밋에서 확인한 범위다. 범위는 '전체', 항목(1.3), 문제(P0025)를 공백으로 나열하고
# 앞에 '-'를 붙이면 뺀다. 서버마다 커밋일 차례로 놓고, 첫 '전체' 스냅샷의 커밋이 기준 커밋이다
def scope_of(text):
    got = set()
    for tok in (text or "").split():
        neg = tok.startswith("-")
        t = tok.lstrip("-")
        ids = set(prob) if t == "전체" else {pid for pid in prob if cell_of[pid] == t} if t in {c["원고"] for c in cells} else {t}
        if not ids <= set(prob):
            sys.exit(f"snapshots.csv: 범위의 {t}를 모른다")
        got = got - ids if neg else got | ids
    return got

snaps_of = C.defaultdict(list)
for i, sn in enumerate(snapshots):
    sn["covers"] = scope_of(sn["범위"])
    snaps_of[sn["서버"]].append((sn["커밋일"], i, sn))
for x in snaps_of:
    snaps_of[x] = [sn for _, _, sn in sorted(snaps_of[x], key=lambda t: t[:2])]
base = {}
for x, sns in snaps_of.items():
    full = [sn for sn in sns if "전체" in sn["범위"].split()]
    if not full:
        sys.exit(f"snapshots.csv: {x}에 전체 분석 스냅샷이 없다")
    base[x] = full[0]
missing = [s["서버"] for s in servers if s["서버"] not in base]
if missing:
    sys.exit(f"snapshots.csv: 스냅샷이 없는 서버 {missing}")
repo = {s["서버"]: (s["저장소"], base[s["서버"]]["커밋"]) for s in servers}
snap_key = {(sn["서버"], sn["커밋"]): sn for sn in snapshots}

# 근거(findings.csv) 한 줄은 한 커밋에서 본 근거 하나다. 판정은 관찰됨이나 문제 없음만 적고,
# 스냅샷 범위 안에서 줄이 없는 문제는 기능 없음, 범위 밖은 확인 안 함으로 계산한다
rows_at = C.defaultdict(list)
for f in finds:
    sn = snap_key.get((f["서버"], f["커밋"]))
    if not sn:
        sys.exit(f"findings.csv: {f['서버']} {f['커밋'][:7]}에 해당하는 스냅샷이 없다")
    if f["문제ID"] not in prob or f["판정"] not in ("관찰됨", "문제 없음"):
        sys.exit(f"findings.csv: 잘못된 줄 {f['서버']} {f['문제ID']} {f['판정']}")
    if f["문제ID"] not in sn["covers"]:
        sys.exit(f"findings.csv: {f['문제ID']}는 {f['서버']} {f['커밋'][:7]} 스냅샷의 범위 밖이다")
    rows_at[(f["서버"], f["커밋"], f["문제ID"])].append(f)
for k, rs in rows_at.items():
    if len({r["판정"] for r in rs}) > 1:
        sys.exit(f"findings.csv: {k[0]} {k[1][:7]} {k[2]}에 판정이 둘이다")

# (문제, 서버)마다 스냅샷 차례의 판정 이력. 마지막 줄이 마지막으로 확인한 판정이고, 이력이 없으면 확인 안 함이다
history = {}
for x, sns in snaps_of.items():
    for pid in prob:
        h = []
        for sn in sns:
            if pid not in sn["covers"]:
                continue
            rs = rows_at.get((x, sn["커밋"], pid), [])
            state = rs[0]["판정"] if rs else "기능 없음"
            h.append({"snap": sn, "state": state, "est": bool(rs) and all(r["추정"] for r in rs), "rows": rs})
        history[(pid, x)] = h

def status(pid, x):
    """마지막 판정, 마지막 확인 스냅샷, 추정 여부. 서버마다 한 시점(기준 커밋)만 다루므로 회차 사이의 변화는 계산하지 않는다"""
    h = history[(pid, x)]
    if not h:
        return {"state": "확인 안 함", "snap": None, "est": False}
    last = h[-1]
    return {"state": last["state"], "snap": last["snap"], "est": last["est"]}

ST = {(pid, x): status(pid, x) for pid in prob for x in repo}
evidence = C.defaultdict(list)  # 문제 → 근거 줄(코드 위치가 없는 추정 줄 제외)
for f in finds:
    if not f["추정"] or f["코드위치"].strip():
        evidence[f["문제ID"]].append(f)

def ref_link(ref):
    """근거 글의 owner/repo#번호를 PR 링크로 바꾼다."""
    m = re.fullmatch(r"([\w.-]+/[\w.-]+)#(\d+)", (ref or "").strip())
    if m:
        return f"[#{m.group(2)}](https://github.com/{m.group(1)}/pull/{m.group(2)})"
    return f"[링크]({ref})" if (ref or "").startswith("http") else esc(ref)

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
# 문제ID(P0001)는 소제목과 따로 매긴 식별자다. 문제는 소제목ID(1.3.2)로 소제목에, 소제목은 항목에 속한다
probs_in = C.defaultdict(list)
for p in probs:
    probs_in[p["소제목ID"]].append(p["문제ID"])
# 검증 방법(약한 것부터). 모든 사례는 코드 확인에서 시작하고, 실행한 검증은 verifications.csv에 쌓는다
METHODS = ["코드 확인", "PoC", "시험", "모델 실험"]
RESULTS = {"재현됨", "재현 안 됨", "통과", "실패", "영향 있음", "영향 없음"}
ver_by = C.defaultdict(list)
for v in vers:
    if v["방법"] not in METHODS or v["결과"] not in RESULTS or v["문제ID"] not in prob or v["서버"] not in repo:
        sys.exit(f"verifications.csv: 잘못된 줄 {v}")
    ver_by[(v["문제ID"], v["서버"])].append(v)

def methods_of(pid, x):
    """그 문제·서버에서 쓴 검증 방법. 코드 위치가 있는 근거는 코드 확인이다"""
    got = {v["방법"] for v in ver_by.get((pid, x), [])}
    if any(f["서버"] == x and f["코드위치"] for f in evidence[pid]):
        got.add("코드 확인")
    return [m for m in METHODS if m in got]

def ver_badges(pid, x):
    return " ".join(f'<span className="pm-v{" pm-v-run" if m != "코드 확인" else ""}">{m}</span>' for m in methods_of(pid, x))

def cell_dir(it):
    return os.path.join(P, it[0], it)

def prob_link(pid):
    it = cell_of[pid]
    return f"/problems/{it[0]}/{it}/{pid}"

def srv_link(s):
    return f"/problems/servers/{slug_srv(s)}"

def applies(pid):
    """그 기능이 있는 서버(마지막 판정이 관찰됨이나 문제 없음)와 확인 안 한 서버"""
    on = [x for x in repo if ST[(pid, x)]["state"] in ("관찰됨", "문제 없음")]
    unk = [x for x in repo if ST[(pid, x)]["state"] == "확인 안 함"]
    return on, unk

def observed(pid):
    return [x for x in repo if ST[(pid, x)]["state"] == "관찰됨"]

def commit_link(x, sn):
    r, _ = repo[x]
    return f"[`{sn['커밋'][:7]}`](https://github.com/{r}/tree/{sn['커밋']})"

BADGE = {"관찰됨": "pm-hit", "문제 없음": "pm-ok", "확인 안 함": "pm-unk", "기능 없음": ""}

def badge(st):
    out = f'<span className="pm-state {BADGE[st["state"]]}">{st["state"]}</span>'
    if st["est"]:
        out += ' <span className="pm-note">추정</span>'
    return out

NOTE = "모든 판정은 적힌 커밋 기준이며, 서버의 현재 버전과 다를 수 있다."

# 원인(CWE)과 결과(ASTM E3016-18 오류 범주). 2·4장 문제의 CWE·ASTM 칸에서 읽는다
ASTM = {  # 범주: (짧은 이름, 설명)
    "INCOMP": ("불완전", "있어야 할 결과가 빠짐 (Incompleteness)"),
    "INAC_EX": ("없는 것을 있다고 함", "증거에 없는 항목이 결과에 나옴 (Inaccuracy: Existence)"),
    "INAC_ALT": ("내용 변경", "결과 값이 원래 데이터와 달라짐 (Inaccuracy: Alteration)"),
    "INAC_AS": ("잘못된 연결", "항목이 다른 출처·대상과 연결됨 (Inaccuracy: Association)"),
    "INAC_COR": ("손상 감지 못함", "손상·변조를 잡아내지 못함 (Inaccuracy: Corruption)"),
    "MISINT": ("오해를 부르는 표시", "결과가 잘못 해석되게 표시됨 (Misinterpretation)"),
}
CWE_RE = re.compile(r"CWE-(\d+)(?:\s+([A-Z][A-Za-z0-9'\-]*(?:\s+(?:[A-Za-z0-9'\-]+|\([A-Za-z ]+\)))*))?")

CWE_NAME = {r["CWE"]: r for r in read("cwe.csv")}  # 공식 영어 이름과 한국어 번역

def cwe_of(p):
    out = []
    for m in CWE_RE.finditer(p.get("CWE") or ""):
        if m.group(1) not in [n for n, _ in out]:
            out.append((m.group(1), (m.group(2) or "").strip()))
    return out

def cwe_names(n, name=""):
    """(한국어, 영어) 이름. 표에 없으면 데이터에 적힌 영어 이름만 쓴다."""
    r = CWE_NAME.get(n)
    return (r["한국어"], r["이름"]) if r else ("", name)

def astm_of(p):
    return [t for t in re.findall(r"INCOMP|INAC_EX|INAC_ALT|INAC_AS|INAC_COR|MISINT", p.get("ASTM") or "") if t]

def class_badges(cwes, astms, short=False):
    b = [f'<a className="pm-cwe" href="https://cwe.mitre.org/data/definitions/{n}.html" title={json.dumps(" · ".join(x for x in cwe_names(n, name) if x) or "CWE-" + n, ensure_ascii=False)}>CWE-{n}</a>' for n, name in cwes]
    b += [f'<span className="pm-astm" title={json.dumps(ASTM[t][1], ensure_ascii=False)}>{t}{"" if short else " " + ASTM[t][0]}</span>' for t in dict.fromkeys(astms)]
    return " ".join(b) or "—"

def class_box(p, cwes, astms):
    purp = [x.strip() for x in (p.get("목적") or "").split(",") if x.strip()]
    if not (cwes or astms or purp):
        return []
    rows = []
    if cwes:
        items = []
        for n, name in cwes:
            ko, en = cwe_names(n, name)
            items.append(f'<div className="pm-cwe-item">{class_badges([(n, name)], [])} <b>{esc(ko or en)}</b>'
                         + (f' <span className="pm-class-name">{esc(en)}</span>' if ko and en else "") + "</div>")
        rows.append('<div className="pm-class-row"><span className="pm-class-k">원인 (CWE)</span><span className="pm-class-v">' + "".join(items) + "</span></div>")
    if astms:
        rows.append('<div className="pm-class-row"><span className="pm-class-k">결과 (ASTM E3016)</span><span className="pm-class-v">'
                    + " ".join(f'<span className="pm-astm" title={json.dumps(ASTM[t][1], ensure_ascii=False)}>{t} {ASTM[t][0]}</span>' for t in dict.fromkeys(astms))
                    + "</span></div>")
    if purp:
        rows.append('<div className="pm-class-row"><span className="pm-class-k">훼손되는 목적</span><span className="pm-class-v">'
                    + " ".join(f'<span className="pm-purpose">{esc(x)}</span>' for x in purp) + "</span></div>")
    return ['<div className="pm-class">'] + rows + ["</div>", ""]


# 첫 화면(문제 목록)
lines = ["---", "title: 문제 매트릭스", "sidebar_position: 0", "hide_table_of_contents: true", "---", "", GEN, "",
         "import ProblemMatrix from '@site/src/components/Problems/ProblemMatrix';", "",
         "# 문제 매트릭스", "",
         f"DFIR MCP 서버 구현 가이드라인의 항목마다, 공개 서버 {len(repo)}개에서 관찰된 문제를 소제목별로 묶어 보여 준다.", "",
         "- 열은 가이드라인의 장, 칸은 항목(1.1~4.4), 칸 안의 줄은 소제목(1.3.2)이고, 네모 하나가 문제 하나(P0001)다. 색이 진할수록 그 문제가 관찰된 서버가 많다.",
         "- 서버 × 문제 지도는 [첫 화면](/)에 있다.",
         "- 문제 화면에서 서버별 판정과 그 근거(코드, 실행 검증)를 확인한다. " + NOTE, "",
         "항목 이름을 누르면 오른쪽 패널에 그 항목을 열고, 네모를 누르면 그 문제를 연다.", "", "<ProblemMatrix />", "",
         "<details>", "<summary>표로 보기</summary>", "",
         "| 장 | 항목 | 소제목 | 문제 | 관찰된 서버 |", "|---|---|---|---|---|"]
for ch in chapters:
    its = [c["원고"] for c in cells if c["장"] == ch["장"]]
    pids = [p for p in prob if cell_of[p] in its]
    nsv = len({x for p in pids for x in observed(p)})
    lines.append(f"| [{ch['장']} {ch['이름']}](/problems/{ch['장']}) | {len(its)} | {sum(len(by_cell_heads[i]) for i in its)} | {len(pids)} | {nsv} |")
lines += ["", "</details>", "", "서버별로 보려면 [서버 목록](/problems/servers)을 본다."]
write(os.path.join(P, "index.mdx"), "\n".join(lines))

# 장
for ch in chapters:
    its = [c["원고"] for c in cells if c["장"] == ch["장"]]
    lines = ["---", f"title: {yq(ch['장'] + ' ' + ch['이름'])}", f"sidebar_label: {yq(ch['장'] + ' ' + ch['이름'])}", f"sidebar_position: {int(ch['장'])}", "---", "", GEN, "",
             f"# {ch['장']} {ch['이름']}", "", "| 항목 | 소제목 | 문제 | 관찰된 서버 |", "|---|---|---|---|"]
    for it in its:
        pids = [p for p in prob if cell_of[p] == it]
        nsv = len({x for p in pids for x in observed(p)})
        lines.append(f"| [{it} {cell_name[it]}](/problems/{it[0]}/{it}) | {len(by_cell_heads[it])} | {len(pids)} | {nsv} |")
    write(os.path.join(P, ch["장"], "index.mdx"), "\n".join(lines))

STATE_CODE = {"관찰됨": "obs", "문제 없음": "ok", "확인 안 함": "unk"}

# 항목과 문제
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
        has_class = any(cwe_of(prob[g]) or astm_of(prob[g]) for g in ids)
        only_obs = all(g in obs_only for g in ids)
        lines += (["| 문제 | 원인(CWE) · 결과(ASTM) | 관찰된 서버 |", "|---|---|---|"] if only_obs
                  else ["| 문제 | 원인(CWE) · 결과(ASTM) | 기능 있음 | 관찰됨 | 확인 안 함 |", "|---|---|---|---|---|"] if has_class
                  else ["| 문제 | 기능 있음 | 관찰됨 | 확인 안 함 |", "|---|---|---|---|"])
        for gid in ids:
            p = prob[gid]
            on, unk = applies(gid)
            ob = observed(gid)
            states = {}
            for x in repo:
                st = ST[(gid, x)]
                if st["state"] == "기능 없음":
                    continue
                e = {"s": STATE_CODE[st["state"]]}
                if st["est"]:
                    e["est"] = True
                if st["snap"]:
                    e["commit"] = st["snap"]["커밋"][:7]
                    e["date"] = st["snap"]["커밋일"]
                states[x] = e
            cwes, astms = cwe_of(p), astm_of(p)
            pj = {"id": gid, "name": p["문제"], "den": len(on), "denList": on, "obs": ob,
                  "ver": {x: methods_of(gid, x) for x in repo if methods_of(gid, x)}, "states": states}
            if cwes or astms:
                pj.update({"cwe": [f"CWE-{n}" for n, _ in cwes], "cweName": [cwe_names(n, name)[0] or cwe_names(n, name)[1] for n, name in cwes], "astm": astms})
            if gid in obs_only:
                pj["obsOnly"] = True
            hjson["problems"].append(pj)
            tag_cell = (f" | {class_badges(cwes, astms, short=True)}" if has_class else "")
            lines.append(f"| [{gid} {esc(p['문제'])}]({prob_link(gid)}){tag_cell} | {len(ob)} |" if only_obs
                         else f"| [{gid} {esc(p['문제'])}]({prob_link(gid)}){tag_cell} | {len(on)} | {len(ob)} | {len(unk)} |")
            order += 1
            # 문제 화면
            pl = ["---", f"title: {yq(gid + ' ' + p['문제'])}", f"sidebar_label: {yq(gid + ' ' + p['문제'][:28] + ('…' if len(p['문제']) > 28 else ''))}",
                  f"sidebar_position: {order}", "---", "", GEN, "", "import Case from '@site/src/components/Problems/Case';", "",
                  f"# {gid} {esc(p['문제'])}", "",
                  f"항목 [{it} {c['이름']}](/problems/{it[0]}/{it}) · 소제목 {h['소제목ID']} 「{h['소제목']}」", ""]
            desc = p.get("설명") or p.get("현상과 피해", "")  # 2·4장은 설명, 1·3장은 현상과 피해
            if desc:
                pl += [esc(desc), ""]
            pl += class_box(p, cwes, astms)
            ev = C.OrderedDict()
            for f in sorted(evidence[gid], key=lambda f: (f["서버"].lower(), snap_key[(f["서버"], f["커밋"])]["커밋일"])):
                ev.setdefault(f["서버"], []).append(f)
            order_st = {"관찰됨": 0, "문제 없음": 1, "확인 안 함": 2}
            rows = sorted((x for x in repo if ST[(gid, x)]["state"] != "기능 없음"), key=lambda x: (order_st[ST[(gid, x)]["state"]], x.lower()))
            cnt = C.Counter(ST[(gid, x)]["state"] for x in repo)
            if gid in obs_only:
                not_seen = sorted((x for x in repo if ST[(gid, x)]["state"] == "기능 없음"), key=str.lower)
                summary = f"관찰됨 {cnt['관찰됨']}" + (f" · 확인 안 함 {cnt['확인 안 함']}" if cnt["확인 안 함"] else "") + (
                    f" · 관찰되지 않음 {len(not_seen)} ({', '.join(not_seen)})" if not_seen else "")
            else:
                summary = " · ".join(f"{k} {cnt[k]}" for k in ("관찰됨", "문제 없음", "확인 안 함", "기능 없음"))
            pl += ["## 서버별 판정", "", summary, "",
                   "| 서버 | 판정 | 확인 커밋 | 근거 |", "|---|---|---|---|"]
            for x in rows:
                st = ST[(gid, x)]
                hist = [e for e in history[(gid, x)] if e["state"] != "기능 없음" or e is history[(gid, x)][-1]]
                where = " → ".join(f"{e['state']} {commit_link(x, e['snap'])}" for e in hist) if len(hist) > 1 else (
                    commit_link(x, st["snap"]) if st["snap"] else "")
                n = len(ev.get(x, []))
                parts = ([f"[코드 {n}건](#{x.lower()})"] if n else []) + [
                    f'<span className="pm-v pm-v-run">{m}</span>' for m in methods_of(gid, x) if m != "코드 확인"]
                pl.append(f"| [{x}]({srv_link(x)}) | {badge(st)} | {where} | {' '.join(parts)} |")
            if ev:
                pl += ["", "## 근거 코드", "", "코드 위치를 누르면 그 커밋의 해당 줄을 펼쳐 볼 수 있다. 관찰됨은 문제가 있는 코드, 문제 없음은 제대로 구현했거나 고친 코드다.", ""]
            for x, fs in ev.items():
                r, _ = repo[x]
                pl += [f"### [{x}]({srv_link(x)})", ""]  # 제목 id는 Docusaurus가 서버 이름을 소문자로 바꿔 붙인다
                for f in fs:
                    refs = parse_locs(f["코드위치"])
                    raw = "" if refs or not f["코드위치"] else f["코드위치"]
                    label = f"{f['판정']} · {f['커밋'][:7]}"
                    body = esc(f["요지"]) + (f" ([{'PR #' + f['링크'].rsplit('/', 1)[1] if '/pull/' in f['링크'] else '링크'}]({f['링크']}))" if f["링크"] else "")
                    pl += [f"<Case label={json.dumps(label, ensure_ascii=False)} ok={{{'true' if f['판정'] == '문제 없음' else 'false'}}} repo={json.dumps(r)} commit={json.dumps(f['커밋'])} refs={{{json.dumps(refs, ensure_ascii=False)}}} raw={{{json.dumps(raw, ensure_ascii=False)}}}>",
                           "", body, "", "</Case>", ""]
            vs = [v for x in repo for v in ver_by.get((gid, x), [])]
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
         "기준 커밋은 그 서버를 분석한 커밋이다. " + NOTE, "",
         "| 서버 | 기준 커밋 | 관찰됨 | 확인 안 함 | 항목 |", "|---|---|---|---|---|"]
for x in sorted(repo, key=str.lower):
    r, cm = repo[x]
    obs_p = [p for p in prob if ST[(p, x)]["state"] == "관찰됨"]
    nunk = sum(1 for p in prob if ST[(p, x)]["state"] == "확인 안 함")
    its = sorted({cell_of[p] for p in obs_p})
    lines.append(f"| [{x}]({srv_link(x)}) | [`{cm[:7]}`](https://github.com/{r}/tree/{cm}) | {len(obs_p)} | {nunk or ''} | {', '.join(its)} |")
write(os.path.join(P, "servers", "index.mdx"), "\n".join(lines))
for x in sorted(repo, key=str.lower):
    r, cm = repo[x]
    sl = ["---", f"title: {yq(x)}", f"sidebar_label: {yq(x)}", "---", "", GEN, "", f"# {x}", "",
          f"저장소 [{r}](https://github.com/{r}), 기준 커밋 [{cm[:7]}](https://github.com/{r}/tree/{cm}). " + NOTE, "",
          "## 확인 기록", "", "| 커밋 | 커밋일 | 분석일 | 범위 | 판정 | 메모 |", "|---|---|---|---|---|---|"]
    for sn in snaps_of[x]:
        got = C.Counter(rs[0]["판정"] for (y, c, _), rs in rows_at.items() if y == x and c == sn["커밋"])
        scope = "전체" if "전체" in sn["범위"].split() else sn["범위"]
        sl.append(f"| {commit_link(x, sn)} | {sn['커밋일']} | {sn['분석일']} | {esc(scope)} | {', '.join(f'{k} {v}' for k, v in got.items())} | {esc(sn['메모'])} |")
    sl.append("")
    shown = [p for p in prob if any(e["state"] == "관찰됨" for e in history[(p, x)])]
    if not shown:
        sl += ["관찰된 문제가 없다."]
    else:
        sl += ["## 관찰된 문제", ""]
    for c in cells:
        ps = [p for p in shown if cell_of[p] == c["원고"]]
        if not ps:
            continue
        sl += [f"### {c['원고']} {cell_name[c['원고']]}", ""]
        for gid in ps:
            st = ST[(gid, x)]
            sl.append(f"- [{gid} {esc(prob[gid]['문제'])}]({prob_link(gid)})")
        sl.append("")
    write(os.path.join(P, "servers", f"{slug_srv(x)}.mdx"), "\n".join(sl))

data = {"chapters": {ch["장"]: ch["이름"] for ch in chapters}, "servers": sorted(repo, key=str.lower), "cells": cells_json}
with open(os.path.join(DATA, "problems.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write("\n")
print("문제", len(probs), "서버", len(repo), "항목", len(cells), "근거", len(finds))
