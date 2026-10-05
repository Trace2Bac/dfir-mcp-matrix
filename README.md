# dfir-mcp-architecture-matrix-v2

이 저장소는 DFIR MCP 서버들이 증거 무결성, 실행 통제, 결과 전달, 기록 같은 문제를 **어떻게 구현하는지** 비교하는 매트릭스입니다.
서버마다 각 질문에 어떤 방식으로 답하는지 정리하고, 그 판단의 근거로 기준 커밋의 코드를 함께 남깁니다.

## 매트릭스는 어떻게 구성되나요?

매트릭스는 **축 → 셀 → 상세 항목**의 세 단계로 구성됩니다.

- **축**: 셀을 묶는 큰 갈래입니다. 예를 들어 "원본 증거 관리"(E)가 축 하나입니다. 축 목록은 아래 [축](#축) 표에 있습니다.
- **셀**: 서버를 관찰할 때 던지는 질문 하나입니다. 예를 들어 `E03`(원본 변경 방지)은 원본에 닿는 경로에서 누가 어떤 장치로 변경을 막는지 묻습니다.
- **상세 항목**(줄여서 **상세**): 그 질문에 답하는 구현 방식 하나입니다. 예를 들어 `E03.01`은 "실행 환경의 읽기 전용 강제"입니다.

원고 작성자는 MCP 서버마다 각 셀의 어느 상세에 해당하는지 판단하고, 그 결과를 **원고**에 씁니다.
원고는 서버 하나가 셀 하나에 어떻게 답하는지 적은 문서입니다(`reports/<서버>/<축>/<셀ID>.mdx`).
원고에는 다음 내용이 들어갑니다.

- **구현**: 그 방식이 서버의 어느 도구나 경로에 있고 어떻게 동작하는지
- **예외**: 구현에 적은 적용 범위 안에서 그 방식이 적용되지 않는 경우
- **근거**: 위 설명을 뒷받침하는 자료(주로 기준 커밋의 코드 위치와 발췌)

서버가 해당하는 상세에 예외가 있으면, 화면에서 그 상세 아래 서버 버튼에 **예외 표시**(주황 테두리)가 붙습니다.
용어의 자세한 정의는 [용어 사전](docs/glossary/README.mdx)에 있습니다.

## 매트릭스 보기

매트릭스는 **https://trace2bac.github.io/dfir-mcp-architecture-matrix-v2/** 에서 볼 수 있습니다.
로컬에서 띄우려면 다음을 실행합니다.

```
pip install -r requirements.txt
cd web && npm ci && npm start      # http://localhost:3000/
```

화면은 Docusaurus 사이트(`web/`)입니다.

- 첫 화면에서 전체 셀 구조를 볼 수 있습니다.
- 셀을 누르면 그 셀의 상세 항목과, 상세마다 해당하는 서버가 나옵니다.
- 서버를 누르면 그 서버의 원고(구현, 예외, 근거)가 열립니다.

`npm start`와 `npm run build`는 먼저 `python tools/pilot.py build`를 실행해 화면 데이터를 만듭니다.
그래서 Python과 Node.js 20 이상이 모두 설치되어 있어야 합니다.

CI는 PR이 열리거나 갱신될 때, 그리고 `main`에 푸시될 때마다 사이트를 빌드합니다. `main` 푸시일 때는 빌드한 사이트를 GitHub Pages에 배포합니다(`.github/workflows/matrix.yml`).

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

## 저장소 구조

```
matrix/          셀 구조와 정의의 원본. 축 하나 = cells/<축>/ 폴더 하나, 셀 하나 = cells/<축>/<ID>.mdx 하나  → matrix/README.md
reports/         서버별 원고. reports/<서버>/<축>/<셀ID>.mdx                 → reports/README.mdx
docs/
  decisions/     구조를 바꾼 결정. 결정 하나 = 파일 하나(ADR)                 → docs/decisions/README.mdx
web/             화면(Docusaurus). matrix/cells·reports·docs를 페이지로, 화면 데이터로 셀 표를 그린다
tools/pilot.py   validate·check·build·fill·renumber
.github/workflows/matrix.yml   PR(열기·갱신)과 main 푸시마다 validate·build, main이면 GitHub Pages에 배포
```

## 기여하기

작업별 순서와 판단 기준은 **[CONTRIBUTING.md](CONTRIBUTING.md)** 에 있습니다. 처음 기여한다면 이 문서부터 읽으세요.
LLM에게 수정을 맡길 때는 [AGENTS.md](AGENTS.md)를 읽게 하세요. Claude Code는 `CLAUDE.md`를 거쳐 이 파일을 자동으로 읽습니다.

자주 쓰는 명령은 다음과 같습니다.

```
python tools/pilot.py validate          # 스키마와 파일끼리의 일관성(CI가 돌린다)
python tools/pilot.py check [서버 ...]   # validate + 원고 형식·근거·발췌 원문 대조(옛 저장소와 서버 클론 필요)
python tools/pilot.py build             # 화면 데이터 web/static/data/matrix.json을 만든다(npm start·build가 먼저 돌린다)
python tools/pilot.py fill <서버>        # 원고의 @발췌를 기준 커밋 코드로 채운다
python tools/pilot.py renumber <서버>    # 원고의 [번호]를 처음 나온 차례로 다시 매긴다
python tools/coverage.py <서버>          # reports/<서버>/coverage.mdx 머리말의 기능 목록으로 기능→셀 대응표(같은 파일 본문)를 만든다
```

명령을 실행하려면 Python 3.10 이상과 `requirements.txt`의 패키지가 필요합니다.
`check`와 `fill`을 쓰려면 다음 두 가지도 있어야 합니다. 준비 방법은 CONTRIBUTING.md를 참고하세요.

- 옛 매트릭스 저장소(`Claude outputs`)
- 분석 대상 서버의 클론

## 라이선스

라이선스는 대상에 따라 다릅니다.

| 대상 | 라이선스 |
|---|---|
| 코드(`tools/`·`web/`·`matrix/schema/`·`.github/`) | MIT([LICENSE](LICENSE)) |
| 매트릭스 정의, 원고, 문서 | CC BY 4.0([LICENSE-CONTENT](LICENSE-CONTENT)) |
| 원고에 인용한 분석 대상 서버의 코드 발췌 | 각 프로젝트의 라이선스 |

자세한 범위는 [NOTICE.md](NOTICE.md)에 있습니다.
