"""근거 대장에서 문제 매트릭스 데이터(problems/_data/*.csv)를 내보낸다.

python tools/problems_export_from_ledger.py <근거 대장 폴더> <매트릭스 저장소 루트>

근거 대장은 저장소 밖의 로컬 자료다. 이 스크립트는 매트릭스가 쓸 칸만 꺼낸다.
근거의 강도(원자료로 재현, 코드만 등)와 시험 기록은 내보내지 않는다. 실행 검증(verifications.csv)과
사람이 더한 근거(findings.csv의 출처가 빈 줄)와 뒤 분석 회차는 그대로 둔다.

소제목ID는 원고와 소제목 순서로 정한다(1.3.2). 문제ID(P0001)는 소제목과 따로 매기는 식별자다.
이미 내보낸 problems.csv가 있으면 그 대장ID(원고-묶음ID) → 문제ID 대응을 그대로 쓰고, 새 묶음에만 다음 번호를 준다.
그래서 소제목을 옮기거나 묶음을 다른 소제목에 두어도 문제ID는 바뀌지 않는다.
"""
import csv, os, re, subprocess, sys, glob, collections as C

LEDGER, REPO = sys.argv[1:3]
OUT = os.path.join(REPO, "problems", "_data")
os.makedirs(OUT, exist_ok=True)
ALIAS = {"CIIT": "Cyber-Incident-Investigation-and-Triage-MCP-Server"}
ns = lambda s: ALIAS.get(s.strip(), s.strip())
ng = lambda g: g.replace("-", "").strip()

CHAPTERS = [("1", "작업 대상과 상태의 관리"), ("2", "도구 실행"), ("3", "수행 기록과 파생물의 관리"), ("4", "결과 전달")]
TITLE = {"1.1": "증거 및 사건 관리", "1.2": "분석 도구 관리", "1.3": "조사 절차와 진행 관리", "1.4": "증거 유형별 처리",
         "1.5": "증거 무결성 관리", "2.1": "도구 설명", "2.2": "도구 입력 검사", "2.3": "실행 조건 검사", "3.1": "도구 호출 기록",
         "3.2": "파생물 관리", "4.1": "실행 결과 상태 구분", "4.2": "결과 해석 정보 표시", "4.3": "전달 크기 관리", "4.4": "민감 정보 관리"}

