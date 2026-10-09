# -*- coding: utf-8 -*-
"""매트릭스 도구. 저장소 어디서든 돈다(Windows·macOS·Linux).

  python tools/pilot.py validate          셀·축·설정·원고 머리말을 스키마와 서로 대조한다(외부 저장소 없이 돈다. CI가 돌린다)
  python tools/pilot.py check [서버[:셀,셀] ...]   validate + 원고 형식·표지·근거·발췌 원문 일치·문장 점검(서버 클론이 있어야 한다)
  python tools/pilot.py build             사이트(web/)가 읽는 화면 데이터 web/static/data/matrix.json을 만든다
  python tools/pilot.py fill <서버>        원고의 `@발췌 경로:시작-끝` 줄을 기준 커밋 코드 블록과 링크로 바꾸고 백틱 `경로:줄`을 링크로 바꾼다
  python tools/pilot.py renumber <서버>    셀 파일마다 표지 번호를 본문에 처음 나온 차례로 다시 매기고 근거 항목을 그 차례로 옮긴다
  python tools/pilot.py new <서버> [--repo 소유자/이름 --commit 40자] [셀ID ... | all]
                                         새 서버 원고의 틀을 만든다. 서버 개요가 없으면 --repo·--commit으로 만들고 config의 servers에 더한다.
                                         셀을 주지 않으면 시범 셀을, all이면 모든 셀의 틀을 만든다. 이미 있는 파일은 건드리지 않는다

원본:
  matrix/cells/<축>/index.mdx     축 하나의 차례·이름·설명
  matrix/cells/<축>/<ID>.mdx      셀 하나의 확인 사항·상세 정의
  matrix/config.yaml              화면에 보일 서버, 시범 셀
  reports/<서버>/index.mdx        서버 개요(저장소·기준 커밋)
  reports/<서버>/<축>/<셀>.mdx    서버의 셀 하나. 머리말(front matter)에 어느 상세에 드는지, 본문에 구현·한계·근거
형식은 matrix/README.md와 reports/README.mdx에 있다.
"""
import functools
import glob
import json
import os
import re
import subprocess
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MATRIX = os.path.join(ROOT, "matrix")
REPORTS = os.path.join(ROOT, "reports")
OUT = os.path.join(ROOT, "web", "static", "data", "matrix.json")   # 생성물(.gitignore)

# ── 상세가 아닌 판정 ── 머리말 details의 id와 화면 데이터에는 영어 코드를, 원고 소제목과 화면 글자에는 한글 이름을 쓴다.
NOT_IMPL, NOT_APPL, UNKNOWN = "not_implemented", "not_applicable", "unknown"   # unknown은 화면에만 쓴다
SPECIAL = (NOT_IMPL, NOT_APPL, UNKNOWN)
SPECIAL_NAME = {NOT_IMPL: "미구현", NOT_APPL: "비적용", UNKNOWN: "미확인"}       # 원고 소제목 ### 미구현 등
SPECIAL_OF_NAME = {v: k for k, v in SPECIAL_NAME.items()}

# ── 원고 표시어 ── 원고(reports/)에 쓰는 낱말. 다국어로 나눌 때 여기와 web/의 화면 글자를 언어별로 늘린다.
TERMS = {
    "impl": "구현",                 # 단락 머리 **구현.**
    "limit": "한계",                # 단락 머리 **한계.**(방식이 적용되지 않는 경로, 있을 때만)
    "judge": "판단",                # 미구현·비적용의 단락 머리 **판단.**
    "evidence": "근거",             # 소제목 ### 근거
    "excerpt": "@발췌",             # 근거의 발췌 지시어
}
EVID_HEAD = "\n### %s\n" % TERMS["evidence"]
CELL_ID = re.compile(r"^[A-Z]\d\d$")


# ───────────────────────── 원본 읽기 ─────────────────────────
def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


FRONT = re.compile(r"\A---\n(.*?)\n---\n", re.S)


def read_front(path):
    """마크다운 파일의 머리말(YAML)과 본문을 나눈다. 본문 줄 번호를 맞추려고 머리말 줄 수도 돌려준다."""
    text = open(path, encoding="utf-8").read().replace("\r\n", "\n")
    m = FRONT.match(text)
    if not m:
        return {}, text, 0
    return (yaml.safe_load(m.group(1)) or {}), text[m.end():], m.group(0).count("\n")


def load_matrix():
    """축·셀·설정을 읽는다. 축은 order 차례, 셀은 축 차례, 같은 축 안에서는 ID 차례다.
    matrix/cells/index.mdx는 Docusaurus의 매트릭스 화면이라 읽지 않는다."""
    axes, cells = [], []
    for p in glob.glob(os.path.join(MATRIX, "cells", "*", "index.mdx")):
        a, body, _ = read_front(p)
        title, _, desc = body.strip().partition("\n")
        a["_file"] = os.path.relpath(p, ROOT)
        a["_dir"] = os.path.basename(os.path.dirname(p))
        a["_title"] = title.strip()
        a["description"] = desc.strip()
        axes.append(a)
    axes.sort(key=lambda a: (a.get("order") if isinstance(a.get("order"), int) else 99, str(a.get("axis"))))
    for a in axes:
        a["id"] = a.get("axis")
    order = {a["id"]: i for i, a in enumerate(axes)}
    for p in glob.glob(os.path.join(MATRIX, "cells", "*", "*.mdx")):
        if os.path.basename(p) == "index.mdx":
            continue
        c, body, _ = read_front(p)
        c["_file"] = os.path.relpath(p, ROOT)
        c["_dir"] = os.path.basename(os.path.dirname(p))
        c["_title"] = body.strip()
        cells.append(c)
    cells.sort(key=lambda c: (order.get(str(c.get("id", "?"))[0], 99), str(c.get("id"))))
    config = load_yaml(os.path.join(MATRIX, "config.yaml"))
    return axes, cells, config


AXES, CELL_LIST, CONFIG = load_matrix()
CELLS = {c.get("id"): c for c in CELL_LIST}
# 구현 사례가 아직 없는 상세 후보(matrix/candidates.yaml). {셀ID: [후보, …]}. 후보에는 번호가 없다
_CAND_PATH = os.path.join(MATRIX, "candidates.yaml")
CANDIDATES = (load_yaml(_CAND_PATH) or {}) if os.path.exists(_CAND_PATH) else {}
ORDER = list(CONFIG["pilot_cells"])


def detail_name(iid):
    cell = CELLS.get(iid.split(".")[0], {})
    for d in cell.get("details", []):
        if d["id"] == iid:
            return d["name"]
    return None



def report_dir(name):
    return os.path.join(REPORTS, name)


