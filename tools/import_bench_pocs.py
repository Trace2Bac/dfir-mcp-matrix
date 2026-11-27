"""dfir-mcp-bench의 PoC 실행 결과를 장별 verifications.csv로 가져온다.

python tools/import_bench_pocs.py <dfir-mcp-bench 저장소 경로>

bench의 pocs/<문제ID>/<서버>/<사례ID>/runs/<커밋>/result.json 가운데 Docker 이미지에서 돌린 것(image가 있는 것)만
가져온다. poc.yaml의 realism이 forced(억지)인 PoC는 가져오지 않는다(그 사례는 매트릭스에서 빼고 장 폴더의 excluded.csv에 남긴다). 사례ID가 근거(findings.csv)에 있고, 실행한 커밋이 그 서버의 기준 커밋과 같아야 한다.
이 스크립트가 넣은 줄(근거가 bench의 pocs/를 가리키는 줄)만 지우고 다시 쓰며, 사람이 적은 줄은 그대로 둔다.
근거 링크는 bench 사이트의 그 사례 PoC 화면(한국어)이다. 결과를 bench에 커밋하고 올린 뒤에 돌린다.
"""
import csv, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "problems", "_data")
REPO_URL = "https://github.com/Trace2Bac/dfir-mcp-bench"
SITE_URL = "https://trace2bac.github.io/dfir-mcp-bench/ko/pocs"  # bench 사이트의 PoC 화면
COLS = ["문제ID", "사례ID", "서버", "방법", "수준", "커밋", "결과", "근거", "메모"]
LEVEL = {"mcp": "MCP 연결", "function": "함수 직접 호출"}
RESULT = {"reproduced": "재현됨", "not reproduced": "재현 안 됨"}
REALISM = {"common": "흔함", "possible": "생길 수 있음"}


def is_poc_link(url):
    """이 스크립트가 넣은 근거인가(bench 사이트의 PoC 화면, 또는 예전 형식인 bench 저장소의 pocs/ 폴더)"""
    return url.startswith(SITE_URL + "/") or (url.startswith(f"{REPO_URL}/tree/") and "/pocs/" in url)


def read(path):
    return list(csv.DictReader(open(path, encoding="utf-8"))) if os.path.exists(path) else []


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    bench = sys.argv[1]
    dirty = subprocess.run(["git", "-C", bench, "status", "--porcelain", "pocs"], capture_output=True, text=True).stdout.strip()
    if dirty:
        sys.exit("bench의 pocs/에 커밋하지 않은 변경이 있다. 결과를 커밋하고 올린 뒤에 돌린다(근거 링크가 bench 사이트의 화면을 가리킨다).")

    base = {}
    for s in read(os.path.join(DATA, "snapshots.csv")):
        base.setdefault(s["서버"], s["커밋"])
    chapters = sorted(d for d in os.listdir(DATA) if d.startswith("ch") and d[2:].isdigit())
    case_ch = {}
    for ch in chapters:
        for f in read(os.path.join(DATA, ch, "findings.csv")):
            if f.get("사례ID"):
                case_ch[f["사례ID"]] = (ch, f["문제ID"], f["서버"])

    rows = {ch: [] for ch in chapters}
    skipped = []
    root = os.path.join(bench, "pocs")
    for problem in sorted(os.listdir(root)):
        pdir = os.path.join(root, problem)
        if not os.path.isdir(pdir):
            continue
        for server in sorted(os.listdir(pdir)):
            for case in sorted(os.listdir(os.path.join(pdir, server))):
                runs = os.path.join(pdir, server, case, "runs")
                if not os.path.isdir(runs):
                    continue
                for commit in sorted(os.listdir(runs)):
                    f = os.path.join(runs, commit, "result.json")
                    if not os.path.exists(f):
                        continue
                    r = json.load(open(f, encoding="utf-8"))
                    where = case_ch.get(r["case_id"])
                    poc = open(os.path.join(pdir, server, case, "poc.yaml"), encoding="utf-8").read()
                    if re.search(r"^realism:\s*forced\s*$", poc, re.M):
                        skipped.append((r["case_id"], "PoC가 억지(forced)라 사례에서 뺄 대상(excluded.csv)"))
                    elif not r.get("image"):
                        skipped.append((r["case_id"], "Docker 밖에서 돌린 결과"))
                    elif not where or where[1:] != (r["problem"], r["server"]):
                        skipped.append((r["case_id"], "근거에 없는 사례ID"))
                    elif r["commit"] != base.get(r["server"]):
                        skipped.append((r["case_id"], "기준 커밋이 아닌 결과"))
                    else:
                        memo = [f"재현 {r.get('reproduced_runs', '')}".strip()]
                        if r.get("realism"):
                            memo.append(f"조건 {REALISM.get(r['realism'], r['realism'])}")
                        if r.get("coverage") and r["coverage"] != "full":
                            memo.append("일부만 보임: " + r["coverage"].removeprefix("partial: "))
                        rows[where[0]].append({
                            "문제ID": r["problem"], "사례ID": r["case_id"], "서버": r["server"], "방법": "PoC",
                            "수준": LEVEL.get(r.get("level", "mcp"), "MCP 연결"), "커밋": r["commit"],
                            "결과": RESULT[r["result"]],
                            "근거": f"{SITE_URL}/{case}",
                            "메모": "; ".join(memo),
                        })

    for ch in chapters:
        path = os.path.join(DATA, ch, "verifications.csv")
        old = read(path)
        keep = [v for v in old if not is_poc_link(v.get("근거", ""))]
        if not rows[ch] and len(keep) == len(old):
            continue  # 이 장에 PoC 결과가 없고 지울 줄도 없으면 파일을 건드리지 않는다
        new = keep + rows[ch]
        with open(path, "w", encoding="utf-8", newline="") as out:
            w = csv.DictWriter(out, COLS, quoting=csv.QUOTE_ALL, lineterminator="\n", extrasaction="ignore")
            w.writeheader()
            w.writerows({c: v.get(c, "") for c in COLS} for v in new)
        print(f"{ch}: PoC {len(rows[ch])}줄 (사람이 적은 줄 {len(keep)}줄 유지)")
    for case, why in skipped:
        print(f"건너뜀 {case}: {why}")


if __name__ == "__main__":
    main()
