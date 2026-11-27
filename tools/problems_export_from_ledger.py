"""근거 대장에서 문제 매트릭스 데이터(problems/_data/*.csv)를 내보낸다.

python tools/problems_export_from_ledger.py <근거 대장 폴더> <매트릭스 저장소 루트>

근거 대장은 저장소 밖의 로컬 자료다. 이 스크립트는 매트릭스가 쓸 칸만 꺼낸다.
근거의 강도(원자료로 재현, 코드만 등)와 시험 기록은 내보내지 않는다. 실행 검증(verifications.csv)과
사람이 더한 근거(findings.csv의 출처가 빈 줄)와 뒤 분석 회차는 그대로 둔다.

소제목ID는 원고와 소제목 순서로 정한다(1.3.2). 문제ID(P0001)는 소제목과 따로 매기는 식별자다.
이미 내보낸 problems.csv가 있으면 그 대장ID(원고-묶음ID) → 문제ID 대응을 그대로 쓰고, 새 묶음에만 다음 번호를 준다.
그래서 소제목을 옮기거나 묶음을 다른 소제목에 두어도 문제ID는 바뀌지 않는다.

목차(장, 원고, 소제목)와 사례별 소제목 배치는 근거 대장의 L2 목차 개편안 데이터에서 읽는다
(데이터/목차_2026-11-24.csv, 데이터/사례_소제목배치_2026-11-24.csv, 데이터/scripts/import_outline.py가 만든다).
문제 하나는 "소제목에 놓인 원래 묶음"이다. 한 묶음의 사례가 여러 소제목에 갈리면 원래 문제ID는 한 소제목에 남기고
(원래 원고의 소제목 가운데 사례가 가장 많은 곳, 없으면 사례가 가장 많은 곳), 나머지 소제목에는 대장ID@소제목ID로 새 번호를 준다.
이미 번호를 받은 대장ID@소제목ID는 그 번호를 유지하고, 통합으로 사례가 없어진 문제의 번호는 폐기한다.
소제목별로 다시 쓴 문제 이름과 현상과 피해(데이터/문제이름_소제목별_2026-11-24.csv)와
같은 소제목 안의 겹치는 문제를 합친 통합표(데이터/문제통합_소제목별_2026-11-25.csv)를 적용한다.
"""
import csv, os, re, subprocess, sys, glob, collections as C

LEDGER, REPO = sys.argv[1:3]
OUT = os.path.join(REPO, "problems", "_data")
os.makedirs(OUT, exist_ok=True)
ALIAS = {"CIIT": "Cyber-Incident-Investigation-and-Triage-MCP-Server"}
ns = lambda s: ALIAS.get(s.strip(), s.strip())
ng = lambda g: g.replace("-", "").strip()

toc = list(csv.DictReader(open(f"{LEDGER}/데이터/목차_2026-11-24.csv", encoding="utf-8-sig")))
CHAPTERS = [(t["번호"], t["이름"], t["설명"]) for t in toc if t["종류"] == "장"]
TITLE = {t["번호"]: t["이름"] for t in toc if t["종류"] == "원고"}
SECTIONS = [t for t in toc if t["종류"] == "소제목"]
sec_order = {t["번호"]: i for i, t in enumerate(SECTIONS)}
place = {r["사례ID"]: r["소제목"] for r in csv.DictReader(open(f"{LEDGER}/데이터/사례_소제목배치_2026-11-24.csv", encoding="utf-8-sig"))}
RENAME = f"{LEDGER}/데이터/문제이름_소제목별_2026-11-24.csv"
rename = {(r["소제목ID"], r["문제ID"]): r for r in csv.DictReader(open(RENAME, encoding="utf-8-sig"))} if os.path.exists(RENAME) else {}
MERGE = f"{LEDGER}/데이터/문제통합_소제목별_2026-11-25.csv"
merge = {r["사례ID"]: r for r in csv.DictReader(open(MERGE, encoding="utf-8-sig"))} if os.path.exists(MERGE) else {}

