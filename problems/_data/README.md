# problems/_data — 문제 매트릭스 데이터

`problems/`의 페이지는 이 폴더의 CSV에서 `tools/problems_build.py`가 만든다. 페이지 파일은 손으로 고치지 않는다. 데이터를 고친 뒤 다시 만든다.

```
python tools/problems_build.py
```

| 파일 | 내용 |
|---|---|
| `chapters.csv` | 축: 가이드라인의 장 1~4 |
| `cells.csv` | 셀: 원고 1.1~4.4와 이름 |
| `headings.csv` | 상세: 원고의 구현방안 소제목과 그 아래 문제 묶음 ID(가이드라인 초안 2026-11-24 기준) |
| `problems.csv` | 문제 묶음: 소제목, 문제, 현상과 피해, 해당 기능이 있는 서버, 문제가 관찰된 서버 |
| `observations.csv` | 문제가 관찰된 서버의 사례: 요지, 코드 위치, 저장소, 기준 커밋 |
| `experiments.csv` | 수정 전후 검증 실험(Trace2Bac/dfir-mcp-bench)과 문제 묶음의 대응 |
| `servers.csv` | 서버 21개의 저장소와 기준 커밋 |

이 CSV는 저장소 밖의 근거 대장에서 `tools/problems_export_from_ledger.py`로 내보낸다. 근거 대장은 사례마다 근거의 강도(원자료로 재현, 코드 확인 등)와 시험 기록을 관리하며, 이 매트릭스는 그 가운데 문제와 서버만 싣는다. "해당 기능이 있는 서버"는 매트릭스 셀 상세에서 정한 묶음 분모이고, 21개 서버를 코드로 다시 판정한 묶음(지금은 1.3 B2)만 그 결과로 바꿨다.
