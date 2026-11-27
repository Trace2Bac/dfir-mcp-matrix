# [전달] 2장으로 넘기는 후보: 1·3장에서 뺀 도구 설명, 경로 인자, 게이트웨이 지침 사례 (2026-11-27)

1·3장 사례를 잘못된 곳 하나마다 한 줄로 나눈 뒤 사례마다 문제 정의(전제, 결함, 경계)에 맞는지 점검했다. 아래는 1·3장 정의에 맞지 않고 2장 처리(도구 설명, 입력 검사)의 결함이라고 본 사례다. 2장에 이미 같은 사례가 있는지 보고 없으면 더해 주면 된다.

## 1. 2.1 도구 설명: 1장 1.3.1에서 뺀 3건

1.3.1 P1021 "다음 작업 안내를 실행 조건과 대조하지 않아 따를 수 없는 작업을 안내함"은 다른 도구나 선행 작업을 안내하는 결함만 다룬다. 아래는 도구 자기 인자의 설명이나 도구 목록 문서가 틀린 것이라 도구 설명 결함으로 보았다. 1·3장 근거에서는 뺐다.

| 옛 사례ID | 서버 | 커밋 | 코드 위치 | 요지 |
|---|---|---|---|---|
| P1021-005 | regipy | c6de929 | regipy_mcp_server/server.py:184-205; regipy/hive_types.py:1-9 | `list_available_plugins`의 설명은 `hive_type` 예로 'SYSTEM', 'SOFTWARE', 'NTUSER'를 안내하지만 실제 값은 소문자 'system', 'ntuser' 등이고 서버는 대소문자를 바꾸지 않고 비교한다. 안내대로 부르면 플러그인 0개를 정상 응답으로 돌려준다 |
| P1021-022 | regipy | c6de929 | regipy_mcp_server/server.py:292-310; regipy_mcp_server/server.py:95-97; regipy/hive_types.py:1-9 | `run_all_plugins_for_hive`의 설명은 `hive_type` 예로 'SYSTEM', 'SOFTWARE', 'NTUSER', 'SAM'을 안내하지만 실제 값은 소문자이고 서버는 대소문자를 바꾸지 않고 비교한다. 안내대로 부르면 해당 하이브가 없다는 오류를 낸다 |
| P1021-030 | verdict-dfir | acada5c | CLAUDE.md:39; CLAUDE.md:73-80; agent-config/TOOLS.md:7-8; agent-config/TOOLS.md:14-20; agent-config/TOOLS.md:24-245 | CLAUDE.md가 조사 전에 읽으라는 TOOLS.md에는 서버에 등록된 `disk_mount`, `disk_extract_artifacts`, `disk_unmount` 절이 없다 |

- 1장 쪽 결과: regipy의 1.3.1은 다른 안내 사례가 없어 기능 없음이 되었다.

## 2. 2.2.5 경로 검증: mcp_dfir 이름 인자의 `..`

1장 1.5.1 P1034 "쓰기 거부 검사가 일부 쓰기를 빠뜨려 보호할 증거가 바뀜"에는 그대로 둔다(서버가 호스트에서 직접 쓰는 파일을 증거 폴더와 대조하지 않음). 그 원인인 이름 인자의 `..`를 거르지 않는 것은 입력 검사의 결함이라 2장에서 따로 다룰 만하다. 2장에는 아직 없다(P2060-005는 정의 밖 키를 버리는 다른 결함).

| 1장 사례ID | 서버 | 커밋 | 코드 위치 | 요지 |
|---|---|---|---|---|
| P1034-003 | mcp_dfir | 305fcad | mcp_dfir/data_manager.py:81-86 | `add_analyst_note`의 `title`에 `..`를 넣으면 메모 폴더 밖, 사건 폴더의 `evidence` 아래에 메모 파일이 생긴다 |
| P1034-015 | mcp_dfir | 305fcad | mcp_dfir/tools/volatility.py:40-42; mcp_dfir/tools/volatility.py:72-81 | `download_windows_symbol`의 `pdb_name`과 `guid`에 `..`를 넣으면 기호 폴더 밖에 파일이 생기고, 내려받기 전에 그 아래 폴더부터 만든다 |
| P1034-016 | mcp_dfir | 305fcad | mcp_dfir/tools/volatility.py:150-154 | `download_linux_symbol`은 `symbol_path`를 `/`로만 잘라 마지막 조각을 이름으로 써서, Windows 호스트에서 `\`와 `..`로 기호 폴더 밖에 쓴다 |

## 3. 2.1.3 중간 계층의 도구 정의 변형: 1장 1.3.1에서 뺀 1건

1.3.1 P1023 「절차 안내 장치의 적용 조건이 조사 상태와 어긋나 맞지 않는 절차가 쓰임」의 결함에서 "서버 문서가 안내하는 연결 방식 가운데 일부에서 적용하지 않는다"를 뺐다. 이 구절에 기대던 사례는 아래 하나였다. 원인은 장치의 적용 조건이 아니라 게이트웨이 지침이 백엔드 지침을 줄여 내보낸 것이라, 2.1.3 P2056 「중간 계층의 도구 정의 변형」의 결함으로 보았다.

| 옛 사례ID | 서버 | 커밋 | 코드 위치 | 요지 |
|---|---|---|---|---|
| P1023-003 | sift-mcp | 5ef6081 | packages/sift-common/src/sift_common/instructions.py:7-42; packages/sift-common/src/sift_common/instructions.py:94-119; setup-sift.sh:2221-2250; setup-sift.sh:2378 | 백엔드별 forensic 지침에는 INVESTIGATION STARTUP과 문맥 압축 뒤 안내가 있지만 gateway 지침은 그 안내가 없는 축약본이고, 로컬 설치는 게이트웨이 응답을 기다리지 않고 클라이언트를 설정해 묶음 끝점으로 연결한 클라이언트는 조사 시작 절차를 받지 못한다. |

- 1장 쪽 결과: sift-mcp의 1.3.1 P1023 칸은 다른 장치(`case-dir-check.sh`, `case-data-guard.sh`)로 다시 판정한다.

## 정해 줄 것
1. 1번 세 건을 2.1의 어느 문제에 둘지(자기 인자 설명이 틀림, 도구 목록 문서에서 빠짐).
2. 2번 세 건을 2.2.5에 둘지. 1장 P1034와 같은 사례지만 고치는 곳(입력 검사, 쓰기 검사)이 달라 양쪽에 둘 수 있다고 보았다.
3. 3번 한 건을 2.1.3 P2056에 둘지.

이 파일은 전달용이다. 반영하면 지워도 된다.
