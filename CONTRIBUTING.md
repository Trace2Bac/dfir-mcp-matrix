# 고치는 법

이 문서는 문제 매트릭스를 고치는 순서를 설명합니다.
구성과 용어는 [README.md](README.md)에 있습니다.

## 처음 한 번 준비하기

- Python 3.10 이상(표준 라이브러리만 씁니다)
- Node.js 20 이상: 화면을 로컬에서 볼 때만 필요합니다

```
cd web && npm ci && npm start      # http://localhost:3000/
```

## 원본과 생성물

| 원본 | 생성물 | 만드는 명령 |
|---|---|---|
| `problems/_data/*.csv` | `problems/**.mdx`, `problems/_data/problems.json` | `python tools/problems_build.py` |
| `problems/_data/problems.json` | `web/static/data/problems.json` | `npm start`, `npm run build`(플러그인이 옮긴다) |

생성물은 손으로 고치지 않습니다. CSV를 고친 뒤 다시 만듭니다.
CSV는 저장소 밖의 근거 대장에서 `tools/problems_export_from_ledger.py`로 내보낼 수도 있습니다.

## 작업별 순서

### 문제나 사례를 고치거나 더할 때

1. `problems/_data/`의 해당 CSV를 고칩니다. 파일별 내용은 [problems/_data/README.md](problems/_data/README.md)에 있습니다.
2. `python tools/problems_build.py`를 실행합니다.
3. `web/`에서 `npm start`로 화면을 확인합니다.
4. CSV와 생성된 페이지를 함께 커밋합니다.

### 장·원고·소제목을 바꿀 때

가이드라인의 목차가 바뀐 경우입니다.
`chapters.csv`, `cells.csv`, `headings.csv`를 고치고, [결정 기록](docs/decisions/README.mdx)을 하나 더합니다.

## 배포

배포 태그 `v<날짜>`(예: `v2026-11-24`)를 올리면 CI가 사이트를 빌드하고 GitHub Pages에 배포합니다(`.github/workflows/matrix.yml`).
같은 날 다시 배포하면 `v2026-11-24.1`처럼 뒤에 번호를 붙입니다.
PR과 `main` 푸시에서는 돌지 않습니다.