# 구현방안 소제목(초안_2026-11-24)과 문제 묶음의 대응. 키는 기능 부분 글자 또는 묶음ID.
HEAD = {
 "1.1": [("작업 대상과 식별자 관리", ["A1", "B2", "N1"]), ("증거와 저장 위치의 범위 확인", ["B1"]), ("생성 자료와 증거의 연결", ["C1", "N2"]),
         ("기존 자료와 실행 환경 및 기록의 재사용", ["D1", "D2"]), ("대상의 선택과 변경 및 진행 중 작업의 유지", ["E1", "E2", "E3"])],
 "1.2": [("실행할 프로그램과 기능의 범위", ["A1", "A2", "A3"]), ("실행 파일의 선택과 대체", ["B1", "B2"]), ("실제 사용한 프로그램 정보 확인", ["C1"]),
         ("분석용 참조 자료 관리", ["D1", "D2", "N1"])],
 "1.3": [("조사 절차 안내", ["A1", "A3", "A4"]), ("조사 진행 상태 관리", ["B1", "B2"]), ("후속 분석 작업 추천", ["A2"]), ("조사 완료 판단", ["B3"]),
         ("조사 재개와 초기화", ["C1"])],
 "1.4": [("증거 유형 확인", ["A1", "A2"]), ("유형별 처리와 입력 대조", ["B1", "B2"]), ("부속 자료 반영", ["C1"])],
 "1.5": [("보호할 증거의 범위", ["A2", "A3", "C1", "C2"]), ("증거를 읽는 방법과 작업 사본", ["A1", "B1", "B2", "B3"]), ("무결성 확인을 위한 기준값", ["D1", "D2"]),
         ("기준값 대조와 검증 결과", ["E1", "E2", "E3", "E4"]), ("변경이 불가피한 조사 자료", ["F1"])],
 "2.1": [("설명 내용", ["A1", "A2", "C1"]), ("입력과 반환 정의", ["A3", "B1", "B2", "B3"]), ("설명의 전달과 갱신", ["D1", "D2"]), ("동작 표시와 부수 효과", ["E1", "E2"])],
 "2.2": [("인자 구조와 값 검사", ["A1", "A2", "A3", "A4", "A5", "A11"]), ("경로 인자 검사", ["B6"]), ("외부 프로그램과 라이브러리에 전달하는 인자 구성", ["C7"]),
         ("검사 순서와 오류 보고", ["D8", "D9", "D10"])],
 "2.3": [("준비 조건", ["A1", "A2", "A3"]), ("자원 조건", ["B1"])],
 "3.1": [("기록 적용 범위", ["A1", "A2", "A3", "A4"]), ("요청과 호출 식별", ["B1", "C2"]), ("결과 기록", ["C1"]), ("기록 쓰기 실패 처리", ["D1"]),
         ("기록의 보존과 변경 확인", ["E1", "E2"])],
 "3.2": [("파생물의 저장 위치와 이름", ["E1", "E2", "F1", "F2"]), ("저장 완료와 실패한 산출물의 처리", ["B2"]), ("파생물 기준값과 변경 확인", ["B1", "C2"]),
         ("파생물의 재사용", ["C1"])],
 "4.1": [("외부 프로그램 실행 결과 판단", ["A1", "A2"]), ("결과 상태의 의미", ["B1", "B2", "B3"]), ("일부 처리와 중단", ["C1", "C2", "D1"]),
         ("실패의 전달과 이유", ["E1", "E2", "F1"])],
 "4.2": [("결과 항목의 출처", ["B1", "B2", "B3", "B4", "B5", "B6", "A9"]), ("값의 해석 조건", ["D1", "D2", "D3", "D4", "D5", "D6"]),
         ("분석 범위와 해석 한계", ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]),
         ("증거 글과 서버 설명 및 지시의 구분", ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"])],
 "4.3": [("상한 설정과 적용", ["A1"]), ("형식과 필수 정보 보존", ["B1", "B2", "B3"]), ("부분 반환 표시와 건수", ["C1", "C2", "C3", "C4", "C5"]),
         ("전체 출력 접근과 나머지 조회", ["D1", "D2"]), ("출력 보관과 보관본 조회", ["E1"])],
 "4.4": [("증거에서 나온 비밀 값", ["A1", "A2", "B1"]), ("조사자가 제공한 복호화 비밀", ["B2"]), ("서버 자격증명", ["C1", "C2", "C3", "C4", "C5"]),
         ("외부 전송의 범위와 수신처", ["D1", "D2", "D3", "E1", "E2", "E3", "E4"])],
}
EXPORT_DATE = "2026-11-24"  # 근거 대장의 조사 대상 목록(검증_2026-11-24) 날짜. 기준 커밋 스냅샷의 분석일로 쓴다
# 묶음 분모를 21개 서버의 코드로 다시 판정한 묶음(검증_2026-11-24/B2_검증표.csv). 그 밖의 묶음은 묶음분모.csv(매트릭스 셀 상세 기준)를 쓴다.
DEN_OVERRIDE = {("1.3", "B2"): ["findevil", "mulder", "SAVVYDFIR-MCP", "sift-kernel", "trudi"]}

cases = [r for r in csv.DictReader(open(f"{LEDGER}/데이터/전체_사례.csv", encoding="utf-8-sig")) if r["집계"] == "센다" and r["원고"] != "미정"]
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
harm = {k: strip_evidence(v) for k, v in harm.items()}

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

groups = C.OrderedDict()
for r in cases:
    groups.setdefault((r["원고"], ng(r["묶음ID"])), {"name": r["묶음명"], "part": r["기능부분"], "rows": []})["rows"].append(r)

# 이미 매긴 문제ID를 이어 쓴다
old = os.path.join(OUT, "problems.csv")
pid = {}
if os.path.exists(old):
    for r in csv.DictReader(open(old, encoding="utf-8")):
        if r.get("대장ID") and r.get("문제ID"):
            pid[r["대장ID"]] = r["문제ID"]
nxt = max([int(v[1:]) for v in pid.values()] + [0]) + 1

head_rows, prob_rows, ledger_rows, unplaced = [], [], [], []
no_den = {}
head_id, order_in = {}, []
for it, secs in HEAD.items():
    for order, (h, ids) in enumerate(secs, 1):
        hid = f"{it}.{order}"
        head_rows.append({"소제목ID": hid, "원고": it, "순서": order, "소제목": h})
        for gid in ids:
            if (it, gid) in groups and (it, gid) not in head_id:
                head_id[(it, gid)] = hid
                order_in.append((it, gid))
for key in groups:
    if key not in head_id:
        unplaced.append(f"{key[0]} {key[1]}")
for it, gid in order_in:
    if f"{it}-{gid}" not in pid:
        pid[f"{it}-{gid}"] = f"P{nxt:04d}"; nxt += 1

# 현상과 피해에서 다른 묶음을 옛 묶음ID(같은 원고의 D1, 다른 원고의 1.5 E4)로 가리킨 곳을 문제ID로 바꾼다
def relink(text, cell):
    text = re.sub(r"(?<![\w.])(\d\.\d) ([A-Z]\d+)(?![A-Za-z0-9-])", lambda m: pid.get(f"{m[1]}-{m[2]}", m[0]), text)
    return re.sub(r"(?<![A-Za-z0-9.\-])([A-Z]\d+)(?![A-Za-z0-9\-])", lambda m: pid.get(f"{cell}-{m[1]}", m[0]), text)

for it, gid in sorted(order_in, key=lambda k: pid[f"{k[0]}-{k[1]}"]):
    g = groups[(it, gid)]
    d = dens.get((it, gid))
    den = [ns(x) for x in re.split(r",\s*", d["적용대상서버"]) if x.strip()] if d and d["적용대상서버"].strip() else []
    if (it, gid) in DEN_OVERRIDE:
        den = DEN_OVERRIDE[(it, gid)]
    obs = sorted({ns(r["서버"]) for r in g["rows"]})
    p_ = pid[f"{it}-{gid}"]
    name = re.sub(r"^\((판정 전|판정 보류)\)\s*", "", g["name"])
    prob_rows.append({"문제ID": p_, "소제목ID": head_id[(it, gid)], "문제": relink(name, it), "현상과 피해": strip_case_ids(relink(harm.get((it, gid), ""), it), repo_of),
                      "대장ID": f"{it}-{gid}"})
    for r in g["rows"]:
        srv = ns(r["서버"]); repo, commit = repo_of.get(srv, ("", ""))
        c = commit if r["기준커밋"][:7] == commit[:7] else r["기준커밋"].strip()
        ledger_rows.append({"서버": srv, "커밋": c, "문제ID": p_, "판정": "관찰됨", "추정": "", "출처": "대장",
                            "코드위치": r["코드위치"].strip(), "요지": r["요지"].strip(), "링크": ""})
    # 묶음 분모에 있지만 관찰되지 않은 서버는 기준 커밋에서 문제 없음(추정)으로 둔다
    for srv in den:
        if srv not in obs:
            ledger_rows.append({"서버": srv, "커밋": repo_of[srv][1], "문제ID": p_, "판정": "문제 없음", "추정": "예", "출처": "대장",
                                "코드위치": "", "요지": "", "링크": ""})
    no_den[p_] = not den

def w(name, rows):
    with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="") as f:
        x = csv.DictWriter(f, fieldnames=list(rows[0].keys()), quoting=csv.QUOTE_ALL, lineterminator="\n"); x.writeheader(); x.writerows(rows)
