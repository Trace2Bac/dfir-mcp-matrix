# dfir-mcp-architecture-matrix-v2

DFIR MCP 서버가 증거 무결성·실행 통제·결과 전달·기록 같은 문제를 **어떻게 구현하는지** 비교하는 매트릭스다.
매트릭스는 **축 → 셀(관찰 질문) → 상세 항목(그 질문에 답하는 구현 방식)** 으로 짜이고, MCP 서버마다 어느 상세에 드는지와 그 구현·예외를 기준 커밋 코드 근거와 함께 쓴다.

## 보기

**https://trace2bac.github.io/dfir-mcp-architecture-matrix-v2/** 에서 본다. 로컬에서 띄우려면:

```
pip install -r requirements.txt
cd web && npm ci && npm start      # http://localhost:3000/dfir-mcp-architecture-matrix-v2/
```

화면은 Docusaurus 사이트(`web/`)다. 첫 화면에 전체 셀 구조가 있고 셀을 누르면 상세 항목과 그 상세에 드는 서버, 서버를 누르면 그 서버 원고(구현·예외·근거)가 열린다.
`npm start`·`npm run build`는 먼저 `python tools/pilot.py build`로 화면 데이터를 만든다. 그래서 Python과 Node.js 20 이상이 둘 다 있어야 한다.
CI가 PR·`main` 푸시마다 사이트를 빌드하고 `main` 푸시이면 GitHub Pages에 배포한다(`.github/workflows/matrix.yml`).

## 축

| 글자 | 축 | 영어 |
|---|---|---|
| P | 절차 관리 | Procedure management |
| E | 원본 증거 관리 | Evidence management |
| T | 도구 실행 통제 | Tool execution control |
| R | 실행 결과 전달 | Result delivery |
| L | 서버 기록 | Logging |
| D | 파생물 관리 | Derivative management |
| I | 외부 연동 통제 | Integration control |

## 구조

```
matrix/          셀 구조와 정의의 원본. 셀 하나 = cells/<ID>.mdx 하나         → matrix/README.md
reports/         서버별 원고. reports/<서버>/<셀ID>.mdx                      → reports/README.mdx
docs/
  decisions/     구조를 바꾼 결정. 결정 하나 = 파일 하나(ADR)                 → docs/decisions/README.mdx
  redesign-plan-2026-09-30.mdx  개편 배경·원칙·셀 경계·옛 셀 대응
  cell-review-2026-09-30.mdx    셀 공동 검토 자료(옛 번호)
web/             화면(Docusaurus). matrix/cells·reports·docs를 페이지로, 화면 데이터로 셀 표를 그린다
tools/pilot.py   validate·check·build·fill·renumber
.github/workflows/matrix.yml   PR·main 푸시마다 validate·build, main이면 GitHub Pages에 배포
```

## 고치기

**[CONTRIBUTING.md](CONTRIBUTING.md)** 에 작업별 순서와 판단 기준이 있다.
LLM에게 고치게 할 때는 [AGENTS.md](AGENTS.md)를 읽힌다(Claude Code는 `CLAUDE.md`를 거쳐 자동으로 읽는다).

```
python tools/pilot.py validate          # 스키마와 파일끼리의 일관성(CI가 돌린다)
python tools/pilot.py check [서버 ...]   # validate + 원고 형식·근거·발췌 원문 대조(옛 저장소와 서버 클론 필요)
python tools/pilot.py build             # 화면 데이터 web/static/data/matrix.json을 만든다(npm start·build가 먼저 돌린다)
python tools/pilot.py fill <서버>        # 원고의 @발췌를 기준 커밋 코드로 채운다
python tools/pilot.py renumber <서버>    # 원고의 [번호]를 처음 나온 차례로 다시 매긴다
python tools/coverage.py <서버>          # reports/<서버>/tools.yaml로 기능→셀 대응표(coverage.mdx)를 만든다
```

필요한 것: Python 3.10 이상과 `requirements.txt`. `check`·`fill`은 옛 매트릭스 저장소(`Claude outputs`)와 분석 대상 서버의 클론도 있어야 한다(CONTRIBUTING.md).

## 라이선스

코드(`tools/`·`web/`·`matrix/schema/`·`.github/`)는 MIT([LICENSE](LICENSE)), 매트릭스 정의·원고·문서는 CC BY 4.0([LICENSE-CONTENT](LICENSE-CONTENT))이다.
원고에 인용한 분석 대상 서버의 코드 발췌는 각 프로젝트의 라이선스를 따른다. 자세한 범위는 [NOTICE.md](NOTICE.md)에 있다.
