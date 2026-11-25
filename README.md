# dfir-mcp-matrix

이 저장소는 공개 DFIR MCP 서버 21개에서 관찰된 문제를 DFIR MCP 서버 구현 가이드라인의 목차에 따라 정리한 **문제 매트릭스**입니다.
항목(1.1~4.4)의 소제목마다 문제를 두고, 서버마다 그 문제가 있는지(판정)와 근거가 된 코드 위치를 남깁니다.

## 매트릭스는 어떻게 구성되나요?

매트릭스는 **장 → 항목 → 소제목 → 문제**의 네 단계로 구성됩니다.

- **장**: 가이드라인의 장 1~4입니다(작업 대상과 상태의 관리, 도구 실행, 수행 기록과 파생물의 관리, 결과 전달).
- **항목**: 가이드라인의 항목 하나입니다. 예를 들어 1.3은 "조사 절차와 진행 관리"입니다.
- **소제목**: 항목의 소제목입니다. 소제목ID는 `1.3.2`처럼 항목 번호 뒤에 차례를 붙입니다.
- **문제**: 소제목 아래에서 같은 원인으로 묶은 문제입니다. 문제ID는 `P0001`처럼 소제목과 따로 매깁니다. 해당 기능이 있는 서버, 문제가 관찰된 서버, 서버별 사례(코드 위치와 기준 커밋)를 함께 둡니다.

사례는 대부분 코드 확인(정적 분석)으로 찾았습니다. 일부는 PoC, 시험, 모델 실험으로 실행해 확인했고, 화면에 사례마다 검증 방법을 표시합니다. PoC와 시험, 실험의 코드와 기록은 [dfir-mcp-bench](https://github.com/Trace2Bac/dfir-mcp-bench)에 있습니다.
판정은 서버마다 한 시점(기준 커밋)에서 내립니다. 보지 않은 칸은 확인 안 함으로 남습니다.

## 매트릭스 보기

매트릭스는 **https://trace2bac.github.io/dfir-mcp-matrix/** 에서 볼 수 있습니다.

- 첫 화면(Map)은 서버 × 문제 지도입니다. 칸은 그 서버에서 마지막으로 확인한 판정(관찰됨, 문제 없음, 기능 없음, 확인 안 함)입니다.
- Problems에서 항목과 소제목별로 문제를 보고, 문제 화면에서 서버별 판정과 근거 코드를 펼쳐 봅니다.
- 서버 목록에서 서버별로 관찰된 문제를 볼 수 있습니다.

## 저장소 구조

```
problems/_data/   문제 매트릭스의 원본 데이터(CSV)                         → problems/_data/README.md
problems/         CSV에서 만든 페이지. 손으로 고치지 않는다
tools/            problems_build.py(CSV → 페이지), problems_export_from_ledger.py(근거 대장 → CSV)
web/              화면(Docusaurus)
.github/workflows/matrix.yml   배포 태그(v<날짜>)를 올릴 때만 빌드 후 GitHub Pages에 배포
```

## 기여하기

작업 순서는 **[CONTRIBUTING.md](CONTRIBUTING.md)** 에 있습니다.
LLM에게 수정을 맡길 때는 [AGENTS.md](AGENTS.md)를 읽게 하세요. Claude Code는 `CLAUDE.md`를 거쳐 이 파일을 자동으로 읽습니다.

## 이전 매트릭스

축·셀·상세로 서버의 구현 방식을 분류하던 이전 매트릭스(`matrix/`, `reports/`)는 브랜치 `backup/main-2026-11-24`와 태그 `backup-main-2026-11-24`에 남아 있습니다.

## 라이선스

라이선스는 대상에 따라 다릅니다.

| 대상 | 라이선스 |
|---|---|
| 코드(`tools/`·`web/`·`.github/`) | MIT([LICENSE](LICENSE)) |
| 문제 매트릭스 데이터와 페이지, 문서 | CC BY 4.0([LICENSE-CONTENT](LICENSE-CONTENT)) |
| 사례에 인용한 분석 대상 서버의 코드 | 각 프로젝트의 라이선스 |

자세한 범위는 [NOTICE.md](NOTICE.md)에 있습니다.

## 사사 (Acknowledgment)

Copyright © Trace2Bac contributors

본 소스는 한국인터넷진흥원(KISA)이 주관하는 「차세대 보안리더 양성 프로그램(Best of the Best, BoB)」의 지원을 받아 수행된 결과물입니다.

Developed with support from the Best of the Best (BoB) Program administered by the Korea Internet & Security Agency (KISA).
