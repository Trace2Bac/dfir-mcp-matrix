# -*- coding: utf-8 -*-
"""매트릭스 도구. 저장소 어디서든 돌린다(Windows는 PYTHONUTF8=1).

  python tools/pilot.py validate          셀·축·설정·원고 머리말을 스키마와 서로 대조한다(외부 저장소 없이 돈다. CI가 돌린다)
  python tools/pilot.py check [서버[:셀,셀] ...]   validate + 원고 형식·표지·근거·발췌 원문 일치·문장 점검(옛 저장소와 서버 클론이 있어야 한다)
  python tools/pilot.py build             _site/에 화면(index.html)과 데이터(data/matrix.json)를 만든다
  python tools/pilot.py serve [포트]       build 뒤 _site/를 http://localhost:포트 로 띄운다(기본 8000)
  python tools/pilot.py fill <서버>        원고의 `@발췌 경로:시작-끝` 줄을 기준 커밋 코드 블록과 링크로 바꾸고 백틱 `경로:줄`을 링크로 바꾼다
  python tools/pilot.py renumber <서버>    셀 파일마다 표지 번호를 본문에 처음 나온 차례로 다시 매기고 근거 항목을 그 차례로 옮긴다

원본:
  matrix/axes.yaml           축 차례·이름
  matrix/cells/<ID>.yaml     셀 하나의 질문·상세 정의
  matrix/config.yaml         화면에 보일 서버, 시범 셀
  reports/<서버>/index.md    서버 원고의 머리(저장소·기준 커밋)
  reports/<서버>/<셀>.md     서버의 셀 하나. 머리말(front matter)에 어느 상세에 드는지, 본문에 구현·예외·근거
형식은 matrix/README.md와 reports/README.md에 있다.
"""
import functools
import glob
import html
import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MATRIX = os.path.join(ROOT, "matrix")
REPORTS = os.path.join(ROOT, "reports")
SITE_SRC = os.path.join(ROOT, "site")
OUT = os.path.join(ROOT, "_site")

# ── 원고 표시어 ── 원고(reports/)·화면 데이터에 쓰는 낱말. 다국어로 나눌 때 여기와 site/index.html의 STRINGS만 언어별로 늘린다.
TERMS = {
    "not_implemented": "미구현",   # 머리말 details의 id 값
    "not_applicable": "비적용",
    "unknown": "미확인",            # 화면에만 쓴다
    "impl": "구현",                 # 단락 머리 **구현.**
    "exc": "예외",                  # 단락 머리 **예외.**
    "judge": "판단",                # 미구현·비적용의 단락 머리 **판단.**
    "evidence": "근거",             # 소제목 ### 근거
    "excerpt": "@발췌",             # 근거의 발췌 지시어
}
NOT_IMPL, NOT_APPL, UNKNOWN = TERMS["not_implemented"], TERMS["not_applicable"], TERMS["unknown"]
SPECIAL = (NOT_IMPL, NOT_APPL, UNKNOWN)
EVID_HEAD = "\n### %s\n" % TERMS["evidence"]
CELL_ID = re.compile(r"^[A-Z]\d\d$")


# ───────────────────────── 원본 읽기 ─────────────────────────
def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_matrix():
    """축·셀·설정을 읽는다. 셀은 축 차례, 같은 축 안에서는 ID 차례다."""
    axes = load_yaml(os.path.join(MATRIX, "axes.yaml"))["axes"]
    order = {a["id"]: i for i, a in enumerate(axes)}
    cells = []
    for p in glob.glob(os.path.join(MATRIX, "cells", "*.yaml")):
        c = load_yaml(p) or {}
        c["_file"] = os.path.relpath(p, ROOT)
        cells.append(c)
    cells.sort(key=lambda c: (order.get(str(c.get("id", "?"))[0], 99), str(c.get("id"))))
    config = load_yaml(os.path.join(MATRIX, "config.yaml"))
    return axes, cells, config


AXES, CELL_LIST, CONFIG = load_matrix()
CELLS = {c.get("id"): c for c in CELL_LIST}
ORDER = list(CONFIG["pilot_cells"])


def detail_name(iid):
    cell = CELLS.get(iid.split(".")[0], {})
    for d in cell.get("details", []):
        if d["id"] == iid:
            return d["name"]
    return None


def retired_detail(iid):
    """지운 상세면 그 항목(dict)을 돌려준다."""
    for r in CELLS.get(iid.split(".")[0], {}).get("retired") or []:
        if r["id"] == iid:
            return r
    return None


FRONT = re.compile(r"\A---\n(.*?)\n---\n", re.S)


