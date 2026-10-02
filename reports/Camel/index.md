---
server: Camel
repo: allisterb/Camel
commit: 63f4cb2e26a2469a35f847bee607516cf6184e91
---

# Camel 원고

셀 원고의 머리다. 셀마다 같은 폴더의 `<셀ID>.md`에 쓴다.
셀과 상세 항목의 정의는 `matrix/cells/<셀ID>.yaml`을 따른다.
상세 항목마다 **구현**을 쓰고 †가 붙은 항목에는 **예외**를 따로 쓴다.
본문의 [번호]는 그 파일 끝 **근거**의 같은 번호를 가리킨다.

**기준 커밋.** [`63f4cb2`](https://github.com/allisterb/Camel/tree/63f4cb2e26a2469a35f847bee607516cf6184e91)(2026-08-27).
줄 번호는 모두 이 커밋 기준이다.

**범위.** `src/Camel.Server`의 MCP 서버를 본다.
이 서버는 code-mode 서버다. MCP 도구는 `SetCaseId`·`SetEvidence`·`VerifyEvidence`·`Execute` 넷이고 포렌식 분석은 `Execute`가 받아 실행하는 JavaScript가 부르는 SDK(`src/Camel.Toolkits`·`src/Camel.Workflows`·`src/Camel.Environments`)에서 일어난다.
그래서 SDK의 메서드와 그 아래 실행 환경(로컬·SSH)도 서버 구현으로 본다.
`camel` CLI가 사건 폴더에 깔아 주는 Claude Code 설정(`src/Camel.CLI/CaseTemplate/`)은 저장소가 함께 내놓는 클라이언트 구성이다.
상세가 클라이언트 쪽 방식을 묻는 경우(예: T02.03)에는 이 설정도 구현으로 세고, 다른 클라이언트로 붙으면 걸리지 않는다는 점을 예외에 적는다.
하위 모듈(`ext/Expect.NET`·`ext/protocol-sift-camel`)은 로컬 클론에 받지 않아 그 코드에 기대는 동작은 확인하지 못한 것으로 적는다.

**확인 방법.** 코드는 기준 커밋을 `git show`로 읽었다.
