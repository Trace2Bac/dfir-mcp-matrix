# 고치는 법

이 저장소를 고치는 사람과 LLM이 함께 따르는 안내다.
파일 형식은 [matrix/README.md](matrix/README.md)(셀 정의)와 [reports/README.mdx](reports/README.mdx)(원고)에 있다.

## 처음 한 번

```
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python tools/pilot.py validate
cd web && npm ci && npm start                          # http://localhost:3000/dfir-mcp-architecture-matrix-v2/ 에서 매트릭스를 본다(Node.js 20 이상)
```

원고의 코드 발췌를 채우거나(`fill`) 대조하려면(`check`) 두 가지가 더 있어야 한다.

- 옛 매트릭스 저장소(`Claude outputs`). 경로·링크 변환(`tools/linkify.py`)과 문장 검사(`tools/style_lint.py`)를 거기서 읽는다. 이 저장소 옆 폴더에 두거나 환경변수 `DFIR_V1`에 경로를 준다. 서버의 저장소·기준 커밋은 이 저장소의 `reports/<서버>/index.mdx` 머리말이 원본이다.
- 분석 대상 서버의 저장소 클론. 기본은 `Claude outputs`의 부모 폴더이고 다르면 환경변수 `DFIR_CLONES`에 클론을 모아 둔 폴더를 준다. 폴더 이름은 서버 이름과 같아야 한다. 기준 커밋을 `git show`로 읽으므로 checkout은 하지 않아도 된다.

## 원본과 생성물

**원본만 고친다.** 화면 데이터 `web/static/data/matrix.json`은 `build`가 만들고 사이트 `web/build/`는 `npm run build`가 만드는 생성물이라 저장소에 올리지 않는다(`.gitignore`). `npm start`·`npm run build`가 화면 데이터를 먼저 다시 만든다. CI가 PR·`main` 푸시마다 사이트를 빌드해 Actions 아티팩트 `matrix-site`로 올린다.

| 고치려는 것 | 파일 |
|---|---|
| 축 차례·이름 | `matrix/axes.yaml` |
| 셀의 질문·상세 항목·정의 | `matrix/cells/<ID>.mdx` |
| 화면에 보일 서버·시범 셀 | `matrix/config.yaml` |
| 서버의 구현·예외 설명과 근거 | `reports/<서버>/<셀ID>.mdx` |
| 서버의 기준 커밋·확인 방법 | `reports/<서버>/index.mdx` |
| 구조를 바꾼 이유 | `docs/decisions/NNNN-short-english-title.mdx` |
| 배경 설명(원칙·경계·옛 셀 대응) | `docs/redesign-plan-2026-09-30.mdx` |
| 화면 모양 | `web/`(Docusaurus. 셀 표·셀 페이지는 `web/src/components/Matrix/`, 근거 링크는 `web/src/remark/`) |
| 도구 | `tools/pilot.py` |

## 고친 뒤 확인

```
python tools/pilot.py validate      # 늘 돈다. 스키마와 파일끼리의 일관성
python tools/pilot.py check         # 원고를 고쳤으면. 형식·표지·근거·발췌 원문·문장
cd web && npm start                # 화면으로 본다. 원고를 고치면 다시 그린다
```

PR을 열면 CI가 `validate`와 `build`를 돌리고 실패하면 PR에 빨간 X가 뜬다. `check`는 옛 저장소와 클론이 있어야 해서 로컬에서 돌린다.

## 작업별 순서

### 서버의 구현·예외 설명을 고친다

1. `reports/<서버>/<셀ID>.mdx` 본문을 고친다.
2. 문장을 옮겼으면 `renumber <서버>`, 발췌를 더했으면 `fill <서버>`.
3. `check <서버>`.

### 서버가 드는 상세나 †를 바꾼다

1. 그 파일 머리말 `details`를 고친다. `exception: true`가 †다.
2. 본문 `### <상세 번호> …` 소제목을 머리말과 같은 차례로 맞춘다. †를 붙였으면 `**예외.**`를 쓰고 뗐으면 지운다.
3. `check <서버>`.

### 서버 원고를 새로 쓴다