def cell_files(name):
    """서버 폴더의 셀 파일(reports/<서버>/<축>/<셀>.mdx). {셀ID: 경로}"""
    out = {}
    for p in sorted(glob.glob(os.path.join(report_dir(name), "*", "*.mdx"))):
        stem = os.path.splitext(os.path.basename(p))[0]
        if stem != "index" and CELL_ID.match(stem):
            out[stem] = p
    return out


def reported_servers():
    return [n for n in CONFIG["servers"] if os.path.isdir(report_dir(n))]


# ───────────────────────── 원고 한 파일 읽기 ─────────────────────────
# 셀 번호의 첫 글자는 축 폴더(matrix/cells/<축>/index.mdx)에서 읽는다. 축을 더해도 정규식을 고치지 않는다
AXIS_CHARS = "".join(sorted({str(a["id"]) for a in AXES}))
CELL_REF = re.compile(r"(?<![A-Za-z0-9_.`/])([" + AXIS_CHARS + r"]\d\d)(?:\.\d\d)?(?!\d)")
OTHER_REF = re.compile(r"(?<![\w.])([" + AXIS_CHARS + r"]\d\d)(?:\.\d\d)?(?!\d)")
MARK = re.compile(r"\[(\d+)\](?!\()")
LEAD = re.compile(r"^\*\*([^*]+?)\.\*\*\s?")


def split_evidence(lines):
    """근거 소절의 줄을 [n] 항목별로 나눈다. 코드 블록 안의 줄은 항목 머리로 보지 않는다."""
    order, evid, cur, in_code = [], {}, None, False
    for ln in lines:
        if ln.startswith("```"):
            in_code = not in_code
        m = re.match(r"^\[(\d+)\] ", ln) if not in_code else None
        if m:
            cur = int(m.group(1))
            order.append(cur)
            evid.setdefault(cur, [])
        if cur is not None:
            evid[cur].append(ln)
    return order, evid


def parse_cell(path):
    """셀 파일 하나를 읽는다. 머리말의 상세 목록, 상세별 단락 묶음, 근거 항목을 돌려준다."""
    fm, body, _ = read_front(path)
    sec = {"cell": fm.get("cell"), "title": "", "items": [], "units": [], "evid": {}, "evid_order": [],
           "errors": [], "warns": []}
    for d in fm.get("details") or []:
        iid = str(d.get("id", ""))
        sec["items"].append({"id": iid,
                             "label": SPECIAL_NAME[iid] if iid in SPECIAL else "%s %s" % (iid, detail_name(iid) or "")})
    pre, *subs = re.split(r"^### ", body, flags=re.M)
    for ln in pre.split("\n"):
        if ln.startswith("# ") and not sec["title"]:
            sec["title"] = ln[2:].strip()
        elif ln.strip():
            sec["errors"].append("첫 소제목(###) 앞에 제목 밖의 글이 있다: " + ln[:40])
    for sub in subs:
        h, _, rest = sub.partition("\n")
        h = h.strip()
        if h == TERMS["evidence"]:
            sec["evid_order"], sec["evid"] = split_evidence(rest.split("\n"))
            continue
        head = h.split(" ", 1)[0]
        unit, cur = {"label": h, "id": SPECIAL_OF_NAME.get(head, head), "blocks": []}, None
        for ln in rest.split("\n"):
            if ln.startswith("```"):
                sec["errors"].append("본문에 코드 블록이 있다. 코드는 근거 소절에만 둔다")
            m = LEAD.match(ln)
            if m:
                cur = {"label": m.group(1), "lines": [ln[m.end():]]}
                unit["blocks"].append(cur)
            elif cur is not None:
                cur["lines"].append(ln)
            elif ln.strip():
                sec["errors"].append("'%s' 아래 머리말 없는 단락: %s" % (h, ln[:40]))
        sec["units"].append(unit)
    return sec


def parse(name):
    """서버 원고 전체. (index.mdx 머리말과 본문, {셀ID: 셀 파일 내용})"""
    idx = os.path.join(report_dir(name), "index.mdx")
    head_fm, head, _ = read_front(idx) if os.path.exists(idx) else ({}, "", 0)
    return head_fm, head, {cid: parse_cell(p) for cid, p in cell_files(name).items()}


def block_text(b):
    return " ".join(l for l in b["lines"] if l.strip())


SENT_END = re.compile(r"(?<=[다음됨함]\.)\s+(?=\S)|(?<=\]\.)\s+(?=\S)|(?<=\)\.)\s+(?=\S)")


def sentences_in_line(line):
    """한 줄에 든 문장 수. 코드 백틱 안과 링크 주소의 마침표는 세지 않는다."""
    t = re.sub(r"`[^`]*`", "C", line)
    t = re.sub(r"\]\([^)]*\)", "](U)", t)
    return len(SENT_END.split(t))


def prose_lines(lines):
    """코드 블록·발췌 링크 줄을 뺀 글 줄."""
    fence = False
    for ln in lines:
        if ln.startswith("```"):
            fence = not fence
            continue
        if fence or not ln.strip() or re.match(r"^\[`[^`]+`\]\(https?://", ln):
            continue
        yield ln


# ───────────────────────── 작성 규칙 낱말 ─────────────────────────
# docs/writing-rules/ 0001(구어 낱말)·0002(코드 개념 직역어)에서 기계로 잡을 수 있는 낱말. 맞는 쓰임도 있어 경고만 낸다.
WORD_RULES = [
    ("0001", re.compile(r"깔(?:아 ?주|아 ?두|린|리|고 )|(?<![가-힣])까는"), "깔다 → 설치하다"),
    ("0001", re.compile(r"찍(?:는다|는 |은 |어 |힌다|힌 |고 )"), "찍다 → 출력하다·기록하다"),
    ("0001", re.compile(r"뜬다|뜨지만|뜨면"), "뜨다 → 시작되다·실행되다"),
    ("0001", re.compile(r"띄(?:우|운|웠)"), "띄우다 → 실행하다·시작하다"),
    ("0001", re.compile(r"(?:예외|오류|실패|C)[을를]? (?:따로 |모두 |먼저 |다시 )?잡(?:아|고|은|는|으면|지|았|힌|혀)"), "(예외·잠금을) 잡다 → 처리하다·획득하다(이어지는 동작을 함께 쓰기)"),
    ("0001", re.compile(r"(?<![가-힣])(?:돈다|도는|돌고|돌면|돌지|돌며|돌아야|돌아도|돌린다|돌리고|돌리면|돌린|돌리는|돌려야|돌리지|돌릴)(?![가-힣])"), "돌다·돌리다 → 실행되다·동작하다·실행하다"),
    ("0001", re.compile(r"그냥"), "그냥 → 그대로·별도 처리 없이"),
    ("0001", re.compile(r"깨지(?:거나|면|고|는)|깨진|깨졌"), "깨지다 → 손상되다·형식이 잘못되다"),
    ("0001", re.compile(r"(?<!오래 )걸리지 않|(?:검사|방식|장치|목록|규칙)[이가은는] 걸(?:리|린)"), "적용 범위의 걸리다 → 적용되다"),
    ("0001", re.compile(r"근데|엄청|되게 |얘기|이런 거|그런 거"), "구어 → 글말"),
    ("0001", re.compile(r"넘어(?:가|간|갈)"), "넘어가다 → 무엇을 하는지(건너뛴다·다시 실행한다·전달된다·옮긴다)"),
    ("0001", re.compile(r"(?<!예를 )(?<!예로 )(?<!예시로 )(?<![가-힣])(?:(?:든다|듭니다|드는|들고|들면)(?![가-힣])|들지 않)|에 든(?= )"), "(목록·범위에) 들다 → 포함되다·속하다·해당하다·들어 있다"),
    ("0002", re.compile(r"영수증|(?<!키 )지문|처방"), "코드 개념 직역어 → 코드 이름을 백틱으로 쓰고 뜻을 풀어 쓰기"),
]


