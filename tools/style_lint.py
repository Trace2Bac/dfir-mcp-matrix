# -*- coding: utf-8 -*-
"""원고 문장 기계 점검(작성 규칙 0004, docs/writing-rules/). 코드 백틱·링크 URL·표 구분선은 빼고 본다.
   pilot.py check가 쓰고, 따로 돌릴 때는 python tools/style_lint.py <파일> [...]   걸린 줄과 규칙을 출력한다. 0건이면 통과.
   옛 매트릭스 저장소(Claude outputs)의 tools/style_lint.py를 옮겨 왔다."""
import re
import sys

LINE_RULES = [
    ("연결어미 뒤 쉼표", re.compile(r"(?:[가-힣](?<![참최광사재경창원신])고|[가-힣]며|지만|면서|아서|어서|해서|[는인은]데|므로|으나)(?:\([^)]*\))?\s*,")),
    ("이중 피동", re.compile(r"되어지|되어진|지게 된다|지게 되")),
    ("~에 있어", re.compile(r"에 있어(?:서)?\b|에 있어서")),
    ("~와 관련하여/관련된", re.compile(r"[와과] 관련(?:하여|해서|된)")),
    ("~에 의해", re.compile(r"에 의해")),
    ("이중 조사", re.compile(r"(?:에서의|으로의|에로의|으로부터의|에의)\s")),
    ("AI 관용구", re.compile(r"시사하는 바|주목할 만하|매우 중요하|다음과 같[다은이]|크게 (?:두|세|네) 가지로")),
    ("결산 도치", re.compile(r"(?:하는|되는|인) 이유다\.|로 이어진다\.")),
    ("분열문", re.compile(r"(?:^|[.\s])(?:핵심|문제|관건|중요한 것|필요한 것)은 [^.]{0,60}(?:이다|점이다|데 있다)\.")),
    ("비유 어휘", re.compile(r"(?:길이다|갈래다|자리다|층이다|관문|열쇠|봉투|판본|청사진|적신호|신호탄)")),
    ("작업 맥락 참조", re.compile(r"검토에서|이전 판은|요청받|분석 의뢰|하라고 했")),
    ("표기(22절)", re.compile(r"감사 로그|감사 기록|디렉터리|바이너리|애너테이션|파생 파일|결과물|타임아웃")),
    ("자료형 이름 음역", re.compile(r"딕트|딕셔너리|튜플|불리언|(?<![체블화플])리스트")),
    ("줄표 부가 설명", re.compile(r"\S — \S")),
]
DOC_LIMITS = [
    ("문두 결산 접속사", re.compile(r"(?:^|[.!?]\s)(?:결론적으로|따라서|요약하면|정리하자면|이를 통해|그러므로)[ ,]"), 2),
    ("'즉'", re.compile(r"(?:^|\s)즉[ ,]"), 2),
    ("'~다는 것이다/뜻이다'", re.compile(r"다는 (?:것|뜻)이다\."), 2),
]
PARA_LIMITS = [
    ("'~에 대해'", re.compile(r"에 대해"), 3),
    ("'~를 통해'", re.compile(r"[을를] 통해|[을를] 통하여"), 3),
    ("'~라는 점에서'", re.compile(r"라는 점에서"), 3),
    ("'~할 수 있다'", re.compile(r"할 수 있다|될 수 있다"), 4),
]


STRUCT = re.compile(r"^\s*(?:[-*]|\d+\.)\s+(?:(?:\*\*[^*]+\*\*(?:\([^)]*\))?,?\s*)+|C(?:\([^)]*\))?|[^.—]{1,40}?)\s*—\s")


def clean(line):
    line = re.sub(r"\]\([^)]*\)", "]", line)       # 링크 URL
    line = re.sub(r"`[^`]*`", "C", line)           # 코드 백틱
    return line


def lint(path):
    raw = open(path, encoding="utf-8").read().splitlines()
    hits = []
    doc = "\n".join(clean(l) for l in raw)
    for no, l in enumerate(raw, 1):
        if l.startswith("|---") or l.startswith("```"):
            continue
        c = clean(l)
        heading = l.lstrip().startswith("#")
        for name, rx in LINE_RULES:
            if name == "줄표 부가 설명" and (heading or STRUCT.match(c)):
                continue          # 소제목 "— 값", 목록의 "항목 — 뜻"은 규격이 정한 모양
            for m in rx.finditer(c):
                if name == "줄표 부가 설명" and c[:m.start()].count("**") % 2 == 1:
                    continue      # "**항목 — 값.**"처럼 굵은 글씨 안의 줄표
                hits.append((no, name, c[max(0, m.start() - 30):m.end() + 30]))
    for name, rx, lim in DOC_LIMITS:
        n = len(rx.findall(doc))
        if n > lim:
            hits.append((0, "%s %d회(문서 %d회 이하)" % (name, n, lim), ""))
    para, start = [], 1
    for no, l in enumerate(raw + [""], 1):
        if l.strip():
            if not para:
                start = no
            para.append(clean(l))
            continue
        text = " ".join(para)
        for name, rx, lim in PARA_LIMITS:
            n = len(rx.findall(text))
            if n > lim:
                hits.append((start, "%s 한 문단 %d회(%d회 이하)" % (name, n, lim), text[:60]))
        para = []
    return hits


if __name__ == "__main__":
    total = 0
    for p in sys.argv[1:]:
        hs = lint(p)
        total += len(hs)
        print("%s: %d건" % (p, len(hs)))
        for no, name, ctx in hs:
            print("  %5s  %-22s %s" % (no or "-", name, ctx.strip()))
    sys.exit(1 if total else 0)
