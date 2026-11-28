# [전달] 1·3장 사례 PoC를 dfir-mcp-bench로 만들 때 (2026-11-28)

2·4장에서 findevil·trudi 사례를 PoC로 걸러 본 방식이다. 1·3장도 같은 기준으로 하면 결과를 함께 셀 수 있다. 이 파일은 전달용이라 반영하면 지워도 된다.

## 1. 목적과 기준
- 동적 분석(PoC)은 정적 분석으로 찾은 사례를 **걸러 내는 1차 필터**다. 서버 응답에서 결함이 실제로 성립하는지만 본다.
- 실제로 일어나는 상황만 만든다. 공격자의 안티포렌식(흔적 지우기·위장)은 괜찮다.
- 재현되지 않거나 억지 조건으로만 재현되는 사례는 매트릭스에서 빼고, PoC 폴더도 남기지 않는다.
- 판정 기준표(10항목)는 아래와 같다. 2·4장은 이 표로 다시 걸렀다.

| # | 상황 | 판정 |
|---|---|---|
| 1 | 실제 조건(안티포렌식 포함)에서 응답이 사례의 결함을 보인다 | 남김 |
| 2 | 쓸 이유가 없는 입력, 일부러 깨뜨린 파일, 실제 도구 출력과 다른 형식으로만 재현 | 뺌 |
| 3 | 실패가 응답에 그대로 드러남(success:false, 오류 문구가 결과 자리에 보임) | 뺌 |
| 4 | 잘림·생략 표시가 있음 | 건수·범위가 틀리거나 나머지를 못 받으면 남김, 표시가 정확하고 나머지도 받을 수 있으면 뺌 |
| 5 | 결함이 기록·보관 파일에만 있음 | 그 파일을 다시 읽는 단계(도구, 내보낸 보고서)를 PoC가 보이면 남김, 그런 단계가 없으면 뺌, 못 보였으면 보류 |
| 6 | 결함이 모델에게 가지 않는 문서(설치 지침 등)에만 있음 | 뺌 |
| 7 | 모델 확인에서 모델이 속지 않음 | 서버 응답 결함이 1이면 남김(모델 결과는 피해 정도) |
| 8 | 같은 결함(같은 코드·같은 수정)이 다른 사례에 있음 | 합침 |
| 9 | 환경(도구 없음, 버전) 때문에 확인 못 함 | 보류 |
| 10 | "어떤 말이 없음"만으로 재현되고 응답이 결함을 직접 보이지 않음 | 뺌 |

## 2. 폴더와 충돌
- PoC는 `pocs/<문제ID>/<서버>/<사례ID>/poc.yaml`, 실행 결과는 그 아래 `runs/<커밋>/`. 1·3장은 `pocs/P1xxx`, `pocs/P3xxx`만 만든다 → 2·4장과 겹치지 않는다.
- **같이 쓰는 파일은 직접 고치지 말고 요청한다**: `runner/bench/poc.py`, `bench.sh`, `web/`, `pocs/README.md`, `servers/*`(Dockerfile, constraints). 필요한 실행기 기능이 있으면 알려 주면 한쪽에서 반영한다.
- 브랜치를 나눠 작업하고 main을 자주 받는다.

## 3. PoC 쓰는 법
- 형식: `pocs/README.md`. 본보기: `pocs/P4192/findevil/P4192-010/poc.yaml`, 모델 확인이 붙은 예 `pocs/P4118/findevil/P4118-007/poc.yaml`.
- 증거 파일은 실제 형식으로 만든다(실제 로그 줄, 실제 gzip 등). 기록에 실행 사용자 번호가 들어가면 `${UID}`·`${GID}`를 쓰고 그 fixture에 `fill: true`를 붙인다.
- 외부 인터넷으로 요청이 나가면 안 된다. 외부 통신은 컨테이너 안 가짜 서버나 프록시로 받는다(본보기: `pocs/P4153/trudi/P4153-003`, `pocs/P4156/trudi/P4156-012`).
- 한국어 칸을 함께 쓴다: summary_ko, defect_ko(실제 동작 → 정상이라면 → 모델이 무엇을 잘못 아는지), setup_ko, realism(common/possible)과 realism_ko(실제로 생기는 이유 한 문장), steps·expect의 note_ko. 문체는 "-다".
- 실행: `./bench.sh poc <사례ID> --no-model` → `runs/`의 transcript.json에서 응답을 직접 읽어 규칙이 우연히 맞지 않았는지 본다.

## 4. 모델 확인 (필요한 사례만)
- 결함의 피해가 "모델이 응답을 잘못 읽는 것"뿐인 사례만 `model:` 블록을 붙인다. 기본 모델은 Haiku(claude-haiku-4-5) 한 개, 3번.
- 질문은 분석가가 실제로 묻는 짧은 문장으로, 도구 이름이나 결함 힌트를 넣지 않는다.
- 판정 규칙은 처음 몇 번은 모델 답을 직접 읽어 맞춘다(정규식이 느슨해 잘못 세는 일이 많았다).
- Mac Docker에서 로그인이 안 되면 `claude setup-token`으로 만든 토큰을 bench의 `data/oauth-token`에 저장한다(git에 올라가지 않음).

## 5. 매트릭스에 가져오기
- bench에 결과를 커밋·push한 뒤, 매트릭스 저장소에서 자기 장만 가져온다:
  `python tools/import_bench_pocs.py <bench 경로> ch1,ch3`