def word_warnings(path):
    """파일에서 WORD_RULES 낱말을 찾는다. 코드 블록·인라인 코드·링크 주소는 보지 않는다."""
    out, fence = [], False
    where = os.path.relpath(path, ROOT)
    for no, ln in enumerate(open(path, encoding="utf-8").read().split("\n"), 1):
        if ln.startswith("```"):
            fence = not fence
            continue
        if fence:
            continue
        t = re.sub(r"`[^`]*`", "C", ln)
        t = re.sub(r"\]\([^)]*\)", "]", t)
        for rule, rx, hint in WORD_RULES:
            m = rx.search(t)
            if m:
                out.append("%s:%d 작성 규칙 %s(%s): …%s…" % (where, no, rule, hint, t[max(0, m.start() - 15):m.end() + 10].strip()))
    return out


# ───────────────────────── validate ─────────────────────────
def _schema(name):
    return json.load(open(os.path.join(MATRIX, "schema", name), encoding="utf-8"))


def _schema_errors(obj, schema, where):
    try:
        import jsonschema
    except ImportError:
        raise SystemExit("jsonschema가 없다. pip install -r requirements.txt")
    v = jsonschema.Draft202012Validator(schema)
    return ["%s: %s%s" % (where, "/".join(str(x) for x in e.path) + " " if e.path else "", e.message)
            for e in sorted(v.iter_errors(obj), key=lambda e: list(e.path))]


