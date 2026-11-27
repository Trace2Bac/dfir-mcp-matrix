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
| `problems/_data/*.csv`, `problems/_data/ch*/*.csv` | `problems/**.mdx`, `problems/_data/problems.json` | `python tools/problems_build.py` |
| `problems/_data/problems.json` | `web/static/data/problems.json` | `npm start`, `npm run build`(플러그인이 옮긴다) |

생성물은 손으로 고치지 않고 커밋하지도 않습니다(`.gitignore`). 배포할 때 CI가 CSV에서 다시 만듭니다. `web/`에서 `npm start`·`npm run build`를 하면 먼저 자동으로 만듭니다.

## 장별로 나눠 작업하기

장마다 담당이 따로 작업해도 충돌하지 않도록 파일을 나눴습니다.

| 파일 | 누가 고치나 |
|---|---|
| `problems/_data/ch<N>/headings.csv`, `problems.csv`, `findings.csv` | 그 장 담당 |
| `problems/_data/ch<N>/verifications.csv` | 그 장 담당(그 장 문제의 실행 검증) |
| `problems/_data/ch<N>/cwe.csv`, `ch<N>/snapshots.csv` (있으면) | 그 장 담당. 공용 파일에 없는 CWE나 그 장만 다시 본 분석 회차를 더할 때 쓴다. 빌드가 공용 파일과 이어 붙인다 |
| `chapters.csv`, `cells.csv`, `servers.csv`, `snapshots.csv`, `cwe.csv` | 공용. 고치기 전에 서로 알립니다 |
| `tools/`, `web/` | 공용. 고치기 전에 서로 알립니다 |

- 문제ID는 첫 자리가 장 번호라(`P1001`, `P2049`, `P3075`, `P4192`) 장끼리 겹치지 않습니다. 새 문제는 그 장의 마지막 번호 다음 번호를 받습니다.
- 다른 장으로 옮길 사례는 그 장 파일을 직접 고치지 않고 담당에게 넘깁니다.

## 작업별 순서

### 문제나 근거를 고치거나 더할 때

1. `problems/_data/`의 해당 CSV를 고칩니다. 파일별 내용은 [problems/_data/README.md](problems/_data/README.md)에 있습니다.
2. `python tools/problems_build.py`를 실행합니다(오류가 없어야 합니다).
3. `web/`에서 `npm start`로 화면을 확인합니다.
4. CSV만 커밋합니다.

### 장·항목·소제목을 바꿀 때

가이드라인의 목차가 바뀐 경우입니다.
`chapters.csv`, `cells.csv`, `ch<N>/headings.csv`를 고치고, 바꾼 이유를 커밋 메시지에 남깁니다.

## 배포

배포 태그 `v<날짜>`(예: `v2026-11-24`)를 올리면 CI가 사이트를 빌드하고 GitHub Pages에 배포합니다(`.github/workflows/matrix.yml`).
같은 날 다시 배포하면 `v2026-11-24.1`처럼 뒤에 번호를 붙입니다.
PR과 `main` 푸시에서는 돌지 않습니다.
