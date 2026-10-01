# -*- coding: utf-8 -*-
"""시범 전환(2026-09-30) 도구. 기존 도구·원고·판정·매트릭스는 건드리지 않는다.

사용 (저장소 어디서든, PYTHONUTF8=1):
  python pilot.py fill <표본>      원고의 `@발췌 경로:시작-끝` 줄을 기준 커밋 코드 블록과 링크로 바꾸고 백틱 `경로:줄`을 링크로 바꾼다
  python pilot.py renumber <표본>  셀 절마다 표지 번호를 본문에 처음 나온 차례로 다시 매기고 근거 항목을 그 차례로 옮긴다
  python pilot.py check [표본 ...] 원고 형식·표지·근거·발췌 원문 일치·문장 점검을 본다(표본을 빼면 원고가 있는 표본 전부)
  python pilot.py build            개편안 10절의 전체 셀과 원고에서 연결자료.json과 시범_매트릭스.html을 만든다

원고(보고서/<표본>.md)의 셀 절 모양:
  ## <셀ID> <셀 이름>
  **상세 항목.** <ID 이름>[†], ...   (또는 미구현 / 비적용 하나)
  ### <ID 이름>                       (상세 항목 줄의 차례대로 하나씩)
  **구현.** 그 방식의 구현 [1] ...     (여러 단락이면 이어지는 단락은 머리말 없이)
  (문장 하나를 한 줄에 쓴다. 단락 사이에만 빈 줄을 둔다)
  **예외.** 그 방식이 걸리지 않는 경로 [2] ...   (†일 때만, †이면 반드시)
  ### 미구현 / ### 비적용
  **판단.** 왜 그 항목인지 [1] ...
  ### 근거
  [1] 확인할 동작. 코드 블록과 링크 또는 링크만.
"""
import html
import json
import os
import posixpath
import re
import subprocess
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
PILOT = os.path.dirname(HERE)


def _find_v1():
    """옛 매트릭스 저장소(Claude outputs)를 찾는다. tools/linkify.py·style_lint.py, 판정/*.yaml, 개편안을 거기서 읽는다.
    환경변수 DFIR_V1 → Claude outputs/기록/시범전환 안에서 돌 때 → 이 저장소 옆의 'Claude outputs' 폴더 순서로 본다."""
    cands = [os.environ.get("DFIR_V1"), os.path.dirname(os.path.dirname(PILOT)),
             os.path.join(os.path.dirname(PILOT), "Claude outputs")]
    for c in cands:
        if c and os.path.isfile(os.path.join(c, "tools", "linkify.py")):
            return c
    raise SystemExit("Claude outputs 저장소를 찾지 못했다. 환경변수 DFIR_V1에 그 폴더 경로를 준다.")


REPO = _find_v1()
TOOLS = os.path.join(REPO, "tools")
sys.path.insert(0, TOOLS)
import linkify  # noqa: E402  기준 커밋 읽기와 링크 변환을 그대로 쓴다
import style_lint  # noqa: E402

DEF = yaml.safe_load(open(os.path.join(PILOT, "상세정의.yaml"), encoding="utf-8"))
SPECIAL = ("미구현", "비적용", "미확인")
PLAN_NAME = "보고서_매트릭스_통합개편안_2026-09-30.md"
# 개편안은 이 저장소에 있다. 옛 위치(Claude outputs/기록)는 옮기기 전 사본을 쓸 때만 본다.
PLAN = next((x for x in (os.path.join(PILOT, PLAN_NAME), os.path.join(REPO, "기록", PLAN_NAME)) if os.path.isfile(x)), None)
if not PLAN:
    raise SystemExit("개편안(%s)을 찾지 못했다." % PLAN_NAME)


