"""근거 대장에서 문제 매트릭스 데이터(problems/_data/*.csv)를 내보낸다.

python tools/problems_export_from_ledger.py <근거 대장 폴더> <매트릭스 저장소 루트>

근거 대장은 저장소 밖의 로컬 자료다. 이 스크립트는 매트릭스가 쓸 칸만 꺼낸다.
근거의 강도(원자료로 재현, 코드만 등)와 시험 기록은 내보내지 않는다.
"""
import csv, os, re, sys, glob, collections as C

LEDGER, REPO = sys.argv[1:3]
OUT = os.path.join(REPO, "problems", "_data")
os.makedirs(OUT, exist_ok=True)
ALIAS = {"CIIT": "Cyber-Incident-Investigation-and-Triage-MCP-Server"}
ns = lambda s: ALIAS.get(s.strip(), s.strip())
ng = lambda g: g.replace("-", "").strip()

# 목차(장, 원고, 소제목)와 사례별 소제목 배치는 근거 대장의 개편안 데이터에서 읽는다(데이터/scripts/import_outline.py가 만든다).
OUTLINE = f"{LEDGER}/데이터/목차_2026-11-24.csv"
PLACE = f"{LEDGER}/데이터/사례_소제목배치_2026-11-24.csv"
toc = list(csv.DictReader(open(OUTLINE, encoding="utf-8-sig")))
CHAPTERS = [(t["번호"], t["이름"], t["설명"]) for t in toc if t["종류"] == "장"]
TITLE = {t["번호"]: t["이름"] for t in toc if t["종류"] == "원고"}
SECTIONS = [t for t in toc if t["종류"] == "소제목"]
place = {r["사례ID"]: r["소제목"] for r in csv.DictReader(open(PLACE, encoding="utf-8-sig"))}
# 소제목으로 갈리거나 옮겨 오면서 다시 쓴 문제 이름과 현상과 피해(소제목ID, 문제ID 단위). 없으면 원래 묶음의 것을 쓴다
RENAME = f"{LEDGER}/데이터/문제이름_소제목별_2026-11-24.csv"
rename = {(r["소제목ID"], r["문제ID"]): r for r in csv.DictReader(open(RENAME, encoding="utf-8-sig"))} if os.path.exists(RENAME) else {}

# bench 실험(Trace2Bac/dfir-mcp-bench, 2026-11-24 클론 76b02fa)과 문제 묶음의 대응
EXPS = [("1.3", "B2", "EXP-003", "mulder", "audit_tool_coverage가 사건 전체 감사 로그의 도구 이름으로 모든 디스크 이미지를 검사한 것으로 보고", "calebevans/mulder#270"),
        ("1.3", "B2", "EXP-004", "findevil", "assess_coverage가 셸 이력을 파일별로 세지 않아 보지 않은 이력을 가림", "coverage-per-location 패치"),
        ("1.3", "B2", "EXP-005", "trudi", "해시만 계산한 압축 파일로 유출 단계를 검사한 것으로 셈", "lifecycle-skip-fingerprints 패치"),
        ("1.3", "B2", "EXP-006", "trudi", "공격 단계 점검이 검사하지 않은 유출 단계를 가림", "lifecycle-skip-fingerprints, lifecycle-archive-names 패치(진행 중)"),
        ("4.1", "A1", "EXP-002", "mulder", "clamscan이 디스크 이미지를 열지 못해도 0건 성공으로 보고", "clamav-limit, extract-keep 패치")]
BENCH_COMMIT = "76b02fa"
# 묶음 분모를 21개 서버의 코드로 다시 판정한 묶음(검증_2026-11-24/B2_검증표.csv). 그 밖의 묶음은 묶음분모.csv(매트릭스 셀 상세 기준)를 쓴다.
DEN_OVERRIDE = {("1.3", "B2"): ["findevil", "mulder", "SAVVYDFIR-MCP", "sift-kernel", "trudi"]}

