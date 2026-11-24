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
# bench 실험(Trace2Bac/dfir-mcp-bench, 2026-11-24 클론 76b02fa)과 문제 묶음의 대응
EXPS = [("1.3", "B2", "EXP-003", "mulder", "audit_tool_coverage가 사건 전체 감사 로그의 도구 이름으로 모든 디스크 이미지를 검사한 것으로 보고", "calebevans/mulder#270"),
        ("1.3", "B2", "EXP-004", "findevil", "assess_coverage가 셸 이력을 파일별로 세지 않아 보지 않은 이력을 가림", "coverage-per-location 패치"),
        ("1.3", "B2", "EXP-005", "trudi", "해시만 계산한 압축 파일로 유출 단계를 검사한 것으로 셈", "lifecycle-skip-fingerprints 패치"),
        ("1.3", "B2", "EXP-006", "trudi", "공격 단계 점검이 검사하지 않은 유출 단계를 가림", "lifecycle-skip-fingerprints, lifecycle-archive-names 패치(진행 중)"),
        ("4.1", "A1", "EXP-002", "mulder", "clamscan이 디스크 이미지를 열지 못해도 0건 성공으로 보고", "clamav-limit, extract-keep 패치")]
BENCH_COMMIT = "76b02fa"
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

groups = C.OrderedDict()
for r in cases:
    groups.setdefault((r["원고"], ng(r["묶음ID"])), {"name": r["묶음명"], "part": r["기능부분"], "rows": []})["rows"].append(r)

head_rows, prob_rows, obs_rows, unplaced = [], [], [], []
placed = set()
for it, secs in HEAD.items():
    for order, (h, ids) in enumerate(secs, 1):
        head_rows.append({"원고": it, "순서": order, "소제목": h, "묶음": " ".join(ids)})
        for gid in ids:
            if (it, gid) in groups:
                placed.add((it, gid))
for (it, gid), g in groups.items():
    if (it, gid) not in placed:
        unplaced.append(f"{it} {gid}")
    d = dens.get((it, gid))
    den = [ns(x) for x in re.split(r",\s*", d["적용대상서버"]) if x.strip()] if d and d["적용대상서버"].strip() else []
    if (it, gid) in DEN_OVERRIDE:
        den = DEN_OVERRIDE[(it, gid)]
    obs = sorted({ns(r["서버"]) for r in g["rows"]})
    sec = next((h for h, ids in HEAD.get(it, []) if gid in ids), "")
    name = re.sub(r"^\((판정 전|판정 보류)\)\s*", "", g["name"])
    prob_rows.append({"원고": it, "묶음ID": gid, "소제목": sec, "문제": name, "현상과 피해": harm.get((it, gid), ""),
                      "해당 기능 서버": "; ".join(den), "관찰된 서버": "; ".join(obs)})
    for r in g["rows"]:
        srv = ns(r["서버"]); repo, commit = repo_of.get(srv, ("", ""))
        obs_rows.append({"원고": it, "묶음ID": gid, "서버": srv, "사례ID": r["사례ID"], "요지": r["요지"].strip(),
                         "코드위치": r["코드위치"].strip(), "저장소": repo, "커밋": commit if r["기준커밋"][:7] == commit[:7] else r["기준커밋"].strip()})

def w(name, rows):
    with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="") as f:
        x = csv.DictWriter(f, fieldnames=list(rows[0].keys()), quoting=csv.QUOTE_ALL, lineterminator="\n"); x.writeheader(); x.writerows(rows)
w("chapters.csv", [{"장": a, "이름": b} for a, b in CHAPTERS])
w("cells.csv", [{"원고": k, "장": k[0], "이름": v} for k, v in TITLE.items()])
w("headings.csv", head_rows)
w("problems.csv", prob_rows)
w("observations.csv", obs_rows)
w("experiments.csv", [{"원고": a, "묶음ID": b, "실험": c, "서버": d, "내용": e, "서버 변경": f, "bench 커밋": BENCH_COMMIT} for a, b, c, d, e, f in EXPS])
w("servers.csv", [{"서버": s["서버"], "저장소": s["저장소"], "커밋": s["기준 커밋"]} for s in servers])
print("문제", len(prob_rows), "관찰", len(obs_rows), "소제목", len(head_rows), "현상과 피해 있음", sum(1 for p in prob_rows if p["현상과 피해"]))
print("소제목에 놓이지 않은 묶음", unplaced)
