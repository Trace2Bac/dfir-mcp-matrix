# [전달] 4장으로 넘기는 후보: 1·3장에서 뺀 실행 결과 판단과 결과 전달 사례 (2026-11-27)

1·3장을 정리하며 4장 처리(실행 결과 판단, 결과 전달)의 결함이라고 본 사례다. 1번은 이번 정의 적합성 점검에서 뺀 것이고, 2번은 ch13 때 넘겼으나 지금 4장 근거에서 찾지 못한 것이다. 4장에 이미 같은 사례가 있는지 보고 없으면 더해 주면 된다.

## 1. 4.1.1 외부 프로그램 실행 결과 판단: 1장 1.5.4에서 뺀 1건

1.5.4 P1044 "기준값과 일치를 확인하지 못한 대조를 검증 성공으로 알림"은 검증 성공으로 응답하는 결함만 다룬다. 아래 사례의 응답은 `verified: false`, 'Image integrity unverifiable'이라 검증 성공이 아니다. 결함은 `ewfverify` 출력에서 저장 해시를 읽지 못한 채 0이 아닌 종료 코드를 '저장 해시 없음'으로 해석한 데 있다.

| 옛 사례ID | 서버 | 커밋 | 코드 위치 | 요지 |
|---|---|---|---|---|
| P1044-008 | SAVVYDFIR-MCP | 9ac8e47 | sift_mcp/tools/evidence.py:95-98; sift_mcp/tools/evidence.py:190-200; sift_mcp/tools/evidence.py:298-322; sift_mcp/tools/evidence.py:356-364 | `_HASH_RE`가 `ewfverify` 20140807의 저장 해시 줄을 읽지 못하고 종료 코드가 0이 아니면 저장 해시가 없는 경우로 처리해 `unverifiable`이라 적고 최상위 `status`는 success다. 1바이트를 바꾼 E01이 "unverifiable … Proceed with investigation" 발견사항과 `status: success`로 처리됐다 |

## 2. ch13 때 넘겼으나 지금 4장에서 찾지 못한 것

`Kyun_넘길목록`(ch13, 2026-11-26)에 적어 넘겼던 사례 가운데, 사례 요지의 핵심 낱말로 지금 2·4장 근거를 찾아 나오지 않은 것이다. 다른 말로 적혀 있을 수 있으니 확인해 주면 된다.

| 보낼 곳 | 서버 | 커밋 | 코드 위치 | 요지 |
|---|---|---|---|---|
| 4.1.2 | mulder | 3164843 | src/mulder/server/tools/phone.py:271-288; src/mulder/server/tools/phone.py:368-391; src/mulder/server/tools/phone.py:594-600 | 모바일 파서는 SQLite 질의 오류를 빈 목록으로 바꾸고 이를 일반 발견 없음과 같은 빈 결과로 처리한다 |
| 4.2.3 | MyIRTeam | 5fcaf7b | artifact-forensic-mcp/server.py:1634; artifact-forensic-mcp/server.py:1680-1686; artifact-forensic-mcp/server.py:1706-1721; artifact-forensic-mcp/server.py:1726-1728; artifact-forensic-mcp/server.py:3037-3058 | `parse_windows_artifact_with_eztools`는 하이브를 직접 분석할 때 항상 RECmd에 `--nl`을 넘기고 하이브 옆의 `.LOG1`, `.LOG2`나 dirty 여부를 보지 않는다. RECmd가 낸 "Data may be missing" 경고 없이 `SUCCESS`가 되고 응답은 `registry_transaction_logs_requested: false`만 싣는다 |
| 4.4.2 | Cyber-Incident-Investigation-and-Triage-MCP-Server | 39e8509 | handlers/macos_handlers.py:592-600; handlers/macos_handlers.py:682-686; server.py:512-516; core/logging_setup.py:14-22 | `analyze_macos_keychain`의 `Executing:` 줄은 비밀번호를 빼지만 앞 줄 `Command base:`와 `call_tool`의 `Tool called` 줄이 비밀번호를 DEBUG 파일 로그에 적는다 |
| 출력 경로를 정하는 처리(4장 또는 3장 협의) | trudi | 88fbca7 | core/executor.py:155; core/executor.py:239; core/executor.py:408; tools/_output_reader.py:176-233 | 실행기 결과의 `cmd`는 인자를 공백 하나로 이은 문자열이라, 출력 읽기 코드가 `shlex.split` 실패 때 공백으로 나눈 조각을 실제로 있는 경로가 될 때까지 다시 이어 출력 경로와 입력 경로를 추정한다(지금 P4095-061은 읽기 오류를 빈 문자열로 받는 다른 결함) |

이미 반영된 것으로 보인 것(참고): Wireshark-MCP `wireshark_capture`(P4101-028), findevil `get_audit_trail`(P2049-003), findevil `baseline_diff`(P4095-018), mcp-velociraptor `realtime_collection`(P4093-017), regipy 열지 못한 하이브(P4095-031 등), mcp-velociraptor `start_hunt`(P2062-017), CIIT `export_table`(P2054-043).

## 3. 4.2.3 해석 한계 표시: 1장 1.3.1 재판정 중 나온 1건

1.3.1 P1023 「절차 안내 장치의 적용 조건이 조사 상태와 어긋나 맞지 않는 절차가 쓰임」으로 sift-mcp를 다시 판정하다 나온 사례다. 빠지는 것이 절차가 아니라 결과의 해석 한계와 교차 확인 안내라 4.2.3 P4118 「해석 한계 표시 누락」 쪽으로 보았다. 1장에는 넣지 않았다.

| 서버 | 커밋 | 코드 위치 | 요지 |
|---|---|---|---|
| sift-mcp | 5ef6081 | packages/sift-mcp/src/sift_mcp/server.py:27-32; packages/sift-mcp/src/sift_mcp/server.py:35-61; packages/sift-mcp/src/sift_mcp/server.py:354; packages/sift-mcp/src/sift_mcp/response.py:259-262; packages/sift-mcp/data/catalog/zimmerman.yaml:28-41; packages/forensic-knowledge/data/tools/zimmerman/appcompatcacheparser.yaml:6 | `run_command`는 명령에서 옵션이 아닌 낱말마다 파일 이름에 `security`, `system`, `sysmon`, `powershell`이 부분 문자열로 들어 있는지 보아 이벤트 로그 종류를 정하고, 응답 안내에는 도구의 `artifacts_parsed` 가운데 그 값과 같은 artifact의 안내만 남긴다. 그래서 카탈로그 예시대로 `AppCompatCacheParser -f <SYSTEM 하이브>`를 실행하면 레지스트리 하이브가 `event_logs_system`으로 판정되어 `shimcache` 안내가 모두 빠진다. ShimCache 항목이 실행을 증명하지 않는다는 안내와, Prefetch, UserAssist, BAM으로 교차 확인하라는 `corroboration`이 응답에 붙지 않는다. `rip.pl -r SYSTEM`도 같은 판정으로 `bam`, `userassist` 같은 artifact 안내가 빠진다. |

## 정해 줄 것
1. 1번을 4.1.1에 둘지.
2. 2번 네 건이 이미 다른 말로 들어 있는지, 없으면 표의 보낼 곳에 더할지. trudi 건은 3장 출력 경로 처리와 경계가 걸려 함께 정하면 된다.
3. 3번 한 건을 4.2.3 P4118에 둘지.

이 파일은 전달용이다. 반영하면 지워도 된다.