def validate():
    """원본 파일끼리의 일관성. (오류, 경고, 알림)을 돌려준다. 오류만 CI를 실패시킨다."""
    errs, warns = [], []
    axis_schema = _schema("axis.schema.json")
    for a in AXES:
        f = a["_file"]
        errs += _schema_errors({k: v for k, v in a.items() if not k.startswith("_") and k not in ("id", "description")},
                               axis_schema, f)
        if a.get("axis") != a["_dir"]:
            errs.append("%s: 머리말 axis(%s)가 폴더 이름(%s)과 다르다" % (f, a.get("axis"), a["_dir"]))
        if a["_title"] != "# %s %s" % (a.get("axis"), a.get("name")):
            errs.append("%s: 본문 첫 줄은 제목 '# %s %s'여야 한다(축 이름을 고치면 같이 고친다)" % (f, a.get("axis"), a.get("name")))
        if not a["description"]:
            errs.append("%s: 제목 아래에 축 설명이 없다" % f)
    errs += _schema_errors(CONFIG, _schema("config.schema.json"), "matrix/config.yaml")
    cell_schema = _schema("cell.schema.json")
    axis_ids = [a["id"] for a in AXES]
    if len(set(axis_ids)) != len(axis_ids):
        errs.append("matrix/cells/*/index.mdx: 축 axis가 겹친다")
    orders = [a.get("order") for a in AXES]
    if len(set(orders)) != len(orders):
        errs.append("matrix/cells/*/index.mdx: 축 order가 겹친다")
    for d in sorted(glob.glob(os.path.join(MATRIX, "cells", "*", ""))):
        if not os.path.exists(os.path.join(d, "index.mdx")):
            errs.append("%s: 축 폴더에 index.mdx가 없다" % os.path.relpath(d, ROOT))
    seen = set()
    for c in CELL_LIST:
        f = c["_file"]
        body = {k: v for k, v in c.items() if not k.startswith("_")}
        errs += _schema_errors(body, cell_schema, f)
        cid = str(c.get("id"))
        if c["_title"] != "# %s %s" % (cid, c.get("name")):
            errs.append("%s: 본문은 제목 '# %s %s' 한 줄이어야 한다(셀 이름을 고치면 같이 고친다)" % (f, cid, c.get("name")))
        if os.path.splitext(os.path.basename(f))[0] != cid:
            errs.append("%s: 파일 이름과 id(%s)가 다르다" % (f, cid))
        if c["_dir"] != cid[:1]:
            errs.append("%s: 셀은 축 폴더 matrix/cells/%s/에 둔다" % (f, cid[:1]))
        if cid in seen:
            errs.append("%s: 셀 id가 겹친다" % f)
        seen.add(cid)
        if cid[:1] not in axis_ids:
            errs.append("%s: 첫 글자 %s가 축(matrix/cells/<축>/index.mdx)이 아니다" % (f, cid[:1]))
        ids = [str(d.get("id")) for d in c.get("details") or []]
        for iid in ids:
            if not iid.startswith(cid + "."):
                errs.append("%s: 상세 번호 %s가 셀 번호 %s로 시작하지 않는다" % (f, iid, cid))
        for iid in set(x for x in ids if ids.count(x) > 1):
            errs.append("%s: 상세 번호 %s가 겹친다" % (f, iid))
        if c.get("conditional") and not c.get("applies_to"):
            errs.append("%s: 조건부 셀에 applies_to가 없다" % f)
        if c.get("scope"):
            for d in c.get("details") or []:
                if not d.get("include"):  # exclude는 헷갈릴 상세가 있을 때만 쓰는 선택 필드다
                    warns.append("%s: %s에 include가 아직 없다" % (f, d.get("id")))
                # exclude에는 같은 셀의 상세만 쓴다. 다른 셀과 차이점은 boundary에 쓴다
                other = sorted({x for x in OTHER_REF.findall(str(d.get("exclude") or ""))
                                if x != c["id"]})
                if other:
                    warns.append("%s: %s의 exclude가 다른 셀(%s)을 가리킨다. 다른 셀과 차이점은 boundary에 쓴다" % (f, d.get("id"), ", ".join(other)))
            for k in ("not_implemented", "not_applicable"):
                if not c.get(k):
                    errs.append("%s: 정의를 쓴 셀인데 %s가 없다" % (f, k))
        for d in c.get("details") or []:
            for sv in d.get("seen_in") or []:
                if sv not in CONFIG["servers"]:
                    warns.append("%s: %s의 seen_in 서버 %s가 matrix/config.yaml servers에 없다" % (f, d.get("id"), sv))
    for f in [a["_file"] for a in AXES] + [c["_file"] for c in CELL_LIST]:
        warns += word_warnings(os.path.join(ROOT, f))
    for cid in ORDER:
        if cid not in CELLS:
            errs.append("matrix/config.yaml: 시범 셀 %s의 셀 파일이 없다" % cid)
        elif not CELLS[cid].get("scope"):
            errs.append("matrix/config.yaml: 시범 셀 %s에 정의(scope·not_implemented·not_applicable·include·exclude)가 없다" % cid)
    rep_schema = _schema("report.schema.json")
    behind = []  # 원고 기준 버전이 지금 매트릭스 버전보다 낮은 서버
    for n in reported_servers():
        idx = os.path.join(report_dir(n), "index.mdx")
        if not os.path.exists(idx):
            errs.append("reports/%s/index.mdx가 없다" % n)
        else:
            fm, _, _ = read_front(idx)
            if fm.get("server") != n:
                errs.append("reports/%s/index.mdx: 머리말 server가 %s가 아니다" % (n, n))
            mv = str(fm.get("matrix_version", ""))
            # 버전은 날짜(YYYY-MM-DD)라 문자열 그대로 비교하면 날짜 순서다
            if mv and not re.match(r"^\d{4}-\d{2}-\d{2}$", mv):
                errs.append("reports/%s/index.mdx: matrix_version은 날짜(YYYY-MM-DD)여야 한다(지금 %s)" % (n, mv))
            elif mv > CONFIG["version"]:
                errs.append("reports/%s/index.mdx: matrix_version %s가 matrix/config.yaml version %s보다 나중이다" % (n, mv, CONFIG["version"]))
            elif mv < CONFIG["version"]:
                behind.append("%s(%s)" % (n, mv or "없음"))
        files = cell_files(n)
        for cid in ORDER:
            if cid not in files:
                errs.append("reports/%s/%s/%s.mdx가 없다(시범 셀)" % (n, cid[:1], cid))
        for cid, p in files.items():
            where = os.path.relpath(p, ROOT)
            fm, _, _ = read_front(p)
            if fm.get("details") == []:
                errs.append("%s: 작성 중인 틀이다(pilot.py new가 만든 파일). 머리말 details와 본문을 채운다" % where)
                continue
            errs += _schema_errors(fm, rep_schema, where)
            if fm.get("cell") != cid:
                errs.append("%s: 머리말 cell이 파일 이름(%s)과 다르다" % (where, cid))
            if os.path.basename(os.path.dirname(p)) != cid[:1]:
                errs.append("%s: 원고는 축 폴더 reports/%s/%s/에 둔다" % (where, n, cid[:1]))
            if cid not in CELLS:
                errs.append("%s: matrix/cells/%s/%s.mdx이 없다" % (where, cid[:1], cid))
                continue
            det = fm.get("details") or []
            ids = [str(d.get("id")) for d in det]
            if any(i in SPECIAL for i in ids) and len(ids) > 1:
                errs.append("%s: not_implemented(미구현)·not_applicable(비적용)은 다른 상세와 함께 쓰지 않는다" % where)
            if UNKNOWN in ids:
                errs.append("%s: 원고에는 unknown(미확인)을 쓰지 않는다. 조사하지 않은 셀은 파일을 두지 않는다" % where)
            for d in det:
                iid = str(d.get("id"))
                if iid in SPECIAL:
                    pass
                elif not detail_name(iid) or not iid.startswith(cid + "."):
                    errs.append("%s: 정의에 없는 상세 %s(지운 상세라면 결정 기록이나 git 이력에서 옮긴 곳을 찾는다)" % (where, iid))
    linked = {(cid, str(d.get("id"))) for n in reported_servers() for cid, p in cell_files(n).items()
              for d in (read_front(p)[0].get("details") or [])}
    cand = [d["id"] for c in CELL_LIST if c.get("scope") for d in c.get("details") or []
            if (c["id"], d["id"]) not in linked and not d.get("seen_in")]
    notes = ["구현 사례(원고 연결·seen_in)가 없는 상세 %d개. 사례를 찾을 때까지 matrix/candidates.yaml로 옮긴다: %s"
             % (len(cand), " ".join(cand))] if cand else []
    # 후보 파일: 셀이 있고 후보마다 이름이 있으며 번호를 두지 않는다(번호는 셀로 올릴 때 붙인다)
    for cid, items in CANDIDATES.items():
        if cid not in CELLS:
            errs.append("matrix/candidates.yaml: 없는 셀 %s" % cid)
            continue
        own = {d.get("name") for d in CELLS[cid].get("details") or []}
        seen_names = set()
        for d in items or []:
            nm = d.get("name")
            where = "matrix/candidates.yaml: %s 후보 '%s'" % (cid, nm)
            if "id" in d:
                errs.append("%s에 번호(id)가 있다. 후보에는 번호를 두지 않고 셀로 올릴 때 붙인다" % where)
            if not nm:
                errs.append("matrix/candidates.yaml: %s 아래 후보에 name이 없다" % cid)
            elif nm in own:
                errs.append("%s가 셀 정의의 상세 이름과 같다. 셀로 옮겼으면 후보에서 지운다" % where)
            elif nm in seen_names:
                errs.append("%s가 두 번 있다" % where)
            other = sorted({x for x in OTHER_REF.findall(str(d.get("exclude") or "")) if x != cid})
            if other:
                warns.append("%s의 exclude가 다른 셀(%s)을 가리킨다. 다른 셀과 차이점은 셀의 boundary에 쓴다" % (where, ", ".join(other)))
            seen_names.add(nm)
    if behind:
        notes.append("매트릭스 %s 기준으로 다시 볼 서버(원고 기준 버전): %s. 바뀐 셀은 matrix/cells/의 git 이력에서 찾는다"
                     % (CONFIG["version"], " ".join(behind)))
    return errs, warns, notes