def plan_defs():
    """개편안 6.2절(상세 항목 정의의 유일한 원본)에서 셀마다 적용 범위·미구현·비적용·상세 항목을 읽는다."""
    text = open(PLAN, encoding="utf-8").read().replace("\r\n", "\n")
    a, b = text.index("\n### 6.2."), text.index("\n### 6.3.")
    out = {}
    for m in re.finditer(r"^#### ([A-H]\d\d) ([^\n]+)\n((?:(?!#### ).*\n)*)", text[a:b], re.M):
        cid, body = m.group(1), m.group(3)
        d = {"이름": m.group(2).strip(), "적용범위": "", "미구현": "", "비적용": "", "상세": []}
        sm = re.search(r"^\*\*적용 범위\.\*\* (.+)$", body, re.M)
        if sm:
            d["적용범위"] = sm.group(1).strip()
        for row in re.findall(r"^\| (?!상세 \||---)(.+) \|\s*$", body, re.M):
            cols = [x.strip() for x in row.split(" | ")]
            cols += [""] * (3 - len(cols))
            if cols[0] in ("미구현", "비적용"):
                d[cols[0]] = cols[1]
                continue
            im = re.match(r"^(%s\.\d\d) (.+)$" % cid, cols[0])
            if im:
                d["상세"].append({"id": im.group(1), "이름": im.group(2), "포함": cols[1], "제외": cols[2]})
        out[cid] = d
    return out


CELLS = plan_defs()
ORDER = list(DEF["시범셀"])
LANG = {".py": "python", ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".mjs": "javascript",
        ".go": "go", ".cs": "csharp", ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
        ".md": "markdown", ".sh": "bash", ".ps1": "powershell", ".rs": "rust", ".sql": "sql"}
MARK = re.compile(r"\[(\d+)\](?!\()")
LEAD = re.compile(r"^\*\*([^*]+?)\.\*\*\s?")


def report_path(name):
    return os.path.join(PILOT, "보고서", name + ".md")


def item_label(iid):
    cell = iid.split(".")[0]
    for it in CELLS.get(cell, {}).get("상세", []):
        if it["id"] == iid:
            return "%s %s" % (iid, it["이름"])
    return None


def git_lines(root, sha, rel):
    r = subprocess.run(["git", "-C", root, "show", "%s:%s" % (sha, rel)], capture_output=True)
    if r.returncode:
        return None
    return r.stdout.decode("utf-8", "replace").split("\n")


def repo_by_slug():
    """slug -> [(sha, root, 표본)]. 다른 표본의 코드를 발췌해도 그 표본의 기준 커밋으로 확인한다."""
    out = {}
    for name, (slug, sha, root) in linkify.REPOS.items():
        out.setdefault(slug, []).append((sha, root, name))
    for name, extra in linkify.EXTRA.items():
        for slug, sha, root in extra:
            out.setdefault(slug, []).append((sha, root, name))
    return out


# ───────────────────────── fill ─────────────────────────
PH = re.compile(r"^@발췌 (\S+):(\d+)-(\d+)\s*$")


def fill(name):
    p = report_path(name)
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
    print("%s: 발췌 %d개 채움, 링크 %d개 변환, 복원 %d, 없는 경로 %d" % (name, n, hit, len(guessed), len(missing)))
    for fp in missing:
        print("    [없음]", fp)


# ───────────────────────── 원고 읽기 ─────────────────────────
def parse_items(s):
    out = []
    for tok in [t.strip() for t in s.rstrip(". ").split(",") if t.strip()]:
        dag = tok.endswith("†")
        tok = tok.rstrip("†").strip()
        iid = tok if tok in SPECIAL else tok.split(" ", 1)[0]
        out.append({"id": iid, "label": tok, "dagger": dag})
    return out


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


