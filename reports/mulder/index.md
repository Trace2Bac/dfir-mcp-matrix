---
server: mulder
repo: calebevans/mulder
commit: 3164843baf74c7fe69e7121dbd6150f8f77ce660
---

# mulder 원고

셀 원고의 머리다. 셀마다 같은 폴더의 `<셀ID>.md`에 쓴다.
셀과 상세 항목의 정의는 `matrix/cells/<셀ID>.yaml`을 따른다.
상세 항목마다 **구현**을 쓰고 †가 붙은 항목에는 **예외**를 따로 쓴다.
본문의 [번호]는 그 파일 끝 **근거**의 같은 번호를 가리킨다.

**기준 커밋.** [`3164843`](https://github.com/calebevans/mulder/tree/3164843baf74c7fe69e7121dbd6150f8f77ce660)(2026-09-19, v1.5.2 뒤 2커밋).
줄 번호는 모두 이 커밋 기준이다.

**범위.** `mulder serve`가 띄우는 MCP 서버(`src/mulder/server`)를 본다.
`mulder investigate` 오케스트레이터는 그 서버를 쓰는 MCP 클라이언트라 구현으로 세지 않고, 필요하면 원고에 사실로 적는다.

**확인 방법.** 코드는 기준 커밋을 `git show`로 읽었다.
근거의 "실행 확인"은 저장소 사본에서 서버 함수를 직접 불러 본 결과다.