# ───────────────────────── 링크·문장 도구(fill·check만 쓴다) ─────────────────────────
def clones_dir():
    """분석 대상 서버의 클론을 모아 둔 폴더. 환경변수 DFIR_CLONES, 없으면 이 저장소의 부모 폴더다."""
    return os.environ.get("DFIR_CLONES") or os.path.dirname(ROOT)


@functools.lru_cache(None)
def v1():
    """경로·링크 변환(tools/linkify.py)과 문장 검사(tools/style_lint.py)를 읽는다.
    두 파일은 옛 매트릭스 저장소에서 옮겨 왔다. 서버 저장소 목록은 reports/<서버>/index.mdx로 채운다."""
    import linkify
    import style_lint
    _use_report_commits(linkify)
    return linkify, style_lint


def _use_report_commits(linkify):
    """서버의 저장소·기준 커밋은 reports/<서버>/index.mdx 머리말을 원본으로 쓰고, 클론은 clones_dir()/<서버>에서 찾는다."""
    for n in reported_servers():
        fm = read_front(os.path.join(report_dir(n), "index.mdx"))[0]
        if not fm.get("repo") or not fm.get("commit"):
            continue
        linkify.REPOS[n] = (fm["repo"], fm["commit"], os.path.join(clones_dir(), n))


def git_lines(root, sha, rel):
    r = subprocess.run(["git", "-C", root, "show", "%s:%s" % (sha, rel)], capture_output=True)
    if r.returncode:
        return None
    return r.stdout.decode("utf-8", "replace").split("\n")


def repo_by_slug():
    """slug -> [(sha, root, 서버)]. 다른 서버의 코드를 발췌해도 그 서버의 기준 커밋으로 확인한다."""
    linkify, _ = v1()
    out = {}
    for name, (slug, sha, root) in linkify.REPOS.items():
        out.setdefault(slug, []).append((sha, root, name))
    for name, extra in linkify.EXTRA.items():
        for slug, sha, root in extra:
            out.setdefault(slug, []).append((sha, root, name))
    return out


# ───────────────────────── fill ─────────────────────────
LANG = {".py": "python", ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".mjs": "javascript",
        ".go": "go", ".cs": "csharp", ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
        ".md": "markdown", ".mdx": "markdown", ".sh": "bash", ".ps1": "powershell", ".rs": "rust", ".sql": "sql"}
PH = re.compile(r"^" + re.escape(TERMS["excerpt"]) + r" (\S+):(\d+)-(\d+)\s*$")


def fill(name, only=None):
    linkify, _ = v1()
    for cid, p in cell_files(name).items():
        if only and cid not in only:
            continue
        src = open(p, encoding="utf-8", newline="").read()
        nl = "\r\n" if "\r\n" in src else "\n"
        out, n = [], 0
        for line in src.split(nl):
            m = PH.match(line)
            if not m:
                out.append(line)
                continue
            fp, a, b = m.group(1), int(m.group(2)), int(m.group(3))
            r, why = linkify.resolve(name, fp)
            if r is None:
                raise SystemExit("발췌 경로를 풀지 못함(%s): %s" % (why, fp))
            slug, sha, root, rel = r
            lines = git_lines(root, sha, rel)
            if lines is None or b > len(lines) or a < 1 or b < a:
                raise SystemExit("발췌 범위가 파일 밖이다: %s:%d-%d" % (rel, a, b))
            ext = os.path.splitext(rel)[1].lower()
            lang = LANG.get(ext, "dockerfile" if rel.endswith("Dockerfile") else "text")
            body = [l.rstrip("\r") for l in lines[a - 1:b]]
            url = "https://github.com/%s/blob/%s/%s#L%d-L%d" % (slug, sha, rel.replace(" ", "%20"), a, b)
            out += ["```" + lang] + body + ["```", "", "[`%s:%d-%d`](%s)" % (rel, a, b, url)]
            n += 1
        open(p, "w", encoding="utf-8", newline="").write(nl.join(out))
        hit, missing, guessed = linkify.run(name, p)
        print("%s/%s: 발췌 %d개 채움, 링크 %d개 변환, 복원 %d, 없는 경로 %d" % (name, cid, n, hit, len(guessed), len(missing)))
        for fp in missing:
            print("    [없음]", fp)


# ───────────────────────── renumber ─────────────────────────
def renumber(name, only=None):
    for cid, p in cell_files(name).items():
        if only and cid not in only:
            continue
        src = open(p, encoding="utf-8", newline="").read()
        nl = "\r\n" if "\r\n" in src else "\n"
        text = src.replace("\r\n", "\n")
        i = text.find(EVID_HEAD)
        if i < 0:
            continue
        body, evid = text[:i], text[i + len(EVID_HEAD):]
        m = FRONT.match(body)
        fm_txt, body = (m.group(0), body[m.end():]) if m else ("", body)
        first = []
        for x in MARK.findall(body):
            if int(x) not in first:
                first.append(int(x))
        mp = {old: new for new, old in enumerate(first, 1)}
        body = MARK.sub(lambda m: "[\x00%d]" % mp[int(m.group(1))] if int(m.group(1)) in mp else m.group(0), body)
        body = body.replace("[\x00", "[")
        lines = evid.split("\n")
        start = next((k for k, l in enumerate(lines) if re.match(r"^\[\d+\] ", l)), len(lines))
        lead, rest = lines[:start], lines[start:]
        order, entries = split_evidence(rest)
        unused = [o for o in order if o not in mp]
        if unused:
            print("  [%s/%s] 본문에서 쓰지 않는 근거를 뺀다: %s" % (name, cid, unused))
        new = []
        for old in first:
            if old not in entries:
                raise SystemExit("%s/%s: 근거 [%d]가 없다" % (name, cid, old))
            e = list(entries[old])
            e[0] = re.sub(r"^\[\d+\] ", "[%d] " % mp[old], e[0])
            while e and not e[-1].strip():
                e.pop()
            new += e + [""]
        res = (fm_txt + body + EVID_HEAD + "\n".join(lead + new)).rstrip("\n") + "\n"
        open(p, "w", encoding="utf-8", newline="").write(res.replace("\n", nl))
    print("%s: 표지 번호를 다시 매겼다" % name)