# 매트릭스는 기준 커밋의 코드로 확인한(정적 분석) 사례만 싣는다. 코드 위치가 없는 사례는 근거 대장에서 정적 분석으로 위치를 채운 뒤 싣는다
# 개편안에서 배치를 보류한 사례(새 항목 후보 범위)는 싣지 않는다
cases = [r for r in csv.DictReader(open(f"{LEDGER}/데이터/전체_사례.csv", encoding="utf-8-sig"))
         if r["집계"] == "센다" and r["코드위치"].strip() and place.get(r["사례ID"])]
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
# 근거 강도(약함, 가능), 작업 이력(보완, 판정 전, 결정 대기), 다른 묶음 참조, 시험 번호도 싣지 않는다.
# 괄호 안 항목은 서버 이름만 남기고(사례 번호와 시험 번호를 뗀다), 사례 ID나 검토 메모가 든 문장은 뺀다.
ALIASES = sorted({ns(s["서버"]) for s in servers} | {"CIIT"}, key=len, reverse=True)
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
                t = re.sub(r"^(%s)-\d+$" % re.escape(srv), srv, t)
                t = re.sub(r"\s+(M\d+[a-z]?|[세두네] 건|코드)$", "", t)
            if t not in keep:
                keep.append(t)
        return f"({', '.join(keep)})" if keep else ""
    out = re.sub(r"\(([^()]*)\)", fix, text)
    sents = [x for x in re.split(r"(?<=다\.)\s+", out) if x and not DROP_SENT.search(x)]
    out = " ".join(sents)
    return re.sub(r"\s+([.,])", r"\1", re.sub(r"\s{2,}", " ", out)).strip()
harm = {k: clean_harm(strip_evidence(v)) for k, v in harm.items()}

# 문제 하나는 "새 소제목에 놓인 원래 묶음"이다. 문제 번호는 원래 원고와 묶음(1.1-A1)으로 붙여 출처를 드러낸다.
# 한 묶음의 사례가 여러 소제목에 갈리면 소제목마다 그 소제목의 사례만 싣고, 분모는 정하지 않는다(개편안: 기존 분모를 새 절에 그대로 옮기지 않음).
# 같은 소제목 안에서 겹치는 문제를 합친 통합표(사례 단위). 이동은 사례를 다른 문제로 옮기고,
# 중복 통합, 일부 관찰 통합, 배치 보류는 그 사례를 싣지 않는다(대표 사례ID와 사유는 통합표에 남는다).
MERGE = f"{LEDGER}/데이터/문제통합_소제목별_2026-11-25.csv"
merge = {r["사례ID"]: r for r in csv.DictReader(open(MERGE, encoding="utf-8-sig"))} if os.path.exists(MERGE) else {}
def split_pid(pid):
    return tuple(pid.split("-", 1)) if pid[:1].isdigit() else ("미정", pid)
group_name = {(r["원고"], ng(r["묶음ID"])): r["묶음명"] for r in cases}
split = C.defaultdict(set)  # 통합 전 배치로 본 원래 묶음의 소제목들
for r in cases:
    split[(r["원고"], ng(r["묶음ID"]))].add(place[r["사례ID"]])
touched = set()  # 통합으로 사례가 빠지거나 들어온 (소제목, 원고, 묶음): 분모를 다시 판단해야 한다
groups = C.OrderedDict()
for r in cases:
    sec, it, gid = place[r["사례ID"]], r["원고"], ng(r["묶음ID"])
    m = merge.get(r["사례ID"])
    if m:
        assert m["소제목ID"] == sec, (r["사례ID"], sec, m["소제목ID"])
        touched.add((sec, it, gid))
        if m["처리유형"] != "이동":
            continue
        it, gid = split_pid(m["옮길문제ID"])
        touched.add((sec, it, gid))
    groups.setdefault((sec, it, gid), {"name": group_name[(it, gid)], "rows": []})["rows"].append(r)

def harm_for(it, gid, is_split):
    # 갈린 묶음의 서술은 여러 소제목의 경우를 섞어 적었으므로 싣지 않는다. 소제목별 서술은 따로 정리한 뒤 싣는다
    return "" if is_split else harm.get((it, gid), "")