def read_front(path):
    """마크다운 파일의 머리말(YAML)과 본문을 나눈다. 본문 줄 번호를 맞추려고 머리말 줄 수도 돌려준다."""
    text = open(path, encoding="utf-8").read().replace("\r\n", "\n")
    m = FRONT.match(text)
    if not m:
        return {}, text, 0
    return (yaml.safe_load(m.group(1)) or {}), text[m.end():], m.group(0).count("\n")


def report_dir(name):
    return os.path.join(REPORTS, name)


def cell_files(name):
    """서버 폴더의 셀 파일. {셀ID: 경로}"""
    out = {}
    for p in sorted(glob.glob(os.path.join(report_dir(name), "*.md"))):
        stem = os.path.splitext(os.path.basename(p))[0]
        if stem != "index" and CELL_ID.match(stem):
            out[stem] = p
    return out


def reported_servers():
    return [n for n in CONFIG["servers"] if os.path.isdir(report_dir(n))]


# ───────────────────────── 원고 한 파일 읽기 ─────────────────────────
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
        sec["items"].append({"id": iid, "dagger": bool(d.get("exception")),
                             "label": iid if iid in SPECIAL else "%s %s" % (iid, detail_name(iid) or "")})
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
        unit, cur = {"label": h, "id": h.split(" ", 1)[0], "blocks": []}, None
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
    """서버 원고 전체. (index.md 머리말과 본문, {셀ID: 셀 파일 내용})"""
    idx = os.path.join(report_dir(name), "index.md")
    head_fm, head, _ = read_front(idx) if os.path.exists(idx) else ({}, "", 0)
    return head_fm, head, {cid: parse_cell(p) for cid, p in cell_files(name).items()}


def block_text(b):
    return " ".join(l for l in b["lines"] if l.strip())


