# regipy 시범 전환 원고

B04·C04·E02·F03 4개 셀을 새 보고서 형식으로 쓴 원고다. 셀과 상세 항목의 정의는 `상세정의.yaml`을 따른다. 상세 항목마다 **구현**을 쓰고 †가 붙은 항목에는 **예외**를 따로 쓴다. 본문의 [번호]는 그 절 끝 **근거**의 같은 번호를 가리킨다.

**기준 커밋.** [`1293544`](https://github.com/mkorman90/regipy/tree/1293544148a4b4dc11d2811e11c9fd7e64fa9c04)(2026-09-12, regipy 6.4.0). 줄 번호는 모두 이 커밋 기준이다.

**확인 방법.** 코드는 기준 커밋을 `git show`로 읽었다. 실행 확인은 서버 모듈을 Python 3.14와 mcp 1.29.0에서 불러 저장소의 테스트 하이브로 돌린 기록(`기록/판정검토_regipy_2026-09-26/`)을 인용한다.

## B04 선행 상태에 따른 실행 제어 방식

**상세 항목.** B04.01 메모리 상태·능력 집합 대조

### B04.01 메모리 상태·능력 집합 대조

**구현.** 서버는 적재한 하이브를 프로세스 전역 `dict` `_loaded_hives`에 둔다 [1]. 이 상태는 기동 인자나 환경변수로 받은 폴더를 서버가 시작할 때 읽거나 모델이 `set_hive_directory`를 부를 때 채워진다 [2]. 하이브를 읽는 도구 4개(`run_plugin`·`run_all_plugins_for_hive`·`list_relevant_plugins`·`get_registry_key`)는 `_loaded_hives`가 비어 있으면 하이브를 읽지 않고 오류를 돌려준다 [3]. 오류 문구는 `set_hive_directory`를 먼저 부르라고 알린다 [3]. `list_available_hives`는 같은 확인을 문자열로 알린다 [4]. 이 확인을 건너뛰고 하이브를 읽는 도구나 인자는 없다 [3].

이 확인은 적재한 하이브가 하나라도 있는지만 본다. 플러그인에 맞는 유형의 하이브가 있는지 보는 확인은 선택한 방법과 입력을 맞대는 일이라 A02에서 본다. `set_hive_directory`에 폴더가 아닌 파일 경로를 주면 `iterdir()`가 예외를 내 `_loaded_hives`를 바꾸기 전에 끝나고 이어서 부른 `run_plugin`은 앞서 적재한 폴더의 하이브로 답했다 [5]. 적재 상태가 얼마나 남는지는 A05에서 본다 [1].

### 근거

[1] 적재한 하이브를 담는 전역 상태다.

```python
# Global state for loaded hives
_loaded_hives: dict[str, RegistryHive] = {}
_hive_directory: Optional[str] = None
```

[`regipy_mcp_server/server.py:30-32`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L30-L32)

[2] 시작할 때 폴더를 읽고([`regipy_mcp_server/server.py:72-92`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L72-L92)) 도구가 폴더를 바꾸면 다시 적재한다([`regipy_mcp_server/server.py:130-133`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L130-L133)).

[3] 하이브가 없으면 거부한다. 같은 확인이 [`regipy_mcp_server/server.py:303-304`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L303-L304), [`regipy_mcp_server/server.py:341-342`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L341-L342), [`regipy_mcp_server/server.py:381-382`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L381-L382)에 있다.

```python
    if not _loaded_hives:
        return {"error": "No hives loaded. Use set_hive_directory first."}
```

[`regipy_mcp_server/server.py:251-252`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L251-L252)

[4] 하이브 목록 도구의 확인: [`regipy_mcp_server/server.py:163-164`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L163-L164).

[5] 폴더를 도는 `iterdir()`([`regipy_mcp_server/server.py:52`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L52))는 전역 상태에 대입하기 전에 불린다([`regipy_mcp_server/server.py:132-133`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L132-L133)). 파일 경로를 준 뒤 `run_plugin`이 앞 폴더의 하이브로 답한 결과(실행 확인, [판정검토_regipy_2026-09-26.md 131줄](../../판정검토_regipy_2026-09-26.md)).
## C04 원본 변경 방지 방식

**상세 항목.** C04.03 읽기 전용 접근 API

### C04.03 읽기 전용 접근 API

**구현.** `RegistryHive`는 하이브 파일을 `rb` 모드로 열어 내용 전체를 `BytesIO`에 복사하고 파일을 닫는다 [1]. 헤더 해석부터 플러그인 실행까지 뒤의 모든 파싱은 이 메모리 사본에서 한다 [1]. 서버 코드에는 파일을 쓰는 호출이 없다 [2]. 서버가 import하는 `regipy.plugins.utils`에는 하이브를 JSON 파일로 쓰는 `dump_hive_to_json`이 있지만 어느 도구도 이 함수를 부르지 않는다 [3]. 트랜잭션 로그를 적용해 복원 하이브를 쓰는 `regipy.recovery`는 서버가 import하지 않는다 [2]. 마운트 옵션이나 파일 권한 같은 다른 장치는 없다.

### 근거

[1] 하이브를 읽기 모드로 열어 메모리에 복사한다.

```python
        with open(hive_path, "rb") as f:
            self._stream = BytesIO(f.read())
```

[`regipy/registry.py:146-147`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy/registry.py#L146-L147)

[2] 서버가 import하는 모듈이다. `regipy.recovery`는 없다.

```python
# Import all plugins so they auto-register via __init_subclass__
import regipy.plugins  # noqa
from regipy.plugins.plugin import PLUGINS
from regipy.plugins.utils import run_relevant_plugins
from regipy.registry import RegistryHive
```

[`regipy_mcp_server/server.py:17-21`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L17-L21)

[3] 파일을 쓰는 함수: [`regipy/plugins/utils.py:55-71`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy/plugins/utils.py#L55-L71). 서버가 이 모듈에서 쓰는 것은 `run_relevant_plugins`뿐이다([`regipy_mcp_server/server.py:316`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L316)).
## E02 대량 결과 전달 방식

**상세 항목.** E02.06 값 단위 잘림†

### E02.06 값 단위 잘림

**구현.** regipy 라이브러리는 값 하나의 최대 길이 `MAX_LEN`을 256으로 둔다 [1]. 키의 값을 돌려주는 `iter_values`는 기본으로 `trim_values=True`를 쓴다 [2]. 문자열·이진 값을 풀어 쓰는 `try_decode_binary`는 이때 값을 256자에서 자른다 [3]. 잘린 값에는 표시가 없다 [3]. 플러그인이 `iter_values`를 기본 인자로 부르면 이 잘림이 결과에 그대로 실린다 [4].

**예외.** 잘림은 `iter_values`를 기본 인자로 부르는 플러그인에만 걸리고 `trim_values=False`로 부르는 플러그인은 자르지 않는다 [4]. 값 말고는 한도가 없다. 서버는 응답 크기와 건수를 제한하지 않는다 [5]. SYSTEM 하이브 하나에 `run_all_plugins_for_hive`를 부르자 응답이 6,526,629바이트였다 [6]. 같은 유형의 하이브를 여럿 적재하면 모두 한 응답에 들어간다 [5].

### 근거

[1] 값 길이 상한이다.

```python
# Max size of string to return when as_json=True
MAX_LEN: int = 256
```

[`regipy/utils.py:34-35`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy/utils.py#L34-L35)

[2] `iter_values`의 기본 인자: [`regipy/registry.py:501-506`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy/registry.py#L501-L506). 풀어 쓰는 곳마다 `trim_values`를 넘긴다([`regipy/registry.py:567-594`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy/registry.py#L567-L594)).

[3] 문자열을 자르고 표시를 붙이지 않는다.

```python
def try_decode_binary(data, as_json=False, max_len=MAX_LEN, trim_values=True):
    try:
        value = data.decode("utf-16-le").rstrip("\x00")
    except UnicodeDecodeError:
        try:
            value = data.decode().rstrip("\x00")
        except Exception as ex:
            logger.warning(f"Could not parse data as string, formating to hex: {ex}")
            value = binascii.b2a_hex(data).decode() if as_json else data

    if trim_values:
        value = value[:max_len]

    return value
```

[`regipy/utils.py:178-191`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy/utils.py#L178-L191)

[4] 기본 인자로 부르는 예([`regipy/plugins/ntuser/runmru.py:46`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy/plugins/ntuser/runmru.py#L46))와 자르지 않게 부르는 예([`regipy/plugins/ntuser/user_assist.py:78`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy/plugins/ntuser/user_assist.py#L78)).

[5] 전체 실행 도구는 맞는 하이브마다 플러그인 결과를 모두 모아 돌려준다.

```python
    # Run all plugins on all compatible hives
    all_results = {}
    for path, hive in compatible_hives:
        try:
            results = run_relevant_plugins(hive, as_json=True)
            serialized_results = _serialize_plugin_results(results)
            all_results[Path(path).name] = serialized_results
        except Exception as e:
            logger.error(f"Error running plugins on {path}: {e}")
            all_results[Path(path).name] = {"error": str(e)}

    return {"hive_type": hive_type, "files_analyzed": len(all_results), "results": all_results}
```

[`regipy_mcp_server/server.py:312-323`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L312-L323)

[6] 응답 크기(실행 확인, [review_3_E_values.md 156줄](../../판정검토_regipy_2026-09-26/review_3_E_values.md)).
## F03 실행 요청 내용 기록 방식

**상세 항목.** 비적용

### 비적용

**판단.** 서버는 도구 호출을 파일이나 DB에 남기지 않는다 [1]. 표준 오류로 나가는 진단 로그만 켜 둔다 [1]. 이 로그에는 하이브를 적재한 시도·성공·실패와 플러그인 오류가 찍힌다 [2]. 성공한 호출은 도구 이름도 인자도 로그에 남지 않는다 [2]. 호출 기록이 없으므로 요청 내용을 무엇으로 기록하는지 볼 대상이 없다.

### 근거

[1] 진단 로그 설정이 서버의 로그 설정 전부다.

```python
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
```

[`regipy_mcp_server/server.py:23-25`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L23-L25)

[2] 로그를 쓰는 곳은 하이브 적재([`regipy_mcp_server/server.py:61-66`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L61-L66))와 플러그인 오류([`regipy_mcp_server/server.py:281`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L281), [`regipy_mcp_server/server.py:320`](https://github.com/mkorman90/regipy/blob/1293544148a4b4dc11d2811e11c9fd7e64fa9c04/regipy_mcp_server/server.py#L320))다.