# ───────────────────────── new ─────────────────────────
INDEX_TEMPLATE = """---
server: {name}
repo: {repo}
commit: {commit}
matrix_version: "{version}"                          # 이 원고가 기준으로 삼은 매트릭스 정의 버전
---

# {name} 원고

이 파일은 서버 개요다. 셀마다 이 폴더 아래 축 폴더의 `<축>/<셀ID>.mdx`에 쓴다.
셀과 상세 항목의 정의는 `matrix/cells/<축>/<셀ID>.mdx`를 따른다.
상세 항목마다 **구현**을 쓰고 그 방식이 적용되지 않는 경로나 조건이 있으면 **한계**를 따로 쓴다.
본문의 [번호]는 그 파일 끝 **근거**의 같은 번호를 가리킨다.

**기준 커밋.** [`{short}`](https://github.com/{repo}/tree/{commit})({date}).
줄 번호는 모두 이 커밋 기준이다.

**범위.** 작성 중이다.

**확인 방법.** 작성 중이다.
"""

CELL_TEMPLATE = """---
cell: {cid}
details: []
---

# {cid} {name}

{{/* 작성 중이다. 다 쓰면 이 주석을 지운다.
머리말 details에 이 서버가 해당하는 상세를 소제목 차례대로 적는다. 어느 상세에도 해당하지 않으면 not_implemented나 not_applicable 하나를 적는다.
상세마다 "### <상세 번호> <상세 이름>" 소제목 아래 **구현.** 단락을 쓰고, 그 방식이 적용되지 않는 경로나 조건이 있으면 **한계.** 단락을 쓴다.
미구현·비적용이면 "### 미구현"(또는 "### 비적용") 아래 **판단.** 단락을 쓴다.
확인 사항: {question}{applies}
상세: {details} */}}

### 근거
"""


def new(name, cells, repo=None, commit=None):
    """새 서버 원고의 틀. 틀 파일은 details가 비어 화면에서 미확인으로 보이고 validate가 작성 중으로 알린다."""
    d = report_dir(name)
    idx = os.path.join(d, "index.mdx")
    made = []
    if not os.path.exists(idx):
        if not repo or not commit or not re.match(r"^[0-9a-f]{40}$", commit):
            raise SystemExit("새 서버는 --repo 소유자/이름 --commit <40자 커밋>을 준다")
        r = subprocess.run(["git", "-C", os.path.join(clones_dir(), name), "show", "-s", "--format=%cs", commit],
                           capture_output=True, text=True)
        date = r.stdout.strip() if r.returncode == 0 else "커밋 날짜"
        os.makedirs(d, exist_ok=True)
        open(idx, "w", encoding="utf-8", newline="\n").write(INDEX_TEMPLATE.format(
            name=name, repo=repo, commit=commit, short=commit[:7], date=date, version=CONFIG["version"]))
        made.append(os.path.relpath(idx, ROOT))
        if name not in CONFIG["servers"]:
            p = os.path.join(MATRIX, "config.yaml")
            text = open(p, encoding="utf-8").read()
            last = "- %s\n" % CONFIG["servers"][-1]
            text = text.replace(last, last + "- %s\n" % name, 1)
            open(p, "w", encoding="utf-8", newline="\n").write(text)
            made.append("matrix/config.yaml servers에 %s를 더함" % name)
    want = [c["id"] for c in CELL_LIST] if cells == ["all"] else (cells or ORDER)
    for cid in want:
        if cid not in CELLS:
            raise SystemExit("없는 셀: %s" % cid)
        p = os.path.join(d, cid[0], cid + ".mdx")
        if os.path.exists(p):
            continue
        c = CELLS[cid]
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w", encoding="utf-8", newline="\n").write(CELL_TEMPLATE.format(
            cid=cid, name=c["name"], question=c["question"],
            applies=("\n조건부 셀이다. 적용 대상: %s 적용 대상이 아니면 not_applicable 하나를 적는다." % c.get("applies_to", ""))
            if c.get("conditional") else "",
            details=", ".join("%s %s" % (x["id"], x["name"]) for x in c.get("details") or [])))
        made.append(os.path.relpath(p, ROOT))
    for m in made:
        print("  만듦:", m)
    print("%s: 틀 %d개. 다 쓴 셀은 fill → check 차례로 돌린다" % (name, len(made)))


# ───────────────────────── check ─────────────────────────
LINK = re.compile(r"\]\((https://github\.com/([^/]+/[^/]+)/blob/([0-9a-f]{40})/([^#)]+)(?:#L(\d+)(?:-L(\d+))?)?)\)")
SENT = re.compile(r"(?<=[다음함됨]\.)\s+|(?<=\]\.)\s+|(?<=\))\.\s+")


def check(name, slugs, only=None):
    linkify, style_lint = v1()
    errs, warns = [], []
    if not os.path.isdir(report_dir(name)):
        return ["원고 폴더 없음: reports/%s" % name], []
    head_fm, head, secs = parse(name)
    sha0 = str(head_fm.get("commit", ""))
    if not sha0:
        errs.append("index.mdx 머리말에 commit이 없다")
    elif sha0[:7] not in head:
        errs.append("index.mdx 본문의 기준 커밋 링크가 머리말 commit(%s)과 다르다" % sha0[:7])
    root = linkify.REPOS.get(name, ("", "", ""))[2]
    if sha0 and subprocess.run(["git", "-C", root, "cat-file", "-e", sha0 + "^{commit}"], capture_output=True).returncode:
        errs.append("클론 %s에 기준 커밋 %s가 없다(git fetch를 한 번 한다)" % (linkify.REPOS[name][2], sha0[:7]))
    for cid, p in cell_files(name).items():
        if only and cid not in only:
            continue
        where = "%s.mdx" % cid
        hit, missing, _ = linkify.run(name, p, write=False)
        if hit:
            errs.append("%s 링크로 바꾸지 않은 `경로:줄`이 %d개 있다(fill을 돌린다)" % (where, hit))
        for fp in missing:
            errs.append("%s 저장소에 없는 경로: %s" % (where, fp))
        text = open(p, encoding="utf-8").read()
        for m in LINK.finditer(text):
            url, slug, sha, rel, a, b = m.groups()
            rel = rel.replace("%20", " ")
            if slug not in slugs:
                continue
            cand = [x for x in slugs[slug] if x[0] == sha]
            if not cand:
                errs.append("%s 기준 커밋이 아닌 링크: %s" % (where, url))
                continue
            if a:
                lines = git_lines(cand[0][1], sha, rel)
                if lines is None:
                    errs.append("%s 기준 커밋에 없는 파일: %s" % (where, rel))
                    continue
                n = len(lines) - (1 if lines and lines[-1] == "" else 0)
                if int(b or a) > n:
                    errs.append("%s 줄 범위가 파일 밖이다: %s#L%s-L%s (파일 %d줄)" % (where, rel, a, b, n))
        e, w = check_cell(cid, secs[cid], slugs)
        errs += e
        warns += w + word_warnings(p)
        fm_lines = read_front(p)[2]
        clean, fence = [], False
        for k, ln in enumerate(text.split("\n")):
            if k < fm_lines or ln.startswith("```"):
                if ln.startswith("```"):
                    fence = not fence
                clean.append("")
                continue
            clean.append("" if fence else ln)
        tmp = p + ".lint.tmp"
        open(tmp, "w", encoding="utf-8").write("\n".join(clean))
        try:
            for no, rule, ctx in style_lint.lint(tmp):
                errs.append("%s 문장 %s줄 %s: %s" % (where, no or "-", rule, ctx.strip()))
        finally:
            os.remove(tmp)
    return errs, warns


