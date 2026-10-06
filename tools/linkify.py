# -*- coding: utf-8 -*-
"""원고의 `경로:줄` 백틱을 기준 커밋의 GitHub blob 링크로 바꾼다(pilot.py fill·check가 쓴다).
저장소에 실제로 있는 파일만 바꾸고, 없는 경로는 보고만 한다(인용 검증 겸용).
옛 매트릭스 저장소(Claude outputs)의 tools/linkify.py를 옮겨 왔다(결정 0042)."""
import re, os

# 서버 이름 -> (저장소 slug, 기준 커밋, 로컬 클론 경로). pilot.py가 reports/<서버>/index.mdx 머리말로 채운다.
REPOS = {}
# 한 서버가 저장소 여럿에 걸칠 때 추가 저장소. 지금은 쓰는 서버가 없다.
EXTRA = {}

# ── 기준 커밋 읽기(2026-09-28): 클론의 작업 트리가 아니라 git으로 기준 커밋의 파일 목록과 내용을 읽는다.
#    새로 클론한 사람의 작업 트리는 upstream 최신이라 줄 번호가 다를 수 있기 때문이다. checkout 없이 된다.
import subprocess
_TREE, _LINES = {}, {}


def tree(root, sha):
    """기준 커밋의 파일 경로 집합. 클론이나 커밋이 없으면 이유를 적고 멈춘다."""
    key = (root, sha)
    if key not in _TREE:
        if not os.path.isdir(os.path.join(root, ".git")) and not os.path.isfile(os.path.join(root, ".git")):
            raise SystemExit("클론이 없다: %s\n  분석 대상 저장소를 이 폴더에 클론하거나 "
                             "클론을 모아 둔 폴더를 환경변수 DFIR_CLONES에 준다." % root)
        r = subprocess.run(["git", "-C", root, "ls-tree", "-r", "--name-only", "-z", sha], capture_output=True)
        if r.returncode:
            raise SystemExit("기준 커밋 %s 이 클론 %s 에 없다. git -C \"%s\" fetch 를 한 번 한다(checkout은 하지 않는다)."
                             % (sha[:7], root, root))
        _TREE[key] = {x.decode("utf-8") for x in r.stdout.split(b"\0") if x}
    return _TREE[key]


def is_file(root, sha, path):
    return path in tree(root, sha)


def is_dir(root, sha, path):
    pre = path.rstrip("/") + "/"
    return any(p.startswith(pre) for p in tree(root, sha))


def line_count(root, sha, path):
    """기준 커밋에서 그 파일의 줄 수."""
    key = (root, sha, path)
    if key not in _LINES:
        r = subprocess.run(["git", "-C", root, "show", "%s:%s" % (sha, path)], capture_output=True)
        b = r.stdout
        _LINES[key] = b.count(b"\n") + (1 if b and not b.endswith(b"\n") else 0)
    return _LINES[key]


def repos_of(name):
    """그 표본의 저장소 전부. 첫째가 주 저장소다."""
    return [REPOS[name]] + EXTRA.get(name, [])

def resolve(name, fp, idxs=None):
    """백틱에 적힌 경로를 (slug, sha, root, 저장소 상대 경로) 로 푼다.
    정확한 경로가 한 저장소에만 있으면 그것, 여러 저장소에 있으면 모호(None, "모호")."""
    rs = repos_of(name)
    hits = [r for r in rs if is_file(r[2], r[1], fp)]
    if len(hits) == 1:
        return hits[0] + (fp,), None
    if len(hits) > 1:
        return None, "모호"
    if "/" not in fp:
        idxs = idxs or [index_repo(r[2], r[1]) for r in rs]
        cand = [(r, ix[fp]) for r, ix in zip(rs, idxs) if fp in ix]
        if len(cand) == 1:
            return cand[0][0] + (cand[0][1],), "복원"
        if len(cand) > 1:
            return None, "모호"
    return None, "없음"