w("chapters.csv", [{"장": a, "이름": b} for a, b in CHAPTERS])
w("cells.csv", [{"원고": k, "장": k[0], "이름": v} for k, v in TITLE.items()])
w("headings.csv", head_rows)
w("problems.csv", prob_rows)
w("servers.csv", [{"서버": s["서버"], "저장소": s["저장소"]} for s in servers])

# 근거(findings.csv): 대장에서 온 줄(출처 '대장')만 다시 쓰고, 사람이 더한 줄은 그대로 둔다.
# 사람이 같은 서버·커밋·문제에 판정을 적었으면 그 판정을 따르고 대장 줄은 넣지 않는다
fpath = os.path.join(OUT, "findings.csv")
old_f = list(csv.DictReader(open(fpath, encoding="utf-8"))) if os.path.exists(fpath) else []
human = [r for r in old_f if r["출처"] != "대장"]
taken = {(r["서버"], r["커밋"], r["문제ID"]) for r in human}
skipped = [r for r in ledger_rows if (r["서버"], r["커밋"], r["문제ID"]) in taken]
w("findings.csv", [r for r in ledger_rows if (r["서버"], r["커밋"], r["문제ID"]) not in taken] + human)

# 분석 회차(snapshots.csv): 서버마다 기준 커밋의 전체 분석을 다시 쓰고, 그 밖의 회차는 그대로 둔다.
# 분모를 정하지 않은 문제는 관찰되지 않은 서버에서 확인 안 함으로 두려고 기준 회차 범위에서 뺀다.
# 대장이 기준 커밋과 다른 커밋에 적은 사례는 그 커밋의 일부 회차로 두고, 기준 회차 범위에서 뺀다
def commit_date(repo, commit):
    out = subprocess.run(["gh", "api", f"repos/{repo}/commits/{commit}", "--jq", ".commit.committer.date"], capture_output=True, text=True)
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