[reports/README.mdx](reports/README.mdx#새-서버-원고를-시작한다)를 따른다.

### 상세를 더하거나 이름을 바꾸거나 합친다 (자주)

서버를 조사하며 상세가 바뀌는 것은 흔한 일이다. 결정 기록 없이 셀 파일만 고친다.

1. [matrix/README.md의 상세 다루기](matrix/README.md#상세-다루기) 표대로 `matrix/cells/<ID>.mdx`을 고친다. **상세 번호는 바꾸거나 다시 매기지 않는다.** 지운 상세는 `retired`로 옮긴다.
2. 상세 이름은 방식만 짧게 적는다. 괄호로 예시나 부가 설명을 붙이지 않고 그런 내용은 `include`·`exclude`에 적는다.
3. 새 상세는 실제 구현체가 있을 때 더한다. 그 서버 원고에 연결하거나, 원고를 아직 못 쓰면 `seen_in`에 서버를 적는다. 둘 다 없으면 화면에 후보로 보인다.
4. `validate`. 합치거나 지운 번호를 쓰는 원고가 있으면 어느 파일인지 알려 준다.
5. 커밋 메시지에 무엇을 왜 바꿨는지 쓴다.

### 셀의 질문·범위를 고친다 (드물다)

1. `matrix/cells/<ID>.mdx`의 `question`·`scope`·`not_implemented`·`not_applicable`·`boundary`를 고친다.
2. 결정을 더한다(아래).
3. `validate` → 원고를 고쳤으면 `check`.

### 셀을 나누거나 합치거나 번호를 바꾼다

지금 셀로 분류할 수 없는 새 기능이 나왔을 때만 한다.

1. `matrix/cells/`에서 파일을 만들거나 지우거나 이름을 바꾼다. 파일 이름과 `id`가 같아야 한다.
2. 그 셀을 쓴 원고 파일(`reports/*/<ID>.mdx`)의 이름·`cell`·상세 번호를 고친다.
3. 다른 셀의 `boundary`·`include`·`exclude`와 `docs/redesign-plan-2026-09-30.mdx`에서 옛 번호를 새 번호로 고친다. 나눈 셀을 가리키던 문장은 어느 쪽인지 하나씩 읽고 정한다.
4. 시범 셀이면 `matrix/config.yaml`의 `pilot_cells`도 고친다.
5. 결정을 더하고 옛 번호와 새 번호의 대응표를 둔다.
6. `validate` → `check`.

**번호를 일괄 치환할 때 주의.**

- `E01`은 셀 번호이면서 EnCase 디스크 이미지 형식 이름이다(개편안 10.6절 CS2, `reports/trudi/E03.mdx`).
- `H10`은 옛 49개 셀 번호로 개편안 10.5절 첫 칸에 남아 있다. "옛 A05"처럼 일부러 옛 번호를 쓴 문장도 있다.
- 결정 기록 본문의 셀 번호는 그 결정을 내린 때의 번호라 고치지 않는다. 첫 버전 전 결정(`docs/decisions/0000-pre-release-decisions.mdx`)은 옛 글자를 써서 지금 번호와 겹친다(옛 E02는 지금의 R02, 지금의 E02는 옛 C02).

정규식으로 바꾼 뒤에는 diff를 읽는다.

### 결정을 더한다

[docs/decisions/README.mdx](docs/decisions/README.mdx)를 따른다. `template.mdx`를 복사해 `NNNN-short-english-title.mdx`로 만든다. **셀**을 더하거나 나누거나 범위를 바꿀 때 쓴다. 상세 단위의 변경은 커밋 메시지로 충분하다.

## 판단 기준

- **셀 하나는 질문 하나다.** 구현·미구현은 셀의 질문에 대해 판단한다. 한 서버가 같은 셀의 여러 상세에 들 수 있다.
- 셀 이름은 묻는 일을 명사로 쓴다.
- 같은 일을 다른 주체(서버 코드·실행 환경·클라이언트·백엔드)가 해서 방식이 달라지면 상세를 나눈다.
- 결이 다른 질문은 한 셀에 합치지 않는다. 상세 목록이 섞여 읽기 어려우면 셀을 나눈다.
- **†(exception: true)** 는 원고의 구현에 적은 적용 범위 **안에서** 그 방식이 걸리지 않을 때만 붙인다. 우회 경로, 설정·인자로 끄는 경우, 오류 때 통과시키는 경우, 설명과 다르게 동작하는 경우, 확인하지 못한 경로가 여기에 든다. 그 방식이 서버의 어느 도구·경로에 있는지는 구현 첫머리에 적고 †로 표시하지 않는다.
- 상세는 실제 구현체가 있어야 둔다. 머릿속으로 가능한 방식을 미리 늘어놓지 않는다. 구현을 확인한 곳은 원고나 `seen_in`으로 남긴다.
- 이름이 비슷하다는 이유로 상세에 연결하지 않는다. 표시·안내는 차단이 아니다.
- **code-mode 서버**(모델이 보낸 코드가 서버 SDK를 부르고 그 코드가 응답 글을 만드는 서버)는 SDK 메서드가 그 코드에 돌려주는 객체를 R01~R06의 "결과"로 본다. 그 객체를 골라 응답으로 만드는 단계는 R01.10(호출자 코드로 가공)이다. 모델이 받는 글의 형태를 묻는 R07은 MCP 응답 글을 본다(결정 0014).
- **외부 라이브러리가 정하는 동작**은 저장소의 의존성 관리 파일(`*.csproj`·`pyproject.toml`·`package.json`·lock 파일 등)에서 실제로 쓰는 버전을 찾고 그 버전의 소스나 공식 문서를 근거로 확인한다. 근거에는 라이브러리 이름·버전·고정 링크를 적는다. 버전을 정할 수 없거나 근거를 찾지 못한 경우에만 "확인하지 못함"으로 †를 붙인다(결정 0015).
- **저장소가 외부 도구 버전을 정하지 않으면** 서버를 분석하기 전에 버전 기준을 하나 정해 `reports/<서버>/index.mdx`에 적고, 그 서버의 모든 원고가 같은 기준으로 외부 도구의 소스를 확인한다. 저장소의 설치 스크립트·Dockerfile·문서가 전제하는 환경 가운데 하나를 고르고 고른 이유를 함께 적는다. 그런 환경을 정할 수 없으면 기준 커밋 날짜에 나와 있던 최신 릴리스를 쓴다.
- 셀마다 구체적인 기준은 그 셀 YAML의 `scope`·`include`·`exclude`를 따른다.
