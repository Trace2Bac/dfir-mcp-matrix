# [전달] 1장 1.1.2로 넘기는 후보: 증거 접근 범위를 두지 않음 (2026-11-27)

2장 소제목 판정(2.2.5 경로 검증) 중에 나온 후보 5건이다. 1장에서 다룰지, 새 문제로 만들지 정해 주면 된다.

## 왜 넘기나
- 2장 2.2.5 P2066 "읽기 경로 검증 부적절"(CWE-22)은 **정해 둔 허용 위치가 있는데 그 밖으로 벗어나는** 결함만 센다.
  - 예: 접두어 비교 오류, 링크 따라감, 일부 도구만 검사 누락, 허용 목록을 설정하지 않으면 검사를 건너뜀(Wireshark-MCP P2066-024).
- 아래 5개 서버는 **허용 위치 개념 자체가 없다**. 분석 호스트의 어떤 경로든 대조 없이 읽는다.
  - 정한 범위가 없으니 벗어날 곳도 없어 CWE-22와 결함 모양이 다르다.
  - 그래도 위험은 있다. 증거 속 문구가 모델을 속이면 모델이 분석 호스트의 다른 파일(자격증명, 다른 사건 자료)을 읽어 응답으로 가져올 수 있다.
- 이것은 "읽을 범위를 정하는가"라는 설계 문제라 1장 1.1.2 "증거 접근 범위 설정"의 주제다.
  - 지금 1.1.2에는 P1004(범위가 사건 단위가 아님)만 있어, "범위를 아예 두지 않음"은 어디에도 잡히지 않는다.

## 2장 쪽 처리
- 5개 서버의 2.2.5 판정은 **기능 없음**(허용 위치를 대조하는 기능이 없음)으로 둔다.
- 화면에서 기능 없음은 결함이 없는 것처럼 보이므로, 1장에서 다루기 전까지는 이 5개 서버가 경로 문제에서 깨끗해 보인다는 점을 알아 둔다.

## 후보 5건
| 서버 | 커밋 | 코드 위치 | 요지 |
|---|---|---|---|
| Camel | 63f4cb2 | src/Camel.Toolkits/UnixTools/UnixToolsToolkit.cs:140-141 | 허용 위치 개념이 없어 어떤 경로도 대조 없이 읽음(sudo 옵션 포함, 예: Sha256SumAsync, CopyFileAsync source). 등록 증거는 쓰기 가드에만 쓰임. 분석 워크스테이션 전체 접근이 설계 의도일 수 있음 |
| regipy | c6de929 | regipy_mcp_server/server.py:120-133; regipy_mcp_server/server.py:35-63 | `set_hive_directory`가 받은 폴더를 대조하지 않고 안의 파일을 모두 연다. 운영자가 `REGIPY_HIVE_DIRECTORY`로 정한 위치 대신 임의 폴더를 읽는다(환경 변수를 허용 위치로 볼지에 따라 갈림) |
| VolPilot | 5c84851 | mcp_server.py:1207-1250; plugins/memory.py:62-89 | `windows_strings`의 `strings_file`을 resolve만 하고 volatility3 strings 플러그인에 넘겨 임의 경로 파일을 읽음(메모리에 매핑된 줄만 나옴) |
| WireMCP | 7f45f8b | index.js:301-320; index.js:365-382 | `analyze_pcap`·`extract_credentials`의 `pcapPath`를 존재만 보고 tshark로 읽음(캡처 파일이어야 내용이 나옴) |
| winforensics-mcp | cce7f36 | winforensics_mcp/server.py:3327-3337; winforensics_mcp/parsers/csv_ingestor.py:282-288 | `ingest_parsed_csv` 등이 존재·파일 여부만 보고 읽어 임의 경로 CSV의 행을 돌려줌 |

- 커밋은 각 서버의 기준 커밋(`problems/_data/snapshots.csv`)이다.

## 정해 줄 것
1. 1.1.2에 새 문제로 둘지(예: "증거 접근 범위 미설정"), P1004를 넓힐지, 다루지 않을지.
2. 새 문제라면 CWE 후보: CWE-73(External Control of File Name or Path) 또는 CWE-552(Files or Directories Accessible to External Parties). 둘 다 MITRE 매핑 허용 여부를 확인해야 한다.
3. Camel처럼 "분석 워크스테이션 전체 접근"을 설계로 밝힌 서버를 결함으로 볼지.

## 같은 날 함께 넘긴 것
- findevil(d1a8d25) `src/findevil/tools/autonomy.py:58-76`: `assess_coverage`가 `audit.json` 전체를 세션 구분 없이 읽어 이전 실행 기록을 이번 조사로 센다 → 3장 P3171(3.2.3 파생물 조회와 재사용) 후보. 2장 P2191(호출 간 상태 잔존)은 앞 호출의 인자가 남는 경우만 다뤄 넣지 않았다.

이 파일은 전달용이다. 반영하면 지워도 된다.