def paragraphs(lines):
    """빈 줄로 나뉜 단락마다 줄 목록을 돌려준다. 원고는 문장 하나를 한 줄에 쓰므로 줄이 곧 문장이다."""
    out, cur = [], []
    for l in lines:
        if l.strip():
            cur.append(l.strip())
        elif cur:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


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
    errs += _schema_errors({"axes": AXES}, _schema("axes.schema.json"), "matrix/axes.yaml")
    errs += _schema_errors(CONFIG, _schema("config.schema.json"), "matrix/config.yaml")
    cell_schema = _schema("cell.schema.json")
    axis_ids = [a["id"] for a in AXES]
    if len(set(axis_ids)) != len(axis_ids):
        errs.append("matrix/axes.yaml: 축 id가 겹친다")
    seen = set()
    for c in CELL_LIST:
        f = c["_file"]
        body = {k: v for k, v in c.items() if k != "_file"}
        errs += _schema_errors(body, cell_schema, f)
        cid = str(c.get("id"))
        if os.path.splitext(os.path.basename(f))[0] != cid:
            errs.append("%s: 파일 이름과 id(%s)가 다르다" % (f, cid))
        if cid in seen:
            errs.append("%s: 셀 id가 겹친다" % f)
        seen.add(cid)
        if cid[:1] not in axis_ids:
            errs.append("%s: 첫 글자 %s가 matrix/axes.yaml의 축이 아니다" % (f, cid[:1]))
        ids = [str(d.get("id")) for d in c.get("details") or []]
        gone = [str(r.get("id")) for r in c.get("retired") or []]
        for iid in ids + gone:
            if not iid.startswith(cid + "."):
                errs.append("%s: 상세 번호 %s가 셀 번호 %s로 시작하지 않는다" % (f, iid, cid))
        for iid in set(x for x in ids + gone if (ids + gone).count(x) > 1):
            errs.append("%s: 상세 번호 %s가 겹친다(지운 번호는 다시 쓰지 않는다)" % (f, iid))
        live = {str(d.get("id")) for x in CELL_LIST for d in x.get("details") or []}   # 셀을 나누면 다른 셀의 상세로 옮긴다
        for r in c.get("retired") or []:
            if r.get("merged_into") and r["merged_into"] not in live:
                errs.append("%s: retired %s의 merged_into %s가 지금 상세에 없다" % (f, r["id"], r["merged_into"]))
        if c.get("conditional") and not c.get("applies_to"):
            errs.append("%s: 조건부 셀에 applies_to가 없다" % f)
        if c.get("scope"):
            for d in c.get("details") or []:
                if not d.get("include") or not d.get("exclude"):
                    warns.append("%s: %s에 include·exclude가 아직 없다" % (f, d.get("id")))
            for k in ("not_implemented", "not_applicable"):
                if not c.get(k):
                    errs.append("%s: 정의를 쓴 셀인데 %s가 없다" % (f, k))
        for d in c.get("details") or []:
            for sv in d.get("seen_in") or []:
                if sv not in CONFIG["servers"]:
                    warns.append("%s: %s의 seen_in 서버 %s가 matrix/config.yaml servers에 없다" % (f, d.get("id"), sv))
    for cid in ORDER:
        if cid not in CELLS:
            errs.append("matrix/config.yaml: 시범 셀 %s의 셀 파일이 없다" % cid)
        elif not CELLS[cid].get("scope"):
            errs.append("matrix/config.yaml: 시범 셀 %s에 정의(scope·not_implemented·not_applicable·include·exclude)가 없다" % cid)
    rep_schema = _schema("report.schema.json")
    for n in reported_servers():
        idx = os.path.join(report_dir(n), "index.md")
        if not os.path.exists(idx):
            errs.append("reports/%s/index.md가 없다" % n)
        else:
            fm, _, _ = read_front(idx)
            if fm.get("server") != n:
                errs.append("reports/%s/index.md: 머리말 server가 %s가 아니다" % (n, n))
        files = cell_files(n)
        for cid in ORDER:
            if cid not in files:
                errs.append("reports/%s/%s.md가 없다(시범 셀)" % (n, cid))
        for cid, p in files.items():
            where = os.path.relpath(p, ROOT)
            fm, _, _ = read_front(p)
            errs += _schema_errors(fm, rep_schema, where)
            if fm.get("cell") != cid:
                errs.append("%s: 머리말 cell이 파일 이름(%s)과 다르다" % (where, cid))
            if cid not in CELLS:
                errs.append("%s: matrix/cells/%s.yaml이 없다" % (where, cid))
                continue
            det = fm.get("details") or []
            ids = [str(d.get("id")) for d in det]
            if any(i in SPECIAL for i in ids) and len(ids) > 1:
                errs.append("%s: 미구현·비적용은 다른 상세와 함께 쓰지 않는다" % where)
            if UNKNOWN in ids:
                errs.append("%s: 원고에는 미확인을 쓰지 않는다. 조사하지 않은 셀은 파일을 두지 않는다" % where)
            for d in det:
                iid = str(d.get("id"))
                if iid in SPECIAL:
                    if d.get("exception"):
                        errs.append("%s: %s에는 exception을 붙이지 않는다" % (where, iid))
                elif retired_detail(iid):
                    r = retired_detail(iid)
                    errs.append("%s: %s(%s)는 지운 상세다%s" % (where, iid, r["name"],
                                ". %s로 합쳤다" % r["merged_into"] if r.get("merged_into") else ""))
                elif not detail_name(iid) or not iid.startswith(cid + "."):
                    errs.append("%s: 정의에 없는 상세 %s" % (where, iid))
    linked = {(cid, str(d.get("id"))) for n in reported_servers() for cid, p in cell_files(n).items()
              for d in (read_front(p)[0].get("details") or [])}
    cand = [d["id"] for c in CELL_LIST if c.get("scope") for d in c.get("details") or []
            if (c["id"], d["id"]) not in linked and not d.get("seen_in")]
    notes = ["정의를 쓴 셀에서 구현 사례(원고 연결·seen_in)가 없는 상세 %d개(화면에 후보로 보인다): %s"
             % (len(cand), " ".join(cand))] if cand else []
    return errs, warns, notes


# ───────────────────────── 옛 저장소 도구(fill·check만 쓴다) ─────────────────────────
@functools.lru_cache(None)
def v1():
    """옛 매트릭스 저장소(Claude outputs)의 linkify·style_lint를 읽는다.
    환경변수 DFIR_V1 → 이 저장소 옆의 'Claude outputs' 폴더 순서로 본다."""
    cands = [os.environ.get("DFIR_V1"), os.path.join(os.path.dirname(ROOT), "Claude outputs")]
    for c in cands:
        if c and os.path.isfile(os.path.join(c, "tools", "linkify.py")):
            sys.path.insert(0, os.path.join(c, "tools"))
            import linkify
            import style_lint
            _use_report_commits(linkify)
            return linkify, style_lint
    raise SystemExit("fill·check에는 옛 저장소(Claude outputs)가 있어야 한다. 환경변수 DFIR_V1에 그 폴더 경로를 준다.")


