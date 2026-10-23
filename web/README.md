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

- 화면: 사이트의 Analyze 메뉴에서 소스를 넣는다. 두 가지 중 하나를 쓴다.
  - GitHub 링크: 공개 저장소만 된다. 파일 목록 API(호출 1번, 로그인 없이 한 시간에 60번)와 `raw.githubusercontent.com`으로 `.py`만 받는다. GitHub zip 다운로드는 브라우저에서 막혀 있어서(CORS) 이렇게 받는다. 브랜치·커밋은 `…/tree/<이름>`, `…/commit/<커밋>` 링크로 고른다
  - zip 파일: 비공개 저장소나 내 컴퓨터의 소스. 파일은 브라우저 밖으로 나가지 않는다
  - 요약: 도구 수, 도구가 호출하는 함수·파일 수(직접·간접), 반복문 등으로 등록돼 목록에 없는 도구의 위치
  - 도구 명세: MCP 클라이언트가 보는 설명(`description=` 또는 docstring)과 인자(타입, 기본값·필수, `Field(description=…)`). 문자열은 리터럴, 이어 쓴 문자열, 모듈 수준 상수(같은 파일·import)까지 따라간다. f-string처럼 실행해야 정해지는 설명은 코드를 그대로 보여 준다
  - 도구 목록 → 고른 도구의 다이어그램 → 칸을 누르면 그 함수의 코드(호출 줄의 `→`로 다음 함수로 간다)
- 호출은 이름과 import로 잇는다. 객체를 알 수 없는 메서드 호출(`x.run()`)과 동적 호출(`getattr`, 콜백 등록)은 따라가지 않는다.

| 파일 | 내용 |
|---|---|
| `src/analyzer/core.mjs` | 언어 판별, 읽을 파일 고르기, 요약(도구별 범위) |
| `src/analyzer/python.mjs` | Python 서버: 등록 도구, 호출 그래프 |
| `src/pages/analyze.tsx` | 화면 입구(GitHub 링크·zip 읽기, 파서 불러오기) |
| `src/components/Analyze/ToolExplorer.tsx` | 결과 화면(요약, 도구 목록, 다이어그램, 코드) |
| `static/parser/` | 파서와 문법 wasm. npm 패키지 `web-tree-sitter@0.27.0`, `tree-sitter-python@0.25.0`에서 복사했다(MIT, `LICENSE`). 버전을 올릴 때 새 파일로 바꾼다 |

다른 언어는 `core.mjs`의 `EXTRACTORS`·`GRAMMARS`에 분석기와 문법을 더한다. 분석기는 `python.mjs`와 같은 모양(`tools`, `dynamic`, `graph`)을 돌려주면 화면이 그대로 쓴다.

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