def check_cell(cid, s, slugs):
    errs, warns = ["%s %s" % (cid, e) for e in s["errors"]], []
    want = "%s %s" % (cid, CELLS[cid]["name"])
    if s["title"] and s["title"] != want:
        warns.append("%s 제목 '%s'가 셀 이름과 다르다('%s'로 고친다)" % (cid, s["title"], want))
    items = s["items"]
    if not items:
        return errs + ["%s 머리말 details가 없다" % cid], warns
    if [u["id"] for u in s["units"]] != [it["id"] for it in items]:
        errs.append("%s 소제목 %s가 머리말 details %s와 차례까지 같아야 한다"
                    % (cid, [u["id"] for u in s["units"]], [it["id"] for it in items]))
    for it, u in zip(items, s["units"]):
        if it["id"] not in SPECIAL and u["label"] != u["id"] and u["label"] != it["label"]:
            warns.append("%s 소제목 '%s'의 이름이 정의 '%s'와 다르다" % (cid, u["label"], it["label"]))
        labs = [b["label"] for b in u["blocks"]]
        if it["id"] in SPECIAL:
            ok_l = [[TERMS["judge"]]]
        else:
            ok_l = [[TERMS["impl"]], [TERMS["impl"], TERMS["limit"]]]
        if labs not in ok_l:
            errs.append("%s '%s'의 단락 머리가 %s 가운데 하나여야 한다(지금 %s). **%s.**는 방식이 적용되지 않는 경로가 있을 때만 쓴다"
                        % (cid, it["label"], " 또는 ".join(map(str, ok_l)), labs, TERMS["limit"]))
        for b in u["blocks"]:
            if not MARK.search(block_text(b)):
                errs.append("%s '%s' %s에 근거 표지가 없다" % (cid, it["label"], b["label"]))
            for sent in SENT.split(block_text(b)):
                if "`" in sent and not MARK.search(sent):
                    warns.append("%s 표지 없는 코드 문장: %s" % (cid, sent.strip()[:70]))
            # 본문에는 셀·상세 번호를 쓰지 않는다. 번호는 머리말과 소제목에만 둔다
            # 번호 없는 "E01"은 증거 형식(EWF) 이름으로 흔히 쓰여 뺀다
            for x in sorted({m.group(0) for m in CELL_REF.finditer(block_text(b))
                             if "." in m.group(0) or (m.group(1) != cid and m.group(0) != "E01")}):
                warns.append("%s '%s' 본문에 번호 %s가 있다. 번호는 머리말과 소제목에만 쓰고 본문에는 사실만 쓴다" % (cid, it["label"], x))
            for ln in prose_lines(b["lines"]):
                if sentences_in_line(ln) > 1:
                    errs.append("%s '%s' 한 줄에 문장이 둘 이상이다(문장 하나에 한 줄): %s" % (cid, it["label"], ln[:50]))
    body = " ".join(block_text(b) for u in s["units"] for b in u["blocks"])
    first = []
    for x in MARK.findall(body):
        if int(x) not in first:
            first.append(int(x))
    if first != list(range(1, len(first) + 1)):
        errs.append("%s 표지 번호가 처음 나온 차례로 1부터 이어지지 않는다(renumber): %s" % (cid, first))
    if s["evid_order"] != list(range(1, len(s["evid_order"]) + 1)):
        errs.append("%s 근거 항목 번호가 1부터 차례가 아니다: %s" % (cid, s["evid_order"]))
    if set(first) != set(s["evid_order"]):
        errs.append("%s 본문 표지 %s와 근거 항목 %s가 맞지 않는다" % (cid, sorted(set(first)), s["evid_order"]))
    warns += ["%s %s" % (cid, w) for w in excerpt_warnings(s["evid"], slugs)]
    for n_, lines in s["evid"].items():
        e_text = "\n".join(lines)
        if "](http" not in e_text and "(실행 확인" not in e_text:
            errs.append("%s 근거 [%d]에 링크가 없다" % (cid, n_))
        errs += ["%s 근거 [%d] %s" % (cid, n_, e) for e in check_blocks(lines, slugs)]
        for ln in prose_lines([re.sub(r"^\[\d+\] ", "", lines[0])] + lines[1:]):
            if sentences_in_line(ln) > 1:
                errs.append("%s 근거 [%d] 한 줄에 문장이 둘 이상이다(문장 하나에 한 줄): %s" % (cid, n_, ln[:50]))
    return errs, warns


EXCERPT_MAX = 30          # 이 줄 수 이하의 한 범위는 발췌를 붙인다(reports/README.mdx 근거 규칙)
EXCERPT_LINK_ONLY = 3     # 코드 위치가 이만큼 이상이면 링크만 두어도 된다
NON_CODE = (".md", ".txt", ".rst")


def excerpt_warnings(evid, slugs):
    """발췌를 붙여야 하는데 링크만 둔 근거를 찾는다.
    링크만 두어도 되는 근거: 코드가 아닌 근거, 코드 위치 3곳 이상, 30줄을 넘는 범위, 같은 파일의 다른 근거에 이미 발췌한 범위."""
    shown, links = [], {}
    for n_, lines in evid.items():
        has_block = any(l.startswith("```") for l in lines)
        after_block, fence, found = False, False, []
        for ln in lines:
            if ln.startswith("```"):
                fence = not fence
                after_block = not fence
                continue
            if fence:
                continue
            for m in LINK.finditer(ln):
                url, slug, sha, rel, a, b = m.groups()
                if slug not in slugs or not a:
                    continue
                rng = (rel.replace("%20", " "), int(a), int(b or a))
                (shown if after_block else found).append(rng)
            if ln.strip():
                after_block = False
        links[n_] = (has_block, found)
    out = []
    for n_, (has_block, found) in links.items():
        code = [r for r in found if not r[0].lower().endswith(NON_CODE)]
        if has_block or not code or len(code) >= EXCERPT_LINK_ONLY:
            continue
        need = [r for r in code if r[2] - r[1] + 1 <= EXCERPT_MAX
                and not any(r[0] == s[0] and s[1] <= r[1] and r[2] <= s[2] for s in shown)]
        if need:
            out.append("근거 [%d]에 발췌가 없다(%d줄 이하 한 범위는 `@발췌`를 둔다): %s"
                       % (n_, EXCERPT_MAX, ", ".join("%s:%d-%d" % r for r in need)))
    return out