EXPORT_DATE = "2026-11-24"  # 근거 대장의 조사 대상 목록(검증_2026-11-24) 날짜. 기준 커밋 스냅샷의 분석일로 쓴다
# 묶음 분모를 21개 서버의 코드로 다시 판정한 묶음(검증_2026-11-24/B2_검증표.csv). 그 밖의 묶음은 묶음분모.csv(매트릭스 셀 상세 기준)를 쓴다.
DEN_OVERRIDE = {("1.3", "B2"): ["findevil", "mulder", "SAVVYDFIR-MCP", "sift-kernel", "trudi"]}
# 분류를 고치며 사례를 다른 문제로 합친 서버는 원래 문제에서 문제 없음(추정)으로 바꾸지 않고 확인 안 함으로 둔다.
# 그 서버를 그 문제로 코드에서 본 것이 아니기 때문이다. (대장ID, 서버)
RECLASS_UNK = {("1.5-B1", "MyIRTeam")}

# 매트릭스는 기준 커밋의 코드로 확인한(정적 분석) 사례만 싣는다. 코드 위치가 없는 사례는 근거 대장에서 정적 분석으로 위치를 채운 뒤 싣는다.
# 개편안에서 배치를 보류한 사례(새 항목 후보 범위)는 싣지 않는다
# 원고가 정해지지 않았던 묶음(미정: 매트릭스 셀 F01, F04, F06)은 개편안이 기존 소제목에 배치했더라도,
# 21개 서버 전체를 조사해 분모를 정하기 전까지 싣지 않는다(지금은 셀 원고에 한계로 적힌 서버의 사례만 있음).
# 조사를 마치면 INCLUDE_UNASSIGNED를 켠다. 끄는 동안에는 미정 묶음으로 옮기거나 합치는 통합표 줄을 적용하지 않고,
# 이름 파일의 미정제외_ 열(있으면)을 쓴다
INCLUDE_UNASSIGNED = True
# 미정 묶음은 21개 서버 조사(2026-11-25) 결과로 분모와 판정을 정한다. 관찰됨과 문제 없음(추정)은 코드 위치와 함께 적고,
# 기능 없음과 범위 밖(같은 저장소의 클라이언트)은 분모에서 빼며, 판단 불가는 그 서버의 회차 범위에서 빼 확인 안 함으로 둔다
SURVEY = f"{LEDGER}/데이터/미정_21서버조사_2026-11-25.csv"
survey = C.defaultdict(list)
if INCLUDE_UNASSIGNED and os.path.exists(SURVEY):
    for r in csv.DictReader(open(SURVEY, encoding="utf-8-sig")):
        survey[(r["소제목"], r["묶음"].replace("-", ""))].append(r)
unk_pairs = set()  # (문제ID, 서버): 판단 불가
# 장 단위 재분석(21개 서버 전체를 코드로 다시 판정한 결과). 이 파일에 있는 문제는 분모를 쓰지 않고 이 판정으로 칸을 정한다.
# 관찰됨은 확인된 위치를 모두 적은 줄, 문제 없음은 본 위치를 적은 추정 줄, 기능 없음은 줄 없이 계산, 판단 불가는 확인 안 함이다.
# 근거 대장의 사례 줄(실행 확인 등)은 그대로 함께 싣는다
REANALYSIS = sorted(glob.glob(f"{LEDGER}/데이터/*장_재분석_*.csv"))
reanal = C.defaultdict(dict)
for fpath in REANALYSIS:
    for r in csv.DictReader(open(fpath, encoding="utf-8-sig")):
        reanal[r["문제ID"]][r["서버"]] = r
conflicts = []
cases = [r for r in csv.DictReader(open(f"{LEDGER}/데이터/전체_사례.csv", encoding="utf-8-sig"))
         if r["집계"] == "센다" and r["코드위치"].strip() and place.get(r["사례ID"]) and (INCLUDE_UNASSIGNED or r["원고"] != "미정")]
dens = {(d["원고"], ng(d["묶음ID"])): d for d in csv.DictReader(open(f"{LEDGER}/데이터/묶음분모.csv", encoding="utf-8-sig"))}
servers = list(csv.DictReader(open(f"{LEDGER}/검증_2026-11-24/조사대상_목록.csv", encoding="utf-8-sig")))
repo_of = {s["서버"]: (s["저장소"], s["기준 커밋"]) for s in servers}