def parse(name):
    """원고를 셀 절로 나눈다. 절마다 상세 목록, 상세별 단락 묶음, 근거 항목을 돌려준다."""
    text = open(report_path(name), encoding="utf-8").read().replace("\r\n", "\n")
    head, *parts = re.split(r"^## ", text, flags=re.M)
    secs = {}
    for part in parts:
        title, _, rest = part.partition("\n")
        cid = title.split(" ", 1)[0]
        sec = {"title": title.strip(), "items": [], "units": [], "evid": {}, "evid_order": [], "errors": []}
        pre, *subs = re.split(r"^### ", rest, flags=re.M)
        for ln in pre.split("\n"):
            m = LEAD.match(ln)
            if m and m.group(1) == "상세 항목":
                sec["items"] = parse_items(ln[m.end():])
            elif ln.strip():
                sec["errors"].append("상세 항목 줄 밖의 글이 첫 소제목 앞에 있다: " + ln[:40])
        for sub in subs:
            h, _, body = sub.partition("\n")
            h = h.strip()
            if h == "근거":
                sec["evid_order"], sec["evid"] = split_evidence(body.split("\n"))
                continue
            unit, cur = {"label": h, "blocks": []}, None
            for ln in body.split("\n"):
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
        secs[cid] = sec
    return head, secs


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