def _use_report_commits(linkify):
    """서버의 저장소·기준 커밋은 이 저장소의 reports/<서버>/index.md 머리말을 원본으로 쓴다.
    옛 저장소 판정 YAML의 값은 클론 위치를 찾을 때만 쓴다."""
    clones = os.environ.get("DFIR_CLONES") or os.path.dirname(ROOT)
    for n in reported_servers():
        fm = read_front(os.path.join(report_dir(n), "index.md"))[0]
        if not fm.get("repo") or not fm.get("commit"):
            continue
        old = linkify.REPOS.get(n)
        root = old[2] if old else os.path.join(clones, n)
        linkify.REPOS[n] = (fm["repo"], fm["commit"], root)


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
        ".md": "markdown", ".sh": "bash", ".ps1": "powershell", ".rs": "rust", ".sql": "sql"}
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
        errs.append("index.md 머리말에 commit이 없다")
    elif sha0[:7] not in head:
        errs.append("index.md 본문의 기준 커밋 링크가 머리말 commit(%s)과 다르다" % sha0[:7])
    root = linkify.REPOS.get(name, ("", "", ""))[2]
    if sha0 and subprocess.run(["git", "-C", root, "cat-file", "-e", sha0 + "^{commit}"], capture_output=True).returncode:
        errs.append("클론 %s에 기준 커밋 %s가 없다(git fetch를 한 번 한다)" % (linkify.REPOS[name][2], sha0[:7]))
    for cid, p in cell_files(name).items():
        if only and cid not in only:
            continue
        where = "%s.md" % cid
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
        warns += w
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
            want_l = [TERMS["judge"]]
        else:
            want_l = [TERMS["impl"], TERMS["exc"]] if it["dagger"] else [TERMS["impl"]]
        if labs != want_l:
            errs.append("%s '%s'의 머리말이 %s여야 한다(지금 %s). 예외는 exception: true일 때만, 그때는 반드시 쓴다"
                        % (cid, it["label"], want_l, labs))
        for b in u["blocks"]:
            if not MARK.search(block_text(b)):
                errs.append("%s '%s' %s에 근거 표지가 없다" % (cid, it["label"], b["label"]))
            for sent in SENT.split(block_text(b)):
                if "`" in sent and not MARK.search(sent):
                    warns.append("%s 표지 없는 코드 문장: %s" % (cid, sent.strip()[:70]))
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


EXCERPT_MAX = 30          # 이 줄 수 이하의 한 범위는 발췌를 붙인다(reports/README.md 근거 규칙)
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
def md_inline(s):
    """원고 한 단락을 HTML로. 링크·굵게·코드 백틱·표지만 다룬다.
    상대 링크는 화면에서 열리지 않으므로 이름만 글자로 보인다."""
    out, i = [], 0
    pat = re.compile(r"\[`(?P<cl>[^`]+)`\]\((?P<cu>[^)]+)\)"
                     r"|\[(?P<rl>[^\]]+)\]\((?P<ru>\.\.?/[^)]+)\)"
                     r"|\[(?P<ll>[^\]]+)\]\((?P<lu>https?://[^)]+)\)"
                     r"|`(?P<code>[^`]+)`|\*\*(?P<b>[^*]+)\*\*|\[(?P<mk>\d+)\](?!\()")
    for m in pat.finditer(s):
        out.append(html.escape(s[i:m.start()]))
        g = m.groupdict()
        if g["cl"]:
            out.append('<a href="%s" target="_blank" rel="noopener"><code>%s</code></a>' % (html.escape(g["cu"]), html.escape(g["cl"])))
        elif g["rl"]:
            out.append(html.escape(g["rl"]))
        elif g["ll"]:
            out.append('<a href="%s" target="_blank" rel="noopener">%s</a>' % (html.escape(g["lu"]), md_inline(g["ll"])))
        elif g["code"]:
            out.append("<code>%s</code>" % html.escape(g["code"]))
        elif g["b"]:
            out.append("<b>%s</b>" % md_inline(g["b"]))
        else:
            out.append('<a class="mk" href="#" data-ev="%s">[%s]</a>' % (g["mk"], g["mk"]))
        i = m.end()
    out.append(html.escape(s[i:]))
    return "".join(out)


def md_evidence(lines):
    """근거 항목 하나를 HTML로. 단락과 코드 블록만 다룬다."""
    out, para, code, lang = [], [], None, ""

    def flush():
        if para:
            out.append("<p>%s</p>" % "<br>".join(md_inline(x) for x in para))
            para.clear()
    for ln in lines:
        if code is not None:
            if ln.startswith("```"):
                out.append('<pre class="code"><code data-lang="%s">%s</code></pre>' % (lang, html.escape("\n".join(code))))
                code = None
            else:
                code.append(ln)
            continue
        if ln.startswith("```"):
            flush()
            code, lang = [], ln[3:].strip()
            continue
        if not ln.strip():
            flush()
            continue
        para.append(ln)
    flush()
    return "\n".join(out)