# 현상과 피해: 원고별 묶음정리 문서의 "### <묶음ID> ..." 절에서 "현상과 피해:" 줄
harm = {}
for f in glob.glob(f"{LEDGER}/사례정리_2026-11-24/*_묶음정리.md"):
    it = os.path.basename(f)[:3]
    cur = None
    for line in open(f, encoding="utf-8"):
        moved = re.match(r"^#{3,4}\s+3\.2에서 옮겨 쓴 묶음:\s*3\.2\s+D([12])", line)
        if moved and it == "3.1":
            cur = "E" + moved.group(1); continue
        m = re.match(r"^#{3,4}\s+([A-Z][-0-9]+[A-Z0-9-]*)\s", line)
        if m:
            cur = ng(m.group(1)); continue
        if cur and line.startswith("현상과 피해") and (it, cur) not in harm:
            harm[(it, cur)] = line.split(":", 1)[1].strip() if ":" in line else line.strip()

# 근거 표기(원고 기록, 원자료 있음, 코드, 조건의 성격 등)는 매트릭스에 싣지 않는다. 괄호 안의 그런 항목만 지운다.
EVID = re.compile(r"원자료|원고 기록|^원고$|^코드$|코드 확인|코드로|단계는 코드|^실행|실행$|함수 실행|MCP 실행|조건$|대조|재현|^시험|^CT-|^T\d")
def strip_evidence(text):
    def fix(m):
        inner = m.group(1)
        keep = [t for t in re.split(r",\s*", inner) if t.strip() and not EVID.search(t.strip())]
        return f"({', '.join(keep)})" if keep else ""
    out = re.sub(r"\(([^()]*)\)", fix, text)
    return re.sub(r"\s+([.,])", r"\1", re.sub(r"\s{2,}", " ", out)).strip()
# 근거 강도(약함, 가능), 작업 이력(보완, 판정 전, 결정 대기), 다른 묶음을 "함께" 보라는 표기, 시험 번호도 싣지 않는다.
# 괄호 안 항목은 서버 이름만 남기고, 사례 ID나 검토 메모가 든 문장은 뺀다
ALIASES = sorted({ns(x["서버"]) for x in csv.DictReader(open(f"{LEDGER}/검증_2026-11-24/조사대상_목록.csv", encoding="utf-8-sig"))} | {"CIIT"}, key=len, reverse=True)
DROP_ITEM = re.compile(r"약함|보완|판정 전|이어짐|함께$|^피해는|^MCP$|^서술$|대기")
DROP_SENT = re.compile(r"\d\.\d-[A-Z]\d+-|범위 결정|사례는 찾지 못했다|이번 보완")
def clean_harm(text):
    def fix(m):
        keep = []
        for t in re.split(r",\s*", m.group(1)):
            t = t.strip()
            if not t or re.search(r"\s가능$", t) or DROP_ITEM.search(t):
                continue
            srv = next((a for a in ALIASES if t == a or t.startswith(a + "-") or t.startswith(a + " ")), None)
            if srv:
                t = re.sub(r"\s+(M\d+[a-z]?|[세두네] 건|코드)$", "", t)
            if t not in keep:
                keep.append(t)
        return f"({', '.join(keep)})" if keep else ""
    out = re.sub(r"\(([^()]*)\)", fix, text)
    out = " ".join(x for x in re.split(r"(?<=다\.)\s+", out) if x and not DROP_SENT.search(x))
    return re.sub(r"\s+([.,])", r"\1", re.sub(r"\s{2,}", " ", out)).strip()
harm = {k: clean_harm(strip_evidence(v)) for k, v in harm.items()}

# 근거 대장의 사례 번호(CIIT-1, SK-5, 4.1-E2-mulder-2)는 대장 안에서만 쓰는 식별자라 서버 이름만 남긴다
CASE_ALIAS = {**ALIAS, "SK": "sift-kernel"}
def strip_case_ids(text, names):
    alt = "|".join(sorted(map(re.escape, list(names) + list(CASE_ALIAS)), key=len, reverse=True))
    text = re.sub(r"(?<![A-Za-z0-9_-])(?:\d\.\d-[A-Z]\d*-)?(" + alt + r")-x?\d+(?:_(?:" + alt + r")-x?\d+)*(?![A-Za-z0-9_-])",
                  lambda m: CASE_ALIAS.get(m[1], m[1]), text)
    text = re.sub(r"(?<![A-Za-z0-9_-])(CIIT|SK)(?![A-Za-z0-9_-])", lambda m: CASE_ALIAS[m[1]], text)
    def dedupe(m):
        parts = m[1].split(", ")
        if not any(x in names for x in parts):
            return m[0]
        out = []
        for x in parts:
            if x not in out or x not in names:
                out.append(x)
        return "(" + ", ".join(out) + ")"
    return re.sub(r"\(([^()]*)\)", dedupe, text)