sec_order = {t["번호"]: i for i, t in enumerate(SECTIONS)}
head_rows = [{"원고": t["번호"][:3], "소제목ID": t["번호"], "순서": int(t["번호"].split(".")[2]), "소제목": t["이름"], "설명": t["설명"],
              "문제": " ".join(gid if it == "미정" else f"{it}-{gid}" for (sec, it, gid) in groups if sec == t["번호"])} for t in SECTIONS]
prob_rows, obs_rows = [], []
for (sec, it, gid), g in sorted(groups.items(), key=lambda kv: (sec_order[kv[0][0]], kv[0][1] != kv[0][0][:3], kv[0][1], kv[0][2])):
    is_split = len(split[(it, gid)]) > 1 or (sec, it, gid) in touched
    d = dens.get((it, gid))
    den = [ns(x) for x in re.split(r",\s*", d["적용대상서버"]) if x.strip()] if d and d["적용대상서버"].strip() else []
    if (it, gid) in DEN_OVERRIDE:
        den = DEN_OVERRIDE[(it, gid)]
    obs = sorted({ns(r["서버"]) for r in g["rows"]})
    # 원래 한 소제목에만 있던 묶음이 통합으로 사례를 받기만 했고 그 서버가 모두 기존 분모 안이면 분모를 그대로 쓴다
    if is_split and not (len(split[(it, gid)]) == 1 and den and set(obs) <= set(den)):
        den = []
    name = re.sub(r"^\((판정 전|판정 보류)\)\s*", "", g["name"])
    pid = gid if it == "미정" else f"{it}-{gid}"  # 원고가 없던 묶음은 매트릭스 셀 코드(F01C1 등)를 그대로 쓴다
    rn = rename.get((sec, pid))
    if rn:
        name = rn["새이름"].strip() or name
    prob_rows.append({"원고": sec[:3], "소제목ID": sec, "문제ID": pid, "원래원고": it, "묶음ID": gid, "문제": name,
                      "현상과 피해": rn["현상과피해"].strip() if rn and rn["현상과피해"].strip() else harm_for(it, gid, len(split[(it, gid)]) > 1), "해당 기능 서버": "; ".join(den),
                      "관찰된 서버": "; ".join(obs), "갈림": " ".join(sorted(split[(it, gid)])) if len(split[(it, gid)]) > 1 else ""})
    for r in g["rows"]:
        srv = ns(r["서버"]); repo, commit = repo_of.get(srv, ("", ""))
        obs_rows.append({"원고": sec[:3], "소제목ID": sec, "문제ID": pid, "서버": srv, "사례ID": r["사례ID"], "요지": r["요지"].strip(),
                         "코드위치": r["코드위치"].strip(), "저장소": repo, "커밋": commit if r["기준커밋"][:7] == commit[:7] else r["기준커밋"].strip()})

def w(name, rows):
    with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="") as f:
        x = csv.DictWriter(f, fieldnames=list(rows[0].keys()), quoting=csv.QUOTE_ALL, lineterminator="\n"); x.writeheader(); x.writerows(rows)
w("chapters.csv", [{"장": a, "이름": b, "설명": c} for a, b, c in CHAPTERS])
w("cells.csv", [{"원고": k, "장": k[0], "이름": v} for k, v in TITLE.items()])
w("headings.csv", head_rows)
w("problems.csv", prob_rows)
w("observations.csv", obs_rows)
w("experiments.csv", [{"문제ID": f"{a}-{b}", "실험": c, "서버": d, "내용": e, "서버 변경": f, "bench 커밋": BENCH_COMMIT} for a, b, c, d, e, f in EXPS])
w("servers.csv", [{"서버": s["서버"], "저장소": s["저장소"], "커밋": s["기준 커밋"]} for s in servers])
print("문제", len(prob_rows), "관찰", len(obs_rows), "소제목", len(head_rows), "현상과 피해 있음", sum(1 for p in prob_rows if p["현상과 피해"]))
print("갈린 묶음", sum(1 for v in split.values() if len(v) > 1), "사례 없는 소제목", [h["소제목ID"] for h in head_rows if not h["문제"]])