def build_data():
    """화면 데이터(dict)를 만든다."""
    names = list(CONFIG["servers"])
    reports = {n: parse(n)[2] for n in reported_servers()}
    link, impl = {}, {}
    for n in names:
        link[n] = {}
        for c in CELL_LIST:
            s = reports.get(n, {}).get(c["id"])
            if not s or not s["items"]:
                link[n][c["id"]] = [{"상세": UNKNOWN, "예외": False}]
                continue
            rows = []
            for it, u in zip(s["items"], s["units"]):
                marks = []
                for b in u["blocks"]:
                    for x in MARK.findall(block_text(b)):
                        if int(x) not in marks:
                            marks.append(int(x))
                rows.append({"상세": it["id"], "예외": it["dagger"]})
                blocks = {b["label"]: "".join("<p>%s</p>" % "<br>".join(md_inline(x) for x in p) for p in paragraphs(b["lines"]))
                          for b in u["blocks"]}
                ev = "".join('<div class="ev" id="EV-%d"><span class="evn">[%d]</span>%s</div>'
                             % (k, k, md_evidence([re.sub(r"^\[\d+\] ", "", s["evid"][k][0])] + s["evid"][k][1:]))
                             for k in sorted(marks) if k in s["evid"])
                impl["%s|%s|%s" % (c["id"], n, it["id"])] = {"impl": blocks.get(TERMS["impl"]) or blocks.get(TERMS["judge"], ""),
                                                            "exc": blocks.get(TERMS["exc"], ""), "evid": ev}
            link[n][c["id"]] = rows
    cells_out = []
    for c in CELL_LIST:
        defined = bool(c.get("scope"))
        items = [{"id": d["id"], "name": d["name"], "inc": d.get("include", ""), "exc": d.get("exclude", ""),
                  "seen": list(d.get("seen_in") or [])} for d in c.get("details") or []]
        meaning = {NOT_IMPL: c.get("not_implemented", ""), NOT_APPL: c.get("not_applicable", ""),
                   UNKNOWN: CONFIG["labels"][UNKNOWN]}
        rows = []
        for it in items + [{"id": x, "name": x, "inc": meaning[x], "exc": ""} for x in SPECIAL]:
            members = [{"s": n, "d": r["예외"]} for n in names for r in link[n][c["id"]] if r["상세"] == it["id"]]
            seen = [x for x in it.get("seen", []) if x not in [m["s"] for m in members]]
            row = {"id": it["id"], "name": it["name"], "inc": it["inc"], "exc": it["exc"], "m": members, "seen": seen}
            if it["id"] not in SPECIAL:
                row["cand"] = not members and not seen
            rows.append(row)
        studied = sum(1 for n in names if link[n][c["id"]][0]["상세"] != UNKNOWN)
        cells_out.append({"id": c["id"], "name": c["name"], "axis": c["id"][0], "q": c["question"],
                          "cond": bool(c.get("conditional")), "scope": c.get("applies_to", ""),
                          "note": c.get("boundary", ""), "defined": defined, "dscope": c.get("scope", ""),
                          "studied": studied, "rows": rows})
    return {"axes": {a["id"]: a["name"] for a in AXES}, "cells": cells_out, "impl": impl, "samples": names,
            "pilot": {"cells": ORDER, "servers": list(reports)}}


def build():
    data = build_data()
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(SITE_SRC, OUT)
    os.makedirs(os.path.join(OUT, "data"), exist_ok=True)
    with open(os.path.join(OUT, "data", "matrix.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("_site/ 만듦 (셀 %d, 조건부 %d, 서버 %d, 구현 설명 %d)"
          % (len(data["cells"]), sum(1 for c in data["cells"] if c["cond"]), len(data["samples"]), len(data["impl"])))
    return data


class _Utf8Handler(http.server.SimpleHTTPRequestHandler):
    """글 파일에 charset=utf-8을 붙여 보낸다. 없으면 브라우저가 지역 인코딩(EUC-KR 등)으로 추측해 한글이 깨진다."""
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8",
                      ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}


def serve(port=8000):
    build()
    handler = functools.partial(_Utf8Handler, directory=OUT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        print("http://localhost:%d 에서 본다. 끝내려면 Ctrl+C" % port)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


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
    elif cmd == "serve":
        serve(int(args[0]) if args else 8000)
    elif cmd == "fill":
        for a in args:
            fill(*target(a))
    elif cmd == "renumber":
        for a in args:
            renumber(*target(a))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