# 통합표: 이동은 사례를 다른 문제로 옮기고, 중복 통합, 일부 관찰 통합, 배치 보류는 그 사례를 싣지 않는다(대표 사례ID와 사유는 통합표에 남는다)
def split_key(k):
    return tuple(k.split("-", 1)) if k[:1].isdigit() else ("미정", k)
group_name = {(r["원고"], ng(r["묶음ID"])): r["묶음명"] for r in cases}
split = C.defaultdict(set)  # 통합 전 배치로 본 원래 묶음의 소제목들
for r in cases:
    split[(r["원고"], ng(r["묶음ID"]))].add(place[r["사례ID"]])
touched = set()  # 통합으로 사례가 빠지거나 들어온 (소제목, 원고, 묶음): 분모를 다시 판단한다
groups = C.OrderedDict()
for r in cases:
    sec, it, gid = place[r["사례ID"]], r["원고"], ng(r["묶음ID"])
    m = merge.get(r["사례ID"])
    if m and not INCLUDE_UNASSIGNED and m["옮길문제ID"] and split_key(m["옮길문제ID"])[0] == "미정":
        m = None
    if m:
        assert m["소제목ID"] == sec, (r["사례ID"], sec, m["소제목ID"])
        touched.add((sec, it, gid))
        if m["처리유형"] != "이동":
            continue
        it, gid = split_key(m["옮길문제ID"])
        touched.add((sec, it, gid))
    groups.setdefault((sec, it, gid), {"name": group_name[(it, gid)], "rows": []})["rows"].append(r)

# 대장이 기준 커밋과 다른 커밋을 짧게 적은 사례("3a1a317", "3a1a317, b57f9e8")는 이미 있는 분석 회차의 전체 해시로 맞춘다(여러 개면 첫 커밋)
_snap_path = os.path.join(OUT, "snapshots.csv")
known_commits = C.defaultdict(list)
if os.path.exists(_snap_path):
    for r in csv.DictReader(open(_snap_path, encoding="utf-8")):
        known_commits[r["서버"]].append(r["커밋"])
def full_commit(srv, raw):
    tok = re.split(r"[,\s]+", raw.strip())[0]
    return next((c for c in known_commits[srv] if c.startswith(tok)), tok)

# 이미 매긴 문제ID를 이어 쓴다. 커밋된 problems.csv의 대응을 먼저 읽고 작업 중인 파일로 덮어, 한 번 내보내기에서 빠졌던 묶음이
# 다시 생겨도 원래 번호를 받게 한다. 새 번호는 두 파일에 있던 가장 큰 번호 다음이다(지운 번호는 다시 쓰지 않는다)
old = os.path.join(OUT, "problems.csv")
pid = {}
try:
    head = subprocess.run(["git", "-C", REPO, "show", "HEAD:problems/_data/problems.csv"], capture_output=True, text=True, encoding="utf-8").stdout
    for r in csv.DictReader(head.splitlines()):
        if r.get("대장ID") and r.get("문제ID"):
            pid[r["대장ID"]] = r["문제ID"]
except FileNotFoundError:
    pass
seen = set(pid.values())
if os.path.exists(old):
    for r in csv.DictReader(open(old, encoding="utf-8")):
        if r.get("대장ID") and r.get("문제ID"):
            pid[r["대장ID"]] = r["문제ID"]; seen.add(r["문제ID"])
nxt = max([int(v[1:]) for v in seen] + [0]) + 1

# 갈린 묶음에서 원래 문제ID를 남길 소제목: 원래 원고의 소제목 가운데 사례가 가장 많은 곳, 없으면 사례가 가장 많은 곳
size = C.Counter()
for (sec, it, gid), g in groups.items():
    size[(sec, it, gid)] = len(g["rows"])