# ───────────────────────── renumber ─────────────────────────
def renumber(name):
    p = report_path(name)
    src = open(p, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in src else "\n"
    text = src.replace("\r\n", "\n")
    head, *parts = re.split(r"(?m)^## ", text)
    out = [head]
    for part in parts:
        i = part.find("\n### 근거\n")
        if i < 0:
            out.append("## " + part)
            continue
        body, evid = part[:i], part[i + len("\n### 근거\n"):]
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
            print("  [%s %s] 본문에서 쓰지 않는 근거를 뺀다: %s" % (name, part.split(" ", 1)[0], unused))
        new = []
        for old in first:
            if old not in entries:
                raise SystemExit("%s: 근거 [%d]가 없다" % (name, old))
            e = list(entries[old])
            e[0] = re.sub(r"^\[\d+\] ", "[%d] " % mp[old], e[0])
            while e and not e[-1].strip():
                e.pop()
            new += e + [""]
        out.append("## " + body + "\n### 근거\n" + "\n".join(lead + new))
    res = "".join(out).rstrip("\n") + "\n"
    open(p, "w", encoding="utf-8", newline="").write(res.replace("\n", nl))
    print("%s: 표지 번호를 다시 매겼다" % name)


# ───────────────────────── check ─────────────────────────
LINK = re.compile(r"\]\((https://github\.com/([^/]+/[^/]+)/blob/([0-9a-f]{40})/([^#)]+)(?:#L(\d+)(?:-L(\d+))?)?)\)")
SENT = re.compile(r"(?<=[다음함됨]\.)\s+|(?<=\]\.)\s+|(?<=\))\.\s+")


def plan_cells():
    """개편안 10절(A~H 표와 10.2 조건부 표)에서 셀 구조를 읽는다."""
    lines = open(PLAN, encoding="utf-8").read().split("\n")
    axes, cells, cur_axis, cond = {}, [], None, False
    for ln in lines:
        if ln.startswith("## ") or ln.startswith("### "):
            m = re.match(r"^### 10\.([A-H])\. (.+)$", ln)
            cur_axis = m.group(1) if m else None
            if m:
                axes[cur_axis] = m.group(2).strip()
            cond = bool(re.match(r"^### 10\.2\. ", ln))
            continue
        m = re.match(r"^\| ([A-H]\d\d) ([^|]+?) \| (.+) \|$", ln)
        if not m or not (cur_axis or cond):
            continue
        cols = [c.strip() for c in m.group(3).split(" | ")]
        if cond:
            scope, q, cand = cols[0], cols[1], cols[2]
        else:
            scope, q, cand = "", cols[0], cols[1]
        items, note = split_candidates(cand)
        cells.append({"id": m.group(1), "name": m.group(2).strip(), "axis": m.group(1)[0], "q": q,
                      "cond": cond, "scope": scope, "cand": items, "note": note})
    return axes, cells


def split_candidates(col):
    """'가 / 나 / 다. 경계 설명' → (['가','나','다'], '경계 설명'). '미구현(…)'은 미구현 행이라 뺀다."""
    parts = [x.strip() for x in col.split(" / ")]
    note = ""
    m = re.search(r"\s?\.\s(.+)$", parts[-1])
    if m:
        note = m.group(1).strip()
        parts[-1] = parts[-1][:m.start()].strip()
    items = [x for x in parts if x and not x.startswith("미구현")]
    return items, note


def check_defs():
    errs = []
    plan = {c["id"]: [re.sub(r"\([^)]*\)", "", x).strip() for x in c["cand"]] for c in plan_cells()[1]}
    for cid in ORDER:
        if cid not in CELLS:
            errs.append("%s 시범 셀인데 개편안 6.2절에 정의가 없다" % cid)
    for cid, c in CELLS.items():
        for k in ("적용범위", "미구현", "비적용"):
            if not c.get(k):
                errs.append("%s 6.2절에 %s이 없다" % (cid, "적용 범위" if k == "적용범위" else k))
        ids = [it["id"] for it in c["상세"]]
        if len(set(ids)) != len(ids):
            errs.append("%s 상세 ID 겹침" % cid)
        for i, it in enumerate(c["상세"], 1):
            if it["id"] != "%s.%02d" % (cid, i):
                errs.append("%s 상세 번호가 차례가 아니다: %s" % (cid, it["id"]))
            for k in ("이름", "포함", "제외"):
                if not it.get(k):
                    errs.append("%s %s 필드 없음" % (it["id"], k))
        mine = [re.sub(r"\([^)]*\)", "", it["이름"]).strip() for it in c["상세"]]
        if mine != plan.get(cid):
            errs.append("%s 상세 이름이 개편안 10절과 다르다\n      정의: %s\n      개편안: %s" % (cid, mine, plan.get(cid)))
    return errs


def check(name, slugs):
    errs, warns = [], []
    p = report_path(name)
    if not os.path.exists(p):
        return ["원고 없음: " + p], []
    slug0, sha0, root0 = linkify.REPOS[name]
    head, secs = parse(name)
    if sha0[:7] not in head:
        errs.append("머리에 기준 커밋 %s가 없다" % sha0[:7])
    if list(secs) != ORDER:
        errs.append("셀 절 순서가 %s가 아니다: %s" % (ORDER, list(secs)))
    hit, missing, _ = linkify.run(name, p, write=False)
    if hit:
        errs.append("링크로 바꾸지 않은 `경로:줄`이 %d개 있다(fill을 돌린다)" % hit)
    for fp in missing:
        errs.append("저장소에 없는 경로: " + fp)
    text = open(p, encoding="utf-8").read()
    for m in LINK.finditer(text):
        url, slug, sha, rel, a, b = m.groups()
        rel = rel.replace("%20", " ")
        if slug not in slugs:
            continue
        cand = [x for x in slugs[slug] if x[0] == sha]
        if not cand:
            errs.append("기준 커밋이 아닌 링크: %s" % url)
            continue
        if a:
            lines = git_lines(cand[0][1], sha, rel)
            if lines is None:
                errs.append("기준 커밋에 없는 파일: %s" % rel)
                continue
            n = len(lines) - (1 if lines and lines[-1] == "" else 0)
            if int(b or a) > n:
                errs.append("줄 범위가 파일 밖이다: %s#L%s-L%s (파일 %d줄)" % (rel, a, b, n))
    for cid in ORDER:
        if cid not in secs:
            continue
        s = secs[cid]
        errs += ["%s %s" % (cid, e) for e in s["errors"]]
        want = "%s %s" % (cid, CELLS[cid]["이름"])
        if s["title"] != want:
            errs.append("%s 제목이 '%s'가 아니다" % (cid, want))
        items = s["items"]
        if not items:
            errs.append("%s 상세 항목 줄이 없다" % cid)
            continue
        specials = [i for i in items if i["id"] in SPECIAL]
        if specials and len(items) > 1:
            errs.append("%s 미구현·비적용은 다른 항목과 함께 쓰지 않는다" % cid)
        if any(i["id"] == "미확인" for i in items):
            errs.append("%s 원고에는 미확인을 쓰지 않는다. 조사하지 않은 셀은 절을 두지 않는다" % cid)
        for it in items:
            if it["id"] in SPECIAL:
                if it["dagger"]:
                    errs.append("%s %s에는 †를 붙이지 않는다" % (cid, it["id"]))
                continue
            lab = item_label(it["id"])
            if not lab or not it["id"].startswith(cid + "."):
                errs.append("%s 정의에 없는 상세: %s" % (cid, it["id"]))
            elif it["label"] != lab:
                errs.append("%s 상세 이름이 정의와 다르다: '%s' ≠ '%s'" % (cid, it["label"], lab))
        if [u["label"] for u in s["units"]] != [it["label"] for it in items]:
            errs.append("%s 소제목 %s가 상세 항목 줄 %s와 차례까지 같아야 한다"
                        % (cid, [u["label"] for u in s["units"]], [it["label"] for it in items]))
        for it, u in zip(items, s["units"]):
            labs = [b["label"] for b in u["blocks"]]
            if it["id"] in SPECIAL:
                want_l = ["판단"]
            else:
                want_l = ["구현", "예외"] if it["dagger"] else ["구현"]
            if labs != want_l:
                errs.append("%s '%s'의 머리말이 %s여야 한다(지금 %s). 예외는 †일 때만, †이면 반드시 쓴다"
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
        for n_, lines in s["evid"].items():
            e_text = "\n".join(lines)
            if "](http" not in e_text and "(실행 확인" not in e_text:
                errs.append("%s 근거 [%d]에 링크가 없다" % (cid, n_))
            errs += ["%s 근거 [%d] %s" % (cid, n_, e) for e in check_blocks(lines, slugs)]
            for ln in prose_lines([re.sub(r"^\[\d+\] ", "", lines[0])] + lines[1:]):
                if sentences_in_line(ln) > 1:
                    errs.append("%s 근거 [%d] 한 줄에 문장이 둘 이상이다(문장 하나에 한 줄): %s" % (cid, n_, ln[:50]))
    raw = text.split("\n")
    fence, clean = False, []
    for ln in raw:
        if ln.startswith("```"):
            fence = not fence
            clean.append("")
            continue
        clean.append("" if fence else ln)
    tmp = os.path.join(os.environ["CLAUDE_JOB_DIR"], "tmp", "_lint_%s.md" % name) \
        if os.environ.get("CLAUDE_JOB_DIR") else p + ".lint.tmp"
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    open(tmp, "w", encoding="utf-8").write("\n".join(clean))
    for no, rule, ctx in style_lint.lint(tmp):
        errs.append("문장 %s줄 %s: %s" % (no or "-", rule, ctx.strip()))
    os.remove(tmp)
    return errs, warns


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
    저장소 안 기록을 가리키는 상대 링크는 화면 밖에서 열리지 않으므로 이름과 저장소 경로만 글자로 보인다."""
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
            # 원고의 상대 링크는 Claude outputs의 기록/시범전환/보고서 기준으로 적혀 있다
            repo_rel = posixpath.normpath(posixpath.join("기록/시범전환/보고서", g["ru"]))
            out.append('%s(저장소 <code>%s</code>)' % (html.escape(g["rl"]), html.escape(repo_rel)))
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


def build():
    axes, pcells = plan_cells()
    names = list(DEF["표본"])
    reports = {n: parse(n)[1] for n in names if os.path.exists(report_path(n))}
    link, impl = {}, {}
    for n in names:
        link[n] = {}
        for c in pcells:
            s = reports.get(n, {}).get(c["id"])
            if not s or not s["items"]:
                link[n][c["id"]] = [{"상세": "미확인", "예외": False, "근거": []}]
                continue
            rows = []
            for it, u in zip(s["items"], s["units"]):
                marks = []
                for b in u["blocks"]:
                    for x in MARK.findall(block_text(b)):
                        if int(x) not in marks:
                            marks.append(int(x))
                rows.append({"상세": it["id"], "예외": it["dagger"], "근거": marks})
                blocks = {b["label"]: "".join("<p>%s</p>" % "<br>".join(md_inline(x) for x in p) for p in paragraphs(b["lines"]))
                          for b in u["blocks"]}
                ev = "".join('<div class="ev" id="EV-%d"><span class="evn">[%d]</span>%s</div>'
                             % (k, k, md_evidence([re.sub(r"^\[\d+\] ", "", s["evid"][k][0])] + s["evid"][k][1:]))
                             for k in sorted(marks) if k in s["evid"])
                impl["%s|%s|%s" % (c["id"], n, it["id"])] = {"impl": blocks.get("구현") or blocks.get("판단", ""),
                                                            "exc": blocks.get("예외", ""), "evid": ev}
            link[n][c["id"]] = rows
    json.dump({"기준": ["개편안 10절(셀 구조)", "개편안 6.2절(상세 정의)", "보고서/*.md(연결)"],
               "연결": {n: {cid: v for cid, v in cs.items() if v[0]["상세"] != "미확인"} for n, cs in link.items()}},
              open(os.path.join(PILOT, "연결자료.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    cells_out = []
    for c in pcells:
        d = CELLS.get(c["id"])
        if d:
            items = [{"id": it["id"], "name": it["이름"], "inc": it["포함"], "exc": it["제외"]} for it in d["상세"]]
            meaning = {"미구현": d["미구현"], "비적용": d["비적용"]}
            scope, defined = d["적용범위"], True
        else:
            items = [{"id": "%s.%02d" % (c["id"], k), "name": nm, "inc": "", "exc": ""} for k, nm in enumerate(c["cand"], 1)]
            meaning = {"미구현": "", "비적용": ""}
            scope, defined = "", False
        meaning["미확인"] = DEF["공통"]["미확인"]
        rows = []
        for it in items + [{"id": x, "name": x, "inc": meaning[x], "exc": ""} for x in SPECIAL]:
            members = [{"s": n, "d": r["예외"]} for n in names for r in link[n][c["id"]] if r["상세"] == it["id"]]
            rows.append({"id": it["id"], "name": it["name"], "inc": it["inc"], "exc": it["exc"], "m": members})
        studied = sum(1 for n in names if link[n][c["id"]][0]["상세"] != "미확인")
        cells_out.append({"id": c["id"], "name": c["name"], "axis": c["axis"], "q": c["q"], "cond": c["cond"],
                          "scope": c["scope"], "note": c["note"], "defined": defined, "dscope": scope,
                          "studied": studied, "rows": rows})
    data = {"axes": axes, "cells": cells_out, "impl": impl, "samples": names}
    page = open(os.path.join(HERE, "matrix_template.html"), encoding="utf-8").read()
    page = page.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    open(os.path.join(PILOT, "시범_매트릭스.html"), "w", encoding="utf-8", newline="\n").write(page)
    print("연결자료.json, 시범_매트릭스.html 만듦 (셀 %d, 조건부 %d, 표본 %d, 구현 설명 %d)"
          % (len(cells_out), sum(1 for c in cells_out if c["cond"]), len(names), len(impl)))


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "fill":
        for n in args:
            fill(n)
    elif cmd == "renumber":
        for n in args:
            renumber(n)
    elif cmd == "check":
        names = args or [n for n in DEF["표본"] if os.path.exists(report_path(n))]
        slugs = repo_by_slug()
        total = 0
        d = check_defs()
        print("상세정의: 오류 %d" % len(d))
        for e in d:
            print("  [오류]", e)
        total += len(d)
        for n in names:
            e, w = check(n, slugs)
            total += len(e)
            print("%s: 오류 %d · 경고 %d" % (n, len(e), len(w)))
            for x in e:
                print("  [오류]", x)
            for x in w:
                print("  [경고]", x)
        sys.exit(1 if total else 0)
    elif cmd == "build":
        build()
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
