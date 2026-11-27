# AGENTS.md

이 문서는 이 저장소에서 작업하는 LLM 에이전트(Claude Code, Codex, Cursor 등)를 위한 지침입니다.
작업 순서는 사람 기여자와 같습니다. 먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽으세요. 데이터 형식은 [problems/_data/README.md](problems/_data/README.md)에 있습니다.

## 지켜야 할 것

- **원본 데이터만 고칩니다.** 원본은 `problems/_data/*.csv`와 장별 폴더(`problems/_data/ch1/`, `ch3/`)의 CSV입니다. 판정은 `findings.csv`에 관찰됨이나 문제 없음만 적고(장별 폴더는 판단 불가도 적습니다), 그 커밋의 분석 회차를 `snapshots.csv`에 둡니다(`problems/_data/README.md`). `problems/**.mdx`, `problems/_data/problems.json`, `web/static/data/`, `web/build/`는 생성물이므로 고치지 않습니다.
- **CSV를 고친 뒤에는 `python tools/problems_build.py`를 실행하고, 생성된 페이지도 함께 커밋합니다.** 배포할 때 CI가 다시 만들어 저장소와 다르면 실패합니다.
- **근거는 실제 코드에서 확인한 것만 씁니다.** 근거에는 서버, 커밋, 코드 위치를 적습니다. 있을 법한 문제를 지어내지 않습니다. 사람이 더한 근거는 `출처`를 비웁니다.
- **글은 글말로 씁니다.** 구어 대신 글말로 쓰고, 문장은 "~다"로 끝냅니다.
- **코드가 지은 개념 이름을 우리말로 옮기지 않습니다.** 코드 이름을 백틱으로 그대로 쓰고, 처음 나오는 곳에서만 뜻을 쉬운 우리말로 설명합니다.
- **장·항목·소제목의 구조를 바꾸면 커밋 메시지에 무엇을 왜 바꿨는지 남깁니다.** 문제 하나의 문구 수정도 커밋 메시지에 남깁니다.
- **문제ID(`P0001`)는 바꾸거나 다시 매기지 않습니다.** 문제를 다른 소제목으로 옮길 때는 `problems.csv`의 소제목ID만 고칩니다. 지운 번호는 다시 쓰지 않습니다.
- **커밋과 푸시는 사람이 요청할 때만 합니다.**

## 보고할 때

보고에는 다음을 적습니다.

- 고친 파일과 무엇을 바꿨는지
- `problems_build.py`의 출력(문제·서버·셀 수)과 `web/`의 `npm run build` 결과
- 판단이 필요해 비워 두었거나 가정한 것