primary = {}
for (sec, it, gid) in groups:
    cands = [k for k in groups if k[1:] == (it, gid)]
    home = [k for k in cands if k[0][:3] == it] or cands
    primary[(it, gid)] = max(home, key=lambda k: (size[k], -sec_order[k[0]]))[0]
def ledger_id(sec, it, gid):
    # 이미 번호를 받은 부분(대장ID@소제목ID)은 그 번호를 그대로 쓴다. 원래 번호가 남던 부분이 통합으로 없어져도
    # 다른 부분이 원래 번호를 이어받지 않는다(원래 번호는 폐기되고 다시 쓰지 않는다)
    base = f"{it}-{gid}"
    if f"{base}@{sec}" in pid:
        return f"{base}@{sec}"
    return base if primary[(it, gid)] == sec else f"{base}@{sec}"
for key in sorted(groups, key=lambda k: (sec_order[k[0]], k[1], k[2])):
    lid = ledger_id(*key)
    if lid not in pid:
        pid[lid] = f"P{nxt:04d}"; nxt += 1

head_rows = [{"소제목ID": t["번호"], "원고": t["번호"][:3], "순서": int(t["번호"].split(".")[2]), "소제목": t["이름"]} for t in SECTIONS]
prob_rows, ledger_rows, unplaced = [], [], []
no_den = {}

# 현상과 피해에서 다른 묶음을 옛 묶음ID(같은 원고의 D1, 다른 원고의 1.5 E4)로 가리킨 곳을 문제ID로 바꾼다
def relink(text, cell):
    text = re.sub(r"(?<![\w.])(\d\.\d) ([A-Z]\d+)(?![A-Za-z0-9-])", lambda m: pid.get(f"{m[1]}-{m[2]}", m[0]), text)
    return re.sub(r"(?<![A-Za-z0-9.\-])([A-Z]\d+)(?![A-Za-z0-9\-])", lambda m: pid.get(f"{cell}-{m[1]}", m[0]), text)