# `경로:줄` 또는 `경로:줄-줄`  (이미 링크 안에 들어간 것도 그대로 잡히지만 아래서 걸러낸다)
# 확장자가 없는 파일(Dockerfile 등), 점으로 시작하는 경로(.github/…), 공백이 든 경로(External Tools/…)도 잡는다
PAT = re.compile(r'`(\.?(?:[A-Za-z0-9_][A-Za-z0-9_.-]*(?: [A-Za-z0-9_][A-Za-z0-9_.-]*)*/)*(?:[A-Za-z0-9_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*\.[A-Za-z][A-Za-z0-9]{0,5}|Dockerfile|Containerfile|Makefile|Justfile)):(\d+)(?:-(\d+))?`')

def index_repo(root, sha):
    """basename -> 기준 커밋의 저장소 상대 경로. 같은 이름이 둘 이상이면 모호하므로 버린다."""
    idx, dup = {}, set()
    for rel in tree(root, sha):
        fn = rel.rsplit("/", 1)[-1]
        if fn in idx and idx[fn] != rel:
            dup.add(fn)
        idx[fn] = rel
    for d in dup:
        idx.pop(d, None)
    return idx

def link_other_samples(src):
    """다른 표본의 코드를 `[<표본> `경로:줄`]` 모양으로 적은 인용을 그 표본의 기준 커밋 링크로 바꾼다.
    이미 `(url)`이 붙은 것은 건드리지 않는다. 그 표본 저장소에 없는 경로는 그대로 두고 보고한다."""
    names = sorted(REPOS, key=len, reverse=True)
    pat = re.compile(r"\[(%s) (`[^`]+`)\](?!\()" % "|".join(re.escape(n) for n in names))
    miss = []
    def sub(m):
        other, tick = m.group(1), m.group(2)
        pm = PAT.fullmatch(tick)
        if not pm:
            miss.append(m.group(0)); return m.group(0)
        r, why = resolve(other, pm.group(1))
        if r is None:
            miss.append(m.group(0)); return m.group(0)
        slug, sha, root, rel = r
        a, b = pm.group(2), pm.group(3)
        anchor = f"#L{a}" + (f"-L{b}" if b else "")
        return f"[{other} {tick}](https://github.com/{slug}/blob/{sha}/{rel.replace(' ', '%20')}{anchor})"
    out, n = pat.subn(sub, src)
    return out, n - len(miss), miss


def run(name, path, write=True):
    src = open(path, encoding="utf-8", newline="").read()
    src, cross, cross_miss = link_other_samples(src)
    for x in cross_miss:
        print("    [다른 표본 인용 풀지 못함] " + x)
    missing, hit, guessed = {}, 0, {}
    idxs = [index_repo(r[2], r[1]) for r in repos_of(name)]

    # 이미 [ ... ]( ... ) 안에 있는 백틱은 건드리지 않는다: 링크 구간을 먼저 표시
    # 다른 표본·upstream 인용(`[이름 `경로:줄`](url)`)도 링크 구간으로 본다
    linked = [(m.start(), m.end()) for m in re.finditer(r'\[[^\[\]]*?`[^`]+`\]\([^)]+\)', src)]
    def inside(i):
        return any(a <= i < b for a, b in linked)

    out, last = [], 0
    for m in PAT.finditer(src):
        if inside(m.start()):
            continue
        fp, a, b = m.group(1), m.group(2), m.group(3)
        r, why = resolve(name, fp, idxs)
        if r is None:
            # 짧게 적은 이름이 모호하거나 어느 저장소에도 없으면 보고만 한다
            key = fp + (" (저장소 여럿에 있음)" if why == "모호" else "")
            missing[key] = missing.get(key, 0) + 1
            continue
        slug, sha, root, rel = r
        if why == "복원":
            guessed[fp] = rel
        anchor = f"#L{a}" + (f"-L{b}" if b else "")
        url = f"https://github.com/{slug}/blob/{sha}/{rel.replace(' ', '%20')}{anchor}"
        out.append(src[last:m.start()])
        out.append(f"[{m.group(0)}]({url})")
        last = m.end()
        hit += 1
    out.append(src[last:])
    if write and (hit or cross):
        open(path, "w", encoding="utf-8", newline="").write("".join(out))
    return hit, missing, guessed


