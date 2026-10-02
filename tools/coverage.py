# -*- coding: utf-8 -*-
"""서버의 등록 도구가 어느 셀 원고에 나오는지 표로 만든다(기능→셀 대응표).

  python tools/coverage.py <서버>

입력:  reports/<서버>/tools.yaml   등록 도구 목록(name·path·line). 서버마다 기준 커밋 코드에서 뽑아 둔다.
출력:  reports/<서버>/coverage.md  기능마다 원고 본문에 이름이 나오는 셀과 근거에만 나오는 셀
       tools.yaml 항목: name·path·line, 선택 kind(종류)·owner(클래스)

이름이 원고에 나오지 않는다고 그 기능을 조사하지 않았다는 뜻은 아니다(공통 처리기 설명으로 덮였을 수 있다).
표는 조사 범위를 다시 확인할 출발점이다.
"""
import glob
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = re.compile(r"^[A-Z]\d\d$")
EVID = "\n### 근거\n"


def front(path):
    t = open(path, encoding="utf-8").read().replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    return (yaml.safe_load(m.group(1)) if m else {}), (t[m.end():] if m else t)


def main(server):
    d = os.path.join(ROOT, "reports", server)
    tools = yaml.safe_load(open(os.path.join(d, "tools.yaml"), encoding="utf-8"))["tools"]
    fm, _ = front(os.path.join(d, "index.md"))
    base = "https://github.com/%s/blob/%s/" % (fm["repo"], fm["commit"])
    cells = {}
    for p in sorted(glob.glob(os.path.join(d, "*.md"))):
        cid = os.path.splitext(os.path.basename(p))[0]
        if CELL.match(cid):
            _, body = front(p)
            prose, _, evid = body.partition(EVID)
            cells[cid] = (prose, evid)
    from collections import Counter
    dup = Counter(t["name"] for t in tools)
    rows, none = [], Counter()
    for t in sorted(tools, key=lambda x: (x.get("kind", ""), x.get("owner", ""), x["name"])):
        pat = re.compile(r"(?<![A-Za-z0-9_])%s(?![A-Za-z0-9_])" % re.escape(t["name"]))
        in_body = [c for c, (b, _) in cells.items() if pat.search(b)]
        in_evid = [c for c, (b, e) in cells.items() if c not in in_body and pat.search(e)]
        if not in_body:
            none[t.get("kind", "")] += 1
        where = "[`%s:%s`](%s%s#L%s)" % (t["path"], t["line"], base, t["path"], t["line"])
        label = "%s.%s" % (t["owner"], t["name"]) if t.get("owner") else t["name"]
        note = "같은 이름 %d개(이름으로만 찾음)" % dup[t["name"]] if dup[t["name"]] > 1 else ""
        rows.append("| `%s` | %s | %s | %s | %s | %s |" % (label, t.get("kind", ""), where, "·".join(in_body) or "없음", "·".join(in_evid) or "", note))
    kinds = Counter(t.get("kind", "") for t in tools)
    summary = ", ".join("%s %d개(본문에 없음 %d개)" % (k or "종류 없음", n, none[k]) for k, n in kinds.items())
    out = ["# %s 기능→셀 대응표" % server, "",
           "`python tools/coverage.py %s`가 `tools.yaml`과 셀 원고로 만든 표다. 손으로 고치지 않는다." % server,
           "기능 목록: %s." % summary,
           "이름이 원고 본문에 나오는지만 찾으므로 이름이 나오지 않는다고 그 기능을 조사하지 않았다는 뜻은 아니다. 공통 처리기 설명으로 덮였을 수 있으므로 조사 범위를 다시 볼 때 출발점으로 쓴다.",
           "같은 이름이 여러 클래스에 있으면 어느 클래스의 것인지 가리지 못한다(마지막 열).", "",
           "| 기능 | 종류 | 정의 위치 | 본문에 나오는 셀 | 근거에만 나오는 셀 | 비고 |", "|---|---|---|---|---|---|"] + rows
    open(os.path.join(d, "coverage.md"), "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
    print("%s: %s → reports/%s/coverage.md" % (server, summary, server))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