for (sec, it, gid), g in sorted(groups.items(), key=lambda kv: pid[ledger_id(*kv[0])]):
    lid = ledger_id(sec, it, gid); p_ = pid[lid]
    is_split = len(split[(it, gid)]) > 1 or (sec, it, gid) in touched
    d = dens.get((it, gid))
    den = [ns(x) for x in re.split(r",\s*", d["적용대상서버"]) if x.strip()] if d and d["적용대상서버"].strip() else []
    if (it, gid) in DEN_OVERRIDE:
        den = DEN_OVERRIDE[(it, gid)]
    obs = sorted({ns(r["서버"]) for r in g["rows"]})
    # 여러 소제목에 갈린 묶음은 분모를 정하지 않는다(묶음 전체의 분모가 각 부분에 맞는지 판정한 적이 없다).
    # 한 소제목에만 있는 묶음이 통합으로 사례를 받거나 내준 경우는 기존 분모에 관찰 서버를 더해 쓴다(관찰된 서버는 그 기능이 있다)
    if is_split:
        if len(split[(it, gid)]) == 1 and den:
            den = sorted(set(den) | set(obs))
        else:
            den = []
    rn = rename.get((sec, gid if it == "미정" else f"{it}-{gid}"))
    alt = not INCLUDE_UNASSIGNED and rn is not None
    name = ((alt and (rn.get("미정제외_새이름") or "").strip()) or (rn["새이름"].strip() if rn else "")) or re.sub(r"^\((판정 전|판정 보류)\)\s*", "", g["name"])
    # 갈린 묶음의 서술은 여러 소제목의 경우를 섞어 적었으므로, 소제목별로 다시 쓴 서술이 없으면 비운다
    text = ((alt and (rn.get("미정제외_현상과피해") or "").strip()) or (rn["현상과피해"].strip() if rn else "")) or (harm.get((it, gid), "") if len(split[(it, gid)]) == 1 else "")
    prob_rows.append({"문제ID": p_, "소제목ID": sec, "문제": relink(name, it), "현상과 피해": strip_case_ids(relink(text, it), repo_of),
                      "대장ID": lid})
    for r in g["rows"]:
        srv = ns(r["서버"]); repo, commit = repo_of.get(srv, ("", ""))
        c = commit if r["기준커밋"][:7] == commit[:7] else full_commit(srv, r["기준커밋"])
        ledger_rows.append({"서버": srv, "커밋": c, "문제ID": p_, "판정": "관찰됨", "추정": "", "출처": "대장",
                            "코드위치": r["코드위치"].strip(), "요지": r["요지"].strip(), "링크": ""})
    if p_ in reanal:
        for srv, x in reanal[p_].items():
            v = x["판정"]
            if srv in obs and v != "관찰됨":
                conflicts.append((p_, srv, v))
            if v == "판단 불가":
                if srv not in obs:  # 대장 사례가 관찰인 칸은 재분석이 판정을 미뤄도 관찰을 지운다고 보지 않는다
                    unk_pairs.add((p_, srv))
            elif v in ("관찰됨", "문제 없음"):
                ledger_rows.append({"서버": srv, "커밋": repo_of[srv][1], "문제ID": p_, "판정": v,
                                    "추정": "예" if v == "문제 없음" else "", "출처": "대장",
                                    "코드위치": x["코드위치"].strip(), "요지": x["요지"].strip(), "링크": ""})
        no_den[p_] = False
        continue
    sv = survey.get((sec, gid), []) if it == "미정" and INCLUDE_UNASSIGNED else None  # 조사할 서버가 없던 묶음은 관찰 서버만 분모
    if sv is not None:
        # 미정 묶음: 관찰 사례가 있는 서버와, 조사에서 관찰됨이나 문제 없음으로 본 서버가 분모다
        den = list(obs)
        for x in sv:
            srv = ns(x["서버"])
            if x["범위"] or x["판정"] == "기능 없음":
                continue
            if x["판정"] in ("판단 불가", "확인 안 함"):
                unk_pairs.add((p_, srv)); continue
            if srv in obs:
                continue  # 이미 관찰 사례가 있으면 그 사례를 따른다
            den.append(srv)
            ledger_rows.append({"서버": srv, "커밋": repo_of[srv][1], "문제ID": p_, "판정": x["판정"],
                                "추정": "예" if x["판정"] == "문제 없음" else "", "출처": "대장",
                                "코드위치": x["코드위치"].strip(), "요지": x["요지"].strip(), "링크": ""})
        no_den[p_] = False
        continue
    # 묶음 분모에 있지만 관찰되지 않은 서버는 기준 커밋에서 문제 없음(추정)으로 둔다. 코드 위치가 없는 이 줄은 기능이 있다고 판정했을 뿐 이 문제로 코드를 보지 않은 줄이다
    for srv in den:
        if (lid.split("@")[0], srv) in RECLASS_UNK and srv not in obs:
            unk_pairs.add((p_, srv)); continue
        if srv not in obs:
            ledger_rows.append({"서버": srv, "커밋": repo_of[srv][1], "문제ID": p_, "판정": "문제 없음", "추정": "예", "출처": "대장",
                                "코드위치": "", "요지": "", "링크": ""})
    no_den[p_] = not den

def w(name, rows):
    with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="") as f:
        x = csv.DictWriter(f, fieldnames=list(rows[0].keys()), quoting=csv.QUOTE_ALL, lineterminator="\n"); x.writeheader(); x.writerows(rows)
w("chapters.csv", [{"장": a, "이름": b} for a, b, c in CHAPTERS])
# problems/_data/ch<장>/ 폴더로 직접 관리하는 장은 공용 파일에 쓰지 않는다(빌드도 그 장은 폴더만 읽는다)
OWN = {d[2:] for d in os.listdir(OUT) if re.fullmatch(r"ch\d+", d) and os.path.isdir(os.path.join(OUT, d))}
own_ids = {p["문제ID"] for p in prob_rows if p["소제목ID"].split(".")[0] in OWN}
head_rows = [h for h in head_rows if h["소제목ID"].split(".")[0] not in OWN]
prob_rows = [p for p in prob_rows if p["문제ID"] not in own_ids]
ledger_rows = [r for r in ledger_rows if r["문제ID"] not in own_ids]
no_den = {p: v for p, v in no_den.items() if p not in own_ids}
unk_pairs = {(p, x) for p, x in unk_pairs if p not in own_ids}
w("cells.csv", [{"원고": k, "장": k[0], "이름": v} for k, v in TITLE.items()])
w("headings.csv", head_rows)
w("problems.csv", prob_rows)
w("servers.csv", [{"서버": s["서버"], "저장소": s["저장소"]} for s in servers])

