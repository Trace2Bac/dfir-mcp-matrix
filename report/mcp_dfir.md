# mcp_dfir 시범 전환 원고

E03·T03·R02·L02 4개 셀을 새 보고서 형식으로 쓴 원고다.
셀과 상세 항목의 정의는 `상세정의.yaml`을 따른다.
상세 항목마다 **구현**을 쓰고 †가 붙은 항목에는 **예외**를 따로 쓴다.
본문의 [번호]는 그 절 끝 **근거**의 같은 번호를 가리킨다.

**기준 커밋.** [`305fcad`](https://github.com/Androsh7/mcp_dfir/tree/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5)(2026-04-11, v0.1.2).
줄 번호는 모두 이 커밋 기준이다.

**확인 방법.** 코드는 기준 커밋을 `git show`로 읽었다.
컨테이너 안 포렌식 도구는 실행하지 않았다.
저장소에 커밋된 예시 사건 폴더(`examples/tryhackme_volatility/`)의 기록 파일은 코드가 만든 기록의 실제 모양으로 인용한다.

## E03 원본 변경 방지

**상세 항목.** E03.01 실행 환경의 읽기 전용 강제†

### E03.01 실행 환경의 읽기 전용 강제

**구현.** 서버는 사건 폴더의 `evidence`를 컨테이너의 `/evidence`에 읽기 전용으로 붙이도록 볼륨을 설정한다 [1].
분석 기록이 있는 `analysis`도 읽기 전용이고 심볼 폴더와 파생물 폴더 `artifacts`만 읽기·쓰기다 [1].
새 포렌식 컨테이너를 만들 때 이 볼륨 설정과 네트워크 `none`을 Docker 실행에 넘긴다 [2].
Sleuth Kit·Volatility·`strings`·`grep`·`unzip`처럼 컨테이너 안에서 도는 명령은 이 마운트로 증거를 읽으므로 인자와 관계없이 `/evidence`의 파일을 고칠 수 없다 [1][3].
압축 해제 도구는 출력 폴더가 `/artifacts/` 아래여야 실행한다 [4].

**예외.** 같은 이름의 컨테이너가 이미 있으면 서버는 실행 중이든 멈춰 있든 그 컨테이너를 다시 쓰고 볼륨 설정을 다시 적용하거나 대조하지 않는다 [5].
컨테이너 이름은 사건 폴더의 이름에서 만든다 [6].
그래서 다시 쓴 컨테이너의 `/evidence`가 읽기 전용이고 이 사건 폴더를 가리킨다는 보장이 없다 [5][6].

호스트에서 도는 노트·심볼 도구는 이 보호 밖에 있다.
`add_analyst_note`는 받은 노트를 그대로 넘기고 노트 관리기는 `title`을 검사하지 않고 `analysis/analyst_notes` 아래 파일 이름으로 쓴다 [7].
`title`에 `../../evidence/x`를 주면 호스트의 `evidence/x.md`가 생긴다 [7].
`download_windows_symbol`도 `pdb_name`·`guid`를 호스트 경로에 그대로 넣고 폴더부터 만든다 [8].
서버는 사건 폴더를 `mkdir(mode=500)`으로 만든다 [9].
십진수 500은 8진수 `0o764`라 소유자 쓰기 권한이 있으므로 호스트 폴더 권한도 이 쓰기를 막지 않는다 [9].

### 근거

[1] 증거·분석 폴더는 읽기 전용, 심볼·파생물 폴더는 읽기·쓰기로 설정한다.

```python
        self.docker_volumes = [
            DockerVolume(
                name="evidence", internal_path="/evidence", external_path=self.evidence_directory, permissions="ro"
            ),
            DockerVolume(
                name="analysis", internal_path="/analysis", external_path=self.analysis_directory, permissions="ro"
            ),
            DockerVolume(
                name="symbols", internal_path="/symbols", external_path=self.symbols_directory, permissions="rw"
            ),
            DockerVolume(
                name="artifacts", internal_path="/artifacts", external_path=self.artifact_directory, permissions="rw"
            ),
```

[`mcp_dfir/config.py:90-102`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/config.py#L90-L102)

[2] 새 컨테이너에 볼륨과 네트워크 설정을 넘긴다.

```python
        volumes = [
            (volume_mount.external_path, volume_mount.internal_path, volume_mount.permissions)
            for volume_mount in list(config.docker_volumes)
        ]
        self.container = self.docker.run(
            config.docker_config.image_name,
            name=config.docker_config.container_name,
            detach=True,
            remove=False,
            volumes=volumes,
            networks=["none"],
        )
```

[`mcp_dfir/docker_manager.py:42-53`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/docker_manager.py#L42-L53)

[3] 컨테이너 명령은 모두 `exec_stream`에서 `docker.execute`로 실행한다: [`mcp_dfir/docker_manager.py:67-81`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/docker_manager.py#L67-L81).
도구 목록은 [`mcp_dfir/server.py:45-75`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/server.py#L45-L75)에 있다.

[4] 압축 해제 도구의 목적지 검사: [`mcp_dfir/tools/file_tools.py:17-22`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/file_tools.py#L17-L22).

[5] 기존 컨테이너를 쓰는 분기다.
실행 중이면 그대로 쓰고 멈춰 있으면 다시 켠다.

```python
        try:
            self.container = self.docker.container.inspect(config.docker_config.container_name)

            if self.container.state.running:
                logger.info("Forensics container already running")
                return

            logger.info("Forensics container exists but is stopped, starting it")
            self.docker.container.start(config.docker_config.container_name)
            return
```

[`mcp_dfir/docker_manager.py:28-37`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/docker_manager.py#L28-L37)

[6] 컨테이너 이름을 사건 폴더 이름으로 정한다.

```python
        self.docker_config = DockerConfig(
            container_name=f"{self.working_directory.name.replace(' ', '_')}-forensics",
            image_name=f"androsh7/forensics-docker:{VERSION}",
```

[`mcp_dfir/config.py:104-106`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/config.py#L104-L106)

[7] 노트 파일 경로를 제목으로 만든다.
노트 폴더는 `analysis/analyst_notes`이고([`mcp_dfir/config.py:82`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/config.py#L82)) 도구는 받은 노트를 그대로 넘긴다([`mcp_dfir/tools/notes.py:16-17`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/notes.py#L16-L17)).

```python
        # Write to note file
        if note is not None:
            with open(
                file=config.analyst_notes_directory / f"{note.title}.md", mode="w", encoding="utf-8"
            ) as note_file:
                note_file.write(note.description)
```

[`mcp_dfir/data_manager.py:81-86`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/data_manager.py#L81-L86)

[8] 심볼 경로를 인자로 만든다: [`mcp_dfir/tools/volatility.py:72-81`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/volatility.py#L72-L81), [`mcp_dfir/tools/volatility.py:40-42`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/volatility.py#L40-L42).

[9] 사건 폴더를 만드는 코드다.

```python
        self.evidence_directory = self.working_directory / "evidence"
        self.evidence_directory.mkdir(mode=500, parents=False, exist_ok=True)
```

[`mcp_dfir/config.py:73-74`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/config.py#L73-L74)
## T03 실행 허가 조건 확인

**상세 항목.** 미구현

### 미구현

**판단.** 앞선 호출이 만든 상태를 조건으로 호출을 막는 코드가 없다.
서버 지침은 분석 전에 증거 목록을 만들고 이전 명령과 분석 노트를 검토하라고 적는다 [1].
서버는 이 순서를 지켰는지 보지 않는다.
컨테이너 명령 도구는 증거 목록을 만들었는지, 이전 명령을 조회했는지와 관계없이 `exec_stream`으로 명령을 실행한다 [2].
`exec_stream`은 컨테이너가 없으면 거부하지만 서버는 기동할 때 컨테이너부터 띄우므로 모델이 채워야 할 조건이 아니다 [3].
`download_windows_symbol`은 같은 심볼 파일이 있으면 `overwrite` 없이 다시 받지 않는다 [4].
이 검사는 파일 덮어쓰기를 막는 것이라 D03에서 본다.

### 근거

[1] 서버 지침의 분석 전 순서다.

```python
Before beginning analysis always perform the following tasks:
1. Perform an inventory of all evidence, ask the user for specific details on how, when, and where the evidence was acquired
2. Review all previous commands that have already been run, commands should never be re-run unless the evidence has been updated or the commands were run incorrectly
3. Review all analyst notes to not perform duplicate analysis
```

[`mcp_dfir/server.py:32-35`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/server.py#L32-L35)

[2] 컨테이너 명령 도구는 인자를 붙여 바로 `exec_stream`을 부른다.
`run_strings`·`run_grep`의 예다.

```python
def run_strings(ctx: Context, arguments: list[str]) -> CommandRecordSummary:
    """Runs: strings <arguments>"""
    return docker_manager.exec_stream(ctx=ctx, command_list=["strings", *arguments])


def run_grep(ctx: Context, arguments: list[str]) -> CommandRecordSummary:
    """Runs: grep <arguments>"""
    return docker_manager.exec_stream(ctx=ctx, command_list=["grep", *arguments])
```

[`mcp_dfir/tools/file_search.py:45-52`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/file_search.py#L45-L52)

[3] 컨테이너가 없으면 거부하고([`mcp_dfir/docker_manager.py:67-69`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/docker_manager.py#L67-L69)) 서버는 MCP 연결을 받기 전에 컨테이너를 띄운다([`mcp_dfir/runner.py:56-59`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/runner.py#L56-L59)).

[4] 심볼 파일이 이미 있으면 거부한다.

```python
    if output_file_external_path.exists() and not overwrite:
        raise RuntimeError(
            f"File {output_file_internal_path} already exists, it can be used by volatility with the `-s /symbols` "
            "argument, set overwrite to True to overwrite this file"
        )
```

[`mcp_dfir/tools/volatility.py:75-79`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/volatility.py#L75-L79)
## R02 대량 결과 전달

**상세 항목.** R02.04 파일·리소스로 전체 결과 조회†, R02.05 상한 초과 시 거부†

### R02.04 파일·리소스로 전체 결과 조회

**구현.** 컨테이너 명령 도구는 출력을 응답에 싣지 않는다.
`exec_stream`은 명령의 표준 출력을 모아 기록 관리기에 넘기고 관리기가 돌려준 요약을 도구 응답으로 돌려준다 [1].
요약에는 번호·명령 문자열·시각·종료 코드만 있다 [2].
출력 본문은 호스트의 `analysis/command_history/<번호>.txt`에 통째로 저장된다 [3].
모델은 `get_command_result`에 그 번호를 주어 저장된 출력을 읽는다 [4].
이때 앞에서부터 줄 수·문자 수로 자르거나(`head`·`head_bytes`) 뒤에서 문자 수로 자르거나(`tail_bytes`) 정규식에 맞는 줄만 고를 수 있다 [4].

줄 단위로 가운데 구간을 이어 읽는 인자는 없다.
큰 출력 전체를 한 번에 읽으려면 모델이 `byte_limit`으로 상한을 꺼야 한다 [5][6].

**예외.** `tail`은 설명과 달리 뒤에서 N줄이 아니라 앞의 N줄을 뺀 나머지를 돌려준다 [4].

### R02.05 상한 초과 시 거부

**구현.** `get_command_result`는 고르고 남은 결과가 25,600자 이상이면 자르지 않고 예외를 낸다 [5].
상한 값은 `25 * 1024`이고 `len()`으로 세므로 단위는 바이트가 아니라 문자다 [5].
예외 문구에는 고르고 남은 결과의 크기만 있고 저장된 출력 전체의 크기는 없다 [5].
예시 사건에서 9,680,429바이트짜리 `strings` 출력에 정규식을 건 호출은 "output was 42864 bytes" 예외를 받았다 [7].

상한은 `get_command_result` 하나에만 있다 [1][5].
`list_files`는 볼륨 아래 파일을 모두 돌려주고 `get_command_history`는 기록 요약 전체를 돌려준다 [8].

**예외.** 상한은 도구 인자 `byte_limit`의 기본값이다 [6].
도구 설명은 `None`을 넘기면 상한을 끌 수 있다고 적고 코드도 `None`이면 비교하지 않는다 [5][6].
모델이 더 큰 값을 주면 상한이 올라간다.

### 근거

[1] 표준 출력을 모아 기록 관리기에 넘기고 그 요약을 돌려준다.

```python
    def exec_stream(self, ctx: Context, command_list: list[str]) -> CommandRecordSummary:
        if self.container is None:
            raise RuntimeError("No docker container is currently running")

        ctx.report_progress(f"Running command {' '.join(command_list)}")
        output = []
        exit_code = 0
        try:
            for stream, data in self.docker.execute(self.container, command_list, stream=True):
                if stream == "stdout":
                    output.append(data.decode())
        except DockerException as ex:
            exit_code = ex.return_code if ex.return_code is not None else 1
            output.append(str(ex))
        result = "".join(output)
        return command_history_manager.add_command(
            CommandRecord(
                command=" ".join(command_list),
                result=result,
                exit_code=exit_code,
            )
        )
```

[`mcp_dfir/docker_manager.py:67-88`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/docker_manager.py#L67-L88)

[2] 요약 모델의 필드다.

```python
class CommandRecordSummary(BaseModel):
    number: int = Field(examples=[1])
    command: str = Field(examples=["vol -f capture.mem linux.pslist"])
    date_run: str = Field(default_factory=date_as_str, examples=["01/01/2024 12:00:00"])
    exit_code: int = Field(examples=[0])
```

[`mcp_dfir/tools/models.py:21-25`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/models.py#L21-L25)

[3] 요약 목록 길이로 번호를 정하고([`mcp_dfir/data_manager.py:44-49`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/data_manager.py#L44-L49)) 출력 본문을 번호별 파일에 쓴다([`mcp_dfir/data_manager.py:32-37`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/data_manager.py#L32-L37)).
폴더는 [`mcp_dfir/config.py:78`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/config.py#L78)이다.

[4] 저장된 출력을 읽어 줄·문자 범위와 정규식으로 고른다.

```python
    # Get the command result
    content = command_history_manager.get_command(command_number=command_number).result

    # Truncate for head/tail
    if head:
        content = "\n".join(content.split("\n")[:head])
    elif tail:
        content = "\n".join(content.split("\n")[tail:])

    # Truncate for head/tail bytes
    if head_bytes:
        content = content[:head_bytes]
    elif tail_bytes:
        content = content[-tail_bytes:]

    # Regex search
    output = []
    for line in content.split("\n"):
        if regex is None or re.search(regex, line):
            output.append(line)

    output_str = "\n".join(output)
```

[`mcp_dfir/tools/history.py:44-65`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/history.py#L44-L65)

[5] 상한 비교와 예외다.
상한 값은 [`mcp_dfir/constants.py:11`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/constants.py#L11)이다.

```python
    if byte_limit is not None and len(output_str) >= byte_limit:
        raise RuntimeError(f"Output exceeds maximum size, output was {len(output_str)} bytes")
```

[`mcp_dfir/tools/history.py:67-68`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/history.py#L67-L68)

[6] 상한이 인자 기본값이고 설명에 끄는 방법이 있다.

```python
    byte_limit=COMMAND_MAX_OUTPUT_BYTES,
) -> str:
    """Allows for parsing of the command result

    Args:
        command_number: The command number
        head: The number of lines from the start to return
        head_bytes: The number of bytes to read from the start (Applied after running head/tail)
        tail: The number of lines from the rear to return
        tail_bytes: The number of bytes to read from the end (Applied after running head/tail)
        regex: An optional regex search
        byte_limit: The maximum number of bytes in the output before throwing an error (set to None to bypass the limit)
```

[`mcp_dfir/tools/history.py:23-34`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/history.py#L23-L34)

[7] 예시 사건 대화 기록의 예외 응답: [`examples/tryhackme_volatility/claude_code_log.txt:296-299`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/examples/tryhackme_volatility/claude_code_log.txt#L296-L299).
저장소의 `command_history/15.txt` 크기는 9,680,429바이트다.

[8] `list_files`는 폴더를 끝까지 돌며 모든 파일을 목록에 넣는다([`mcp_dfir/tools/file_search.py:28-42`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/file_search.py#L28-L42)).
`get_command_history`는 요약 목록을 그대로 돌려준다([`mcp_dfir/tools/history.py:12-13`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/history.py#L12-L13)).
## L02 기록 내용 구성

**상세 항목.** L02.03 실제 실행 명령 기록†

### L02.03 실제 실행 명령 기록

**구현.** 컨테이너 명령 도구는 서버가 붙인 실행 파일 이름·고정 인자와 모델이 준 인자를 합친 인자 배열을 `exec_stream`에 넘긴다 [1].
`exec_stream`은 명령을 실행한 뒤 이 배열을 공백으로 이어 `command` 문자열을 만들고 출력·종료 코드와 함께 기록 관리기에 넘긴다 [2].
그래서 `command`에는 `vol -s /symbols -r jsonl`처럼 서버가 붙인 부분까지 실제로 실행한 명령 전체가 남는다 [1][2].
기록 관리기는 요약 목록 길이로 번호를 정하고 `number`·`command`·`date_run`·`exit_code`를 `command_history.json`에 쓴다 [3].
어떤 호출이 기록에 남는지는 L01에서 본다.

**예외.** 인자를 공백으로 이으므로 공백이 든 인자 하나와 인자 여러 개를 기록에서 가를 수 없다 [2].
네트워크에서 심볼을 받는 도구 3개는 실행한 명령 대신 함수 호출 모양의 문자열을 `command`에 쓴다 [4].
`download_windows_symbol`은 이 문자열에 `overwrite`를 넣지 않아 심볼 파일을 덮어쓴 호출과 새로 받은 호출이 같게 보인다 [4].

### 근거

[1] 실행 파일 이름과 고정 인자를 서버가 붙인다.

```python
def run_volatility_command(ctx: Context, arguments: list[str]) -> CommandRecordSummary:
    """Runs volatility3: vol -s /symbols -r jsonl <arguments>

    - To analyze a file you must specify the path using `-f /evidence/example.mem`
    - Volatility3 does not come with many built-in symbols so they may need to be manually downloaded
    """
    return docker_manager.exec_stream(command_list=["vol", "-s", "/symbols", "-r", "jsonl", *arguments], ctx=ctx)
```

[`mcp_dfir/tools/volatility.py:22-28`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/volatility.py#L22-L28)

[2] 인자 배열을 공백으로 이어 기록한다.

```python
        result = "".join(output)
        return command_history_manager.add_command(
            CommandRecord(
                command=" ".join(command_list),
                result=result,
                exit_code=exit_code,
            )
        )
```

[`mcp_dfir/docker_manager.py:81-88`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/docker_manager.py#L81-L88)

[3] 번호를 정하고 요약을 JSON에 쓴다.

```python
    def dump(self, command: CommandRecord | None, command_number: int | None = None):
        # Write to command history
        with open(file=config.command_history_json, mode="w", encoding="utf-8") as command_summary_file:
            json.dump(
                [record.model_dump() for record in self.command_summary_list],
                command_summary_file,
                indent=4,
            )
```

[`mcp_dfir/data_manager.py:23-30`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/data_manager.py#L23-L30)

[4] 심볼 도구의 기록 문자열이다.
`download_windows_symbol`의 인자는 [`mcp_dfir/tools/volatility.py:66-67`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/volatility.py#L66-L67), `search_linux_symbols`의 기록은 [`mcp_dfir/tools/volatility.py:127-138`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/volatility.py#L127-L138), `download_linux_symbol`의 기록은 [`mcp_dfir/tools/volatility.py:156-161`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/volatility.py#L156-L161)에 있다.

```python
    return internal_path, command_history_manager.add_command(
        CommandRecord(
            command=f'mcp_dfir:tools:volatility:_download_windows_pdb(pdb_name="{pdb_name}", guid="{guid}", age={age})',
            result=f"Successfully downloaded {internal_path}",
            exit_code=0,
        )
    )
```

[`mcp_dfir/tools/volatility.py:57-63`](https://github.com/Androsh7/mcp_dfir/blob/305fcadb784f4f3e80cc8f8287b0ea57a007f8a5/mcp_dfir/tools/volatility.py#L57-L63)
