# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
npm install
```

**Note**: feel free to use the package manager of your choice.

## Local Development

```bash
npm run start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## MCP 서버 분석 (`/analyze`)

MCP 서버 소스의 1차 정적 분석. 등록 도구를 찾고, 도구마다 실제 코드를 따라가 구조를 보여 준다. 서버별 규칙은 두지 않는다. 지금은 Python 서버만 본다.

- 입력: 사이트의 Analyze 메뉴에서 둘 중 하나로 소스를 넣는다.
  - GitHub 링크: 공개 저장소만 된다. 파일 목록 API(호출 1번, 로그인 없이 한 시간에 60번)와 `raw.githubusercontent.com`으로 `.py`와 의존성 파일만 받는다. GitHub zip 다운로드는 브라우저에서 막혀 있어서(CORS) 이렇게 받는다. 브랜치·커밋은 `…/tree/<이름>`, `…/commit/<커밋>` 링크로 고른다
  - zip 파일: 비공개 저장소나 내 컴퓨터의 소스. 파일은 브라우저 밖으로 나가지 않는다
- 도구 찾기: `@x.tool`, `x.add_tool(f)`, `x.tool()(f)`, 저수준 SDK의 `Tool(name=…)`. 그냥 `@tool`과 `Tool`은 LangChain 등 다른 라이브러리일 수 있어 `mcp`·`fastmcp`에서 import한 것만 센다
- 요약: 도구 수, 도구가 호출하는 함수·파일 수(직접·간접), 반복문 등으로 등록돼 목록에 없는 도구의 위치
- 탭
  - 도구: 도구 목록 → 고른 도구의 명세와 다이어그램 → 칸을 누르면 그 함수의 코드(호출 줄의 `→`로 다음 함수로 간다). 명세는 MCP 클라이언트가 보는 설명(`description=` 또는 docstring)과 인자(타입, 기본값·필수, `Field(description=…)`)다. 문자열은 리터럴, 이어 쓴 문자열, 모듈 수준 상수(같은 파일·import)까지 따라가고, f-string처럼 실행해야 정해지는 값은 코드를 그대로 보여 준다
  - 리소스·프롬프트: `@x.resource(uri)`·`@x.prompt()`로 등록한 것의 URI·이름·설명·인자와 코드. 없어도 탭은 두고 없다고 적는다
  - 공통 경로: 둘 이상의 도구가 거치는 함수(거치는 도구가 많은 순). 고르면 거치는 도구와 거치지 않는 도구, 그 함수의 코드. 거치지 않는 도구는 공통 처리(기록, 검증 등)가 빠졌는지 확인할 곳이다
  - 서버: 서버 객체(FastMCP·MCPServer·Server)와 SDK, 지원 규격, 클라이언트 모델이 받는 지시문(`instructions=`), 전송 방식(`run(transport=…)`, 없으면 stdio)
- 지원 규격: 서버의 MCP SDK가 지원하는 규격 범위. 의존성 파일(`uv.lock`·`poetry.lock`이 있으면 그 정확한 버전, 없으면 `pyproject.toml`·`requirements*.txt` 조건의 가장 낮은 버전)에서 `mcp`·`fastmcp` 버전을 읽는다. `pyproject.toml`은 의존성 표(`dependencies`, optional·dev, poetry)만 보고, 실행용 의존성을 개발용보다 먼저 쓴다. 실제 통신 규격은 이 범위 안에서 클라이언트가 요청한 것으로 정해진다. SDK 버전 → 규격 대응은 `python.mjs`의 `MCP_SDK_PROTOCOLS`·`FASTMCP_MCP`에 있다(PyPI 배포 파일의 `LATEST_PROTOCOL_VERSION`과 `requires_dist`로 확인). 새 SDK가 새 규격을 지원하면 여기에 더한다
- 한계: 호출은 이름과 import로 잇는다. 객체를 알 수 없는 메서드 호출(`x.run()`, `ctx.db.x()`)과 동적 호출(`getattr`, 콜백 등록)은 따라가지 않는다. 실행 중에 정해지는 것(반복문 등록, 하위 서버를 붙일 때 바뀌는 이름, 실행 중에 바뀌는 설명)도 코드에 쓰인 대로만 보인다

| 파일 | 내용 |
|---|---|
| `src/analyzer/core.mjs` | 언어 판별, 읽을 파일 고르기, 요약(도구별 범위, 공통 경로) |
| `src/analyzer/python.mjs` | Python 서버: 등록 도구, 호출 그래프, 도구 밖의 MCP 기능(서버, 리소스, 프롬프트), MCP SDK 버전과 지원 규격 |
| `src/pages/analyze.tsx` | 화면 입구(GitHub 링크·zip 읽기, 파서 불러오기) |
| `src/components/Analyze/ResultView.tsx` | 결과 화면의 틀(요약, 탭) |
| `src/components/Analyze/ToolExplorer.tsx` | 도구 탭(도구 목록, 명세, 다이어그램) |
| `src/components/Analyze/McpPanels.tsx` | 리소스·프롬프트·공통 경로·서버 탭 |
| `src/components/Analyze/parts.tsx` | 탭들이 같이 쓰는 자료 형식과 조각(위치 링크, 설명, 인자, 코드) |
| `static/parser/` | 파서와 문법 wasm. npm 패키지 `web-tree-sitter@0.27.0`, `tree-sitter-python@0.25.0`에서 복사했다(MIT, `LICENSE`). 버전을 올릴 때 새 파일로 바꾼다 |

다른 언어는 `core.mjs`의 `EXTRACTORS`·`GRAMMARS`·`SDK_READERS`에 분석기, 문법, SDK 버전 읽기를 더한다. 분석기는 `python.mjs`와 같은 모양(`tools`, `dynamic`, `graph`, `mcp`)을 돌려주면 화면이 그대로 쓴다.

## Deployment

Using SSH:

```bash
USE_SSH=true npm run deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> npm run deploy
```

If you are using GitHub Pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.
