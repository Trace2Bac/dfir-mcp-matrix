---
server: sift-kernel
repo: Sathvik-1007/sift-kernel
commit: ea51bec90d4cb543e4aa6063af6e85ae3e4d9396
---

# sift-kernel 시범 전환 원고

시범 셀 원고의 머리다. 셀마다 같은 폴더의 `<셀ID>.md`에 쓴다.
셀과 상세 항목의 정의는 `matrix/cells/<셀ID>.yaml`을 따른다.
상세 항목마다 **구현**을 쓰고 †가 붙은 항목에는 **예외**를 따로 쓴다.
본문의 [번호]는 그 파일 끝 **근거**의 같은 번호를 가리킨다.

**기준 커밋.** [`ea51bec`](https://github.com/Sathvik-1007/sift-kernel/tree/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396)(2026-06-16).
줄 번호는 모두 이 커밋 기준이다.

**확인 방법.** 코드는 기준 커밋을 `git show`로 읽었다.
실행 확인은 WSL Ubuntu 26.04와 Node 22.23.3에서 서버를 MCP 클라이언트로 부른 기록(`기록/판정검토_sift-kernel_2026-09-29/`)을 인용한다.
그 환경에는 `ewfverify`·`foremost`·`tshark`가 없었고 서버를 루트 권한 없이 돌렸다.