def check_blocks(lines, slugs):
    """근거 항목 안의 코드 블록이 바로 뒤 링크의 기준 커밋 줄과 글자 그대로 같은지 본다."""
    errs = []
    i = 0
    while i < len(lines):
        if not lines[i].startswith("```"):
            i += 1
            continue
        j = i + 1
        while j < len(lines) and not lines[j].startswith("```"):
            j += 1
        block = lines[i + 1:j]
        k = j + 1
        while k < len(lines) and not lines[k].strip():
            k += 1
        m = LINK.search(lines[k]) if k < len(lines) else None
        if not m or not m.group(5):
            errs.append("코드 블록 바로 뒤에 줄 링크가 없다")
            i = j + 1
            continue
        url, slug, sha, rel, a, b = m.groups()
        rel = rel.replace("%20", " ")
        cand = [x for x in slugs.get(slug, []) if x[0] == sha]
        if not cand:
            errs.append("발췌 링크의 저장소·커밋을 모른다: %s" % url)
        else:
            src = git_lines(cand[0][1], sha, rel) or []
            want = [l.rstrip("\r") for l in src[int(a) - 1:int(b or a)]]
            if block != want:
                diff = next((n for n, (x, y) in enumerate(zip(block, want)) if x != y), min(len(block), len(want)))
                errs.append("발췌가 기준 커밋 %s:%s-%s와 다르다(%d번째 줄부터, 발췌 %d줄·원문 %d줄)"
                            % (rel, a, b, diff + 1, len(block), len(want)))
        i = k + 1
    return errs


# ───────────────────────── build ─────────────────────────
def build_data():
    """화면 데이터(dict)를 만든다."""
    names = list(CONFIG["servers"])
    reports = {n: parse(n)[2] for n in reported_servers()}
    link = {}
    for n in names:
        link[n] = {}
        for c in CELL_LIST:
            s = reports.get(n, {}).get(c["id"])
            if not s or not s["items"]:
                link[n][c["id"]] = [{"상세": UNKNOWN}]
                continue
            link[n][c["id"]] = [{"상세": it["id"]} for it in s["items"]]
    cells_out = []
    for c in CELL_LIST:
        defined = bool(c.get("scope"))
        items = [{"id": d["id"], "name": d["name"], "inc": d.get("include", ""), "exc": d.get("exclude", ""),
                  "seen": list(d.get("seen_in") or [])} for d in c.get("details") or []]
        meaning = {NOT_IMPL: c.get("not_implemented", ""), NOT_APPL: c.get("not_applicable", "")}
        rows = []
        # 미확인은 행으로 두지 않고 셀의 studied(조사한 서버 수)로 보인다
        for it in items + [{"id": x, "name": SPECIAL_NAME[x], "inc": meaning[x], "exc": "", "special": True} for x in (NOT_IMPL, NOT_APPL)]:
            members = [{"s": n} for n in names for r in link[n][c["id"]] if r["상세"] == it["id"]]
            seen = [x for x in it.get("seen", []) if x not in [m["s"] for m in members]]
            row = {"id": it["id"], "name": it["name"], "inc": it["inc"], "exc": it["exc"], "m": members, "seen": seen}
            if it["id"] in SPECIAL:
                row["special"] = True
            else:
                row["cand"] = not members and not seen
            rows.append(row)
        studied = sum(1 for n in names if link[n][c["id"]][0]["상세"] != UNKNOWN)
        cells_out.append({"id": c["id"], "name": c["name"], "axis": c["id"][0], "q": c["question"],
                          "cond": bool(c.get("conditional")), "scope": c.get("applies_to", ""),
                          "note": c.get("boundary", ""), "defined": defined, "dscope": c.get("scope", ""),
                          "studied": studied, "rows": rows})
    return {"axes": {a["id"]: a["name"] for a in AXES}, "cells": cells_out, "samples": names,
            "pilot": {"cells": ORDER, "servers": list(reports)}}


def build():
    import datetime
    data = build_data()
    # 내용이 같으면 파일을 다시 쓰지 않는다. 다시 쓰면 개발 서버가 바뀐 줄 알고 화면을 다시 컴파일한다
    try:
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        old.pop("updated_at", None)
    except (OSError, ValueError):
        old = None
    if old == data:
        print("%s 그대로 (바뀐 내용 없음)" % os.path.relpath(OUT, ROOT))
        return data
    data["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("%s 만듦 (셀 %d, 조건부 %d, 서버 %d)"
          % (os.path.relpath(OUT, ROOT), len(data["cells"]), sum(1 for c in data["cells"] if c["cond"]), len(data["samples"])))
    return data


def _print(title, errs, warns=()):
    print("%s: 오류 %d · 경고 %d" % (title, len(errs), len(warns)))
    for x in errs:
        print("  [오류]", x)
    for x in warns:
        print("  [경고]", x)


def target(arg):
    """'서버' 또는 '서버:셀,셀' → (서버, 셀 집합 또는 None). 여러 사람이 한 서버의 다른 셀을 나눠 고칠 때 쓴다."""
    name, _, cells = arg.partition(":")
    return name, (set(cells.split(",")) if cells else None)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "validate":
        e, w, notes = validate()
        _print("validate", e, w)
        for x in notes:
            print("  [알림]", x)
        sys.exit(1 if e else 0)
    elif cmd == "check":
        e, w, notes = validate()
        _print("validate", e, w)
        total = len(e)
        slugs = repo_by_slug()
        for a in args or reported_servers():
            n, only = target(a)
            e, w = check(n, slugs, only)
            total += len(e)
            _print(n, e, w)
        sys.exit(1 if total else 0)
    elif cmd == "build":
        build()
    elif cmd == "fill":
        for a in args:
            fill(*target(a))
    elif cmd == "renumber":
        for a in args:
            renumber(*target(a))
    elif cmd == "new":
        if not args:
            raise SystemExit(__doc__)
        opts = {"--repo": None, "--commit": None}
        rest, it = [], iter(args[1:])
        for a in it:
            if a in opts:
                opts[a] = next(it, None)
            else:
                rest.append(a)
        new(args[0], rest, opts["--repo"], opts["--commit"])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    # Windows 콘솔(cp949 등)이 못 그리는 글자가 출력에 있어도 멈추지 않게 한다. 파일은 늘 utf-8로 읽고 쓴다
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(errors="replace")
    main()