- 장을 적지 않으면 모든 장 파일을 다시 쓰니 꼭 장을 적는다.

## 6. 알려진 환경 문제와 쓸 수 있는 기능 (2026-11-28)
- trudi: 기본 이미지 `trudi-88fbca7`는 fastmcp 4.2.2라 job(비동기) 도구가 MCPError로 실패한다(trudi가 fastmcp를 고정하지 않은 탓). job 도구나 evtx_filter가 필요한 사례는 `variant: trudi-88fbca7-fastmcp3`을 쓴다(fastmcp 3.4.7, /usr/local/bin/evtx_dump.py 있음). vol 경로 고정, velociraptor·psort 없음은 그대로다.
- 실행기 기능(pocs/README.md 참고): 폴더 fixture(`dir: true`, 폴더 `mode`), 서버가 쓴 파일 검사(`file_contains`·`file_not_contains`·`file_regex`), 보조 서비스(`services:` — 가짜 HTTP(S) 서버·기록기), 서버가 직접 부르는 모델 백엔드용 가짜 Anthropic API(`anthropic_stub`).
- 아직 없는 것: 큰 증거 파일(메모리 이미지) 가져오기.
- 외부 서비스에는 PoC를 만들 때도 직접 요청하지 않는다(응답 형식은 문서로 확인).

## 7. 1장으로 넘기는 mulder 사례 (2026-11-28)
2장 사례 중 1장 문제와 같은 결함이라 우리 쪽에서 뺀 것이다. 1장 사례로 넣을지, 이미 있는 1장 사례에 코드 위치만 더할지 정해 주면 된다.

| 원래 사례 | 1장 대상 | 서버·커밋 | 코드 위치 | 요지 |
|---|---|---|---|---|
| P2049-025 | P1044 | mulder 3164843 | src/mulder/server/tools/case.py:432-466; src/mulder/db.py:1254-1310 | `verify_evidence_integrity`는 적재 때 기록한 해시와 비교해 검증한다고 알리지만 해시가 없어 비교하지 못한 `no_hash_recorded` source가 있어도 `modified`가 0이면 전체 `status`를 `all_verified`로 내고, 그 source의 `window_count`도 0으로 채운다. (조건: 해시 기록 기능 이전에 만든 사건 DB를 쓸 때) |
| P2054-054 | P1021-017 | mulder 3164843 | src/mulder/server/tools/artifacts.py:1181-1186; src/mulder/server/tools/composite/exfil.py:502-505 | `detect_timestomping` 오류의 `suggestion`과 exfil 복합 도구 안내가 등록되지 않은 `run_ez_tool('MFTECmd', ...)`를 지시해(실제는 `run_mft_parser`) 없는 도구 호출이 된다. |
| P2054-059 | P1021 | mulder 3164843 | src/mulder/orchestrator/prompts/cross_system_analyst.md:98-101; src/mulder/server/tools/findings.py:995-997; src/mulder/orchestrator/phases.py:187-187 | cross-system analyst 시스템 프롬프트가 `deduplicate_findings`(dry_run 후 적용)를 쓰라고 지시하지만 이 도구의 `tool_access`는 NARRATIVE_EXECUTOR·NARRATIVE_ANALYST·REPORT뿐이라 CROSS_ANALYST allowlist에 없어, 그 단계의 모델에는 해당 도구가 주어지지 않는다. |
| P2054-060 | P1021 | mulder 3164843 | src/mulder/orchestrator/prompts/extract_analyst.md:108-120; src/mulder/server/tools/extract/evtx.py:466-468; src/mulder/orchestrator/phases.py:161-161 | extract analyst 프롬프트가 EVTX가 있으면 `index_evtx_file`로 모든 채널을 색인하라(MANDATORY)고 지시하지만 이 도구는 `Role.EXTRACT_EXECUTOR` 전용이라 EXTRACT_ANALYST allowlist에 없어, 지시대로 호출할 수 없다. |
| P2049-054 | P1042-013 | mulder 3164843 | src/mulder/server/tools/case.py:147-183; src/mulder/server/tools/case.py:240-260 | `scan_evidence`는 'Evidence hashing complete for chain of custody'라 알리지만 `_hash_and_register_evidence`는 파일이 아닌 manifest 항목(디렉터리형 증거)을 조용히 건너뛰고 해시한 개수도 알리지 않아, 해시하지 않은 증거가 있어도 완료로 표기된다. (조건: 디렉터리형 증거) |
| P2049-099 | P1021-020 | mulder 3164843 | src/mulder/server/tools/core.py:572-587; src/mulder/db.py:763-771; src/mulder/server/tools/extract/misc.py:240-275 | `parse_prefetch`는 파싱된 Prefetch 전체를 돌려준다고 알리지만 어느 도구도 만들지 않는 source 이름 `prefetch.all`을 읽어(`run_prefetch_parser`는 `ez.prefetch`로 적재) 추출 뒤에도 늘 0건 성공을 돌려준다. |
| P2066-023 | P1013-004 | mulder 3164843 | src/mulder/server/tools/extract/misc.py:735-756 | `run_regripper`의 `profile`을 검사하지 않고 `-p`로 넘겨 rip.pl이 플러그인 폴더에 이어 붙여 require하므로, `../`가 든 값이면 플러그인 폴더 밖의 Perl 파일이 실행된다. |