# 근거(findings.csv): 대장에서 온 줄(출처 '대장')만 다시 쓰고, 사람이 더한 줄은 그대로 둔다.
# 사람이 같은 서버·커밋·문제에 판정을 적었으면 그 판정을 따르고 대장 줄은 넣지 않는다
fpath = os.path.join(OUT, "findings.csv")
old_f = list(csv.DictReader(open(fpath, encoding="utf-8"))) if os.path.exists(fpath) else []
human = [r for r in old_f if r["출처"] != "대장" and r["문제ID"] not in own_ids]
taken = {(r["서버"], r["커밋"], r["문제ID"]) for r in human}
skipped = [r for r in ledger_rows if (r["서버"], r["커밋"], r["문제ID"]) in taken]
w("findings.csv", [r for r in ledger_rows if (r["서버"], r["커밋"], r["문제ID"]) not in taken] + human)

# 분석 회차(snapshots.csv): 서버마다 기준 커밋의 전체 분석을 다시 쓰고, 그 밖의 회차는 그대로 둔다.
# 분모를 정하지 않은 문제는 관찰되지 않은 서버에서 확인 안 함으로 두려고 기준 회차 범위에서 뺀다.
# 대장이 기준 커밋과 다른 커밋에 적은 사례는 그 커밋의 일부 회차로 두고, 기준 회차 범위에서 뺀다
def commit_date(repo, commit):
    try:
        out = subprocess.run(["gh", "api", f"repos/{repo}/commits/{commit}", "--jq", ".commit.committer.date"], capture_output=True, text=True)
    except FileNotFoundError:  # gh가 없으면 분석일로 둔다
        return EXPORT_DATE
    return out.stdout.strip()[:10] or EXPORT_DATE

spath = os.path.join(OUT, "snapshots.csv")
old_snaps = list(csv.DictReader(open(spath, encoding="utf-8"))) if os.path.exists(spath) else []
known = {(r["서버"], r["커밋"]): r for r in old_snaps}
observed_by = C.defaultdict(set)
other = C.defaultdict(set)
for r in ledger_rows:
    if r["판정"] != "관찰됨":
        continue
    if r["커밋"] == repo_of[r["서버"]][1]:
        observed_by[r["서버"]].add(r["문제ID"])
    else:
        other[(r["서버"], r["커밋"])].add(r["문제ID"])
snap_rows = []
for s in servers:
    srv, base = s["서버"], s["기준 커밋"]
    excl = {p for p, nd in no_den.items() if nd and p not in observed_by[srv]}
    excl |= {p for (p, x) in unk_pairs if x == srv}
    excl |= {p for (x, _), ps in other.items() if x == srv for p in ps if p not in observed_by[srv]}
    old = known.get((srv, base))
    snap_rows.append({"서버": srv, "커밋": base, "커밋일": old["커밋일"] if old else commit_date(s["저장소"], base), "분석일": EXPORT_DATE,
                      "범위": " ".join(["전체"] + [f"-{p}" for p in sorted(excl)]), "메모": "처음 분석(근거 대장 조사 대상 목록의 기준 커밋)"})
for (srv, c), ps in other.items():
    old = known.get((srv, c))
    snap_rows.append({"서버": srv, "커밋": c, "커밋일": old["커밋일"] if old else commit_date(repo_of[srv][0], c), "분석일": EXPORT_DATE,
                      "범위": " ".join(sorted(ps)), "메모": "근거 대장이 기준 커밋과 다른 커밋에서 기록한 사례"})
made = {(r["서버"], r["커밋"]) for r in snap_rows}
w("snapshots.csv", snap_rows + [r for r in old_snaps if (r["서버"], r["커밋"]) not in made])
print("사람이 판정을 적어 넣지 않은 대장 줄", len(skipped))
print("문제", len(prob_rows), "대장 근거", len(ledger_rows), "소제목", len(head_rows), "현상과 피해 있음", sum(1 for p in prob_rows if p["현상과 피해"]))
print("소제목에 놓이지 않은 묶음", unplaced)
print("재분석 문제", len(reanal), "대장 사례는 관찰인데 재분석은 다른 칸", conflicts)
