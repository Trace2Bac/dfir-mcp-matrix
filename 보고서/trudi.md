# trudi 시범 전환 원고

B04·C04·E02·F03 4개 셀을 새 보고서 형식으로 쓴 원고다.
셀과 상세 항목의 정의는 `상세정의.yaml`을 따른다.
상세 항목마다 **구현**을 쓰고 †가 붙은 항목에는 **예외**를 따로 쓴다.
본문의 [번호]는 그 절 끝 **근거**의 같은 번호를 가리킨다.

**기준 커밋.** [`88fbca7`](https://github.com/nebulae/trudi/tree/88fbca78186b6a0ca40423cf5e37a9dc46ae051e)(2026-09-24).
줄 번호는 모두 이 커밋 기준이다.

**확인 방법.** 코드는 기준 커밋을 `git show`로 읽었다.
서버를 띄우지 않았고 조사를 돌리지 않았다.
도구 이름은 네임스페이스와 함수 이름을 이은 것이다(예: `misc.record_finding`).

## B04 선행 상태에 따른 실행 제어 방식

**상세 항목.** B04.01 선행 결과 존재 대조†, B04.02 조사 단계 검사†, B04.03 앞선 점검·판정 결과 대조†, B04.04 되풀이 호출 제한†

### B04.01 선행 결과 존재 대조

**구현.** 발견사항 기록 도구 `misc.record_finding`은 게이트 목록을 차례로 돌려 첫 거부를 돌려준다 [1].
`lineage_required` 게이트는 발견사항이 근거로 적은 호출 ID(`input_call_ids`)가 비어 있거나 호출 기록에 없는 ID를 담으면 거부한다 [2].
`evidence_strength` 게이트 묶음도 인용한 호출(`linked_call_id`)이 호출 기록에 있는지 본다 [3].

대응 조치를 제안하는 `respond.suggest_containment`와 원격 호스트에 쓰기 명령을 보내는 `ssh_run_write`는 사건 폴더의 `monitoring/baselines/`에 기준선 파일이 있어야 진행한다 [4].
기준선 파일은 앞선 `monitor.baseline_capture` 호출이 쓴다 [4].

**예외.** 호출 기록 항목이 5개가 되기 전에는 근거 호출 ID가 비어 있어도 `lineage_required`를 통과한다 [2].

### B04.02 조사 단계 검사

**구현.** 서버는 DAIR 단계를 호출 기록의 `dair_call` 항목으로 정한다 [5].
`dair_required` 게이트는 `dair_call`이 없으면 발견사항 기록을 거부한다 [6].
모델이 `reason.plan`을 불러 분류 단계를 마쳤는데 DAIR 단계가 아직 없으면 허용 목록 밖의 도구를 거부하고 `dair.assess`를 먼저 부르라고 알린다 [7].
단계가 `Report`이면 새 발견사항 기록을 거부한다 [8].
`Report` 단계에서 증거 도구를 부르면 거부하지 않고 단계를 `Collect`로 되돌린다 [8].

**예외.** DAIR 참여 게이트와 단계 게이트는 판단하다 예외가 나면 호출을 통과시킨다 [9].
DAIR 참여 게이트는 환경변수 `TRUDI_DAIR_NUDGE`로 끈다 [10].
이름이 `live_`·`velo_`·`monitor_`·`respond_`로 시작하는 도구는 설정과 관계없이 DAIR 참여 게이트를 건너뛴다 [11].

### B04.03 앞선 점검·판정 결과 대조

**구현.** 보고서 도구 `misc.write_final_report`와 `misc.export_execution_log`는 호출 기록에서 가장 최근의 `reason.pre_report_check` 항목을 찾는다 [12].
그 항목이 없거나 `ready_to_report`가 참이 아니거나 그 뒤 호출 기록의 상태가 바뀌었으면 거부한다 [12].
CONFIRMED·LIKELY 발견사항에는 같은 주장에 검토 모델이 SUPPORTED를 준 `reason.evaluate_finding` 기록을 요구한다 [3].
SUPPORTED 판정은 서버 안에서 부른 검토 모델이 내고 그 판정을 심사하는 방식은 H11에서 본다 [3].

**예외.** 임의 명령을 실행하는 `misc.batch_run`으로 `reports/`에 파일을 쓰면 준비 점검 없이 보고서 파일이 생긴다 [13].

### B04.04 되풀이 호출 제한

**구현.** 미들웨어는 도구 이름과 인자로 만든 키마다 앞선 결과의 해시와 같은 결과가 되풀이된 횟수를 프로세스 메모리의 `_repeat_state`에 둔다 [14].
같은 인자로 같은 결과가 `TRUDI_REPEAT_BLOCK_AFTER`번(기본 4번) 되풀이된 뒤의 호출은 실행 전에 거부한다 [15].
거부 문구는 부재를 발견사항으로 한 번 기록하고 다른 질의를 하라고 안내한다 [15].
이 상태는 메모리에만 있어 서버를 다시 띄우면 비고 키가 512개를 넘으면 오래된 것부터 버린다 [14].
상태가 얼마나 남는지는 A05에서 본다.

**예외.** 환경변수 `TRUDI_REPEAT_GATE`나 `TRUDI_REPEAT_BLOCK_AFTER`로 이 게이트를 끈다 [10].
이름이 `live_`·`velo_`·`monitor_`·`respond_`로 시작하는 도구는 설정과 관계없이 이 게이트를 건너뛴다 [11].

### 근거

[1] 게이트 목록([`tools/_gates/__init__.py:96-115`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/__init__.py#L96-L115))을 차례로 돌린다.
발견사항 기록은 [`tools/misc.py:1803`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L1803)에서 이 함수를 부른다.

```python
def run_gates(ctx: GateContext) -> Optional[dict]:
    """Run each gate in order. Return the first refusal dict, or None on pass."""
    for _, gate_fn in GATES:
        failure = gate_fn(ctx)
        if failure is not None:
            return failure
    return None
```

[`tools/_gates/__init__.py:118-124`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/__init__.py#L118-L124)

[2] 근거 호출 ID 검사다.
비어 있으면 호출 기록 항목이 5개 미만일 때만 통과하고 기록에 없는 ID를 담으면 거부한다([`tools/_gates/lineage_required.py:39-59`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/lineage_required.py#L39-L59)).
이 게이트는 게이트 목록의 네 번째다([`tools/_gates/__init__.py:102`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/__init__.py#L102)).

```python
def check(ctx) -> Optional[dict]:
    cids = list(ctx.input_call_ids or [])
    # 1) Empty: only allowed in the genesis window.
    if not cids:
        if len(ctx.log._entries) < _GENESIS_GRACE_THRESHOLD:
            return None
```

[`tools/_gates/lineage_required.py:18-23`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/lineage_required.py#L18-L23)

[3] 증거 강도 게이트 묶음([`tools/_gates/contracts.py:47-58`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/contracts.py#L47-L58)).
SUPPORTED 검토 기록 요구는 [`tools/_gates/confirmed_requires_supported_evaluate.py:164-178`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/confirmed_requires_supported_evaluate.py#L164-L178), 인용 호출 확인은 [`tools/_gates/linked_call_id_must_exist.py:5-15`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/linked_call_id_must_exist.py#L5-L15)에 있다.

[4] 기준선이 없으면 거부한다.
이 검사는 [`tools/respond.py:132`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/respond.py#L132)와 [`core/ssh_exec.py:280`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/ssh_exec.py#L280)에서 부르고 기준선 폴더는 [`response/gates.py:40-41`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/response/gates.py#L40-L41), 기준선을 쓰는 도구는 [`tools/monitor.py:307-317`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/monitor.py#L307-L317)이다.

```python
def check_live_monitoring_scope(case_id: str, client_id: Optional[str] = None) -> Optional[dict]:
    """Refuse if `case_id` isn't a live-monitoring case (no baselines)."""
    baselines = _baseline_dir(case_id)
    if not baselines.exists() or not any(baselines.iterdir()):
        return _refuse(
            "live_monitoring_scope",
            f"respond.* is restricted to active live-monitoring cases. "
            f"No baselines found under {baselines}. "
            f"Run monitor.baseline_capture against a client first.",
        )
```

[`response/gates.py:52-61`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/response/gates.py#L52-L61)

[5] `dair_call`의 전이 선언으로 단계를 바꾼다: [`core/execution_log.py:689-700`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/execution_log.py#L689-L700).

[6] 호출 기록에 `dair_call`이 있어야 통과한다.

```python
def check(ctx) -> Optional[dict]:
    by_type = getattr(ctx.idx, "by_type", {}) or {}
    if by_type.get("dair_call"):
        return None
```

[`tools/_gates/dair_required.py:10-13`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/_gates/dair_required.py#L10-L13)

[7] 단계가 없는데 `reason.plan` 기록이 있으면 거부한다.
허용 목록은 [`core/middleware.py:17`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L17)부터다.

```python
        phase = getattr(log, "_current_phase", "") or ""
        if phase:
            return "allow", ""            # engaged: DAIR directs; Report handled above
        _scan_ritual()
        if _ritual.has_plan:
            return "block", (
                "DAIR PROTOCOL: Triage is complete (reason.plan recorded) but "
                "DAIR has not been engaged. Call " + _DAIR_CALL_SHAPE + " to "
                "receive the Collect work order before any further forensic "
                "tools. Findings cannot be recorded until DAIR is engaged "
                "(gate dair_required)."
            )
```

[`core/middleware.py:157-168`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L157-L168)

[8] 활성 단계가 아니면 막고([`core/middleware.py:382-389`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L382-L389)) `Report` 단계의 증거 도구는 `Collect`로 옮긴다.

```python
            if (should_block and tool_name.endswith(("record_finding", "submit_finding"))
                    and args.get("supersedes")):
                should_block, reason = False, "finding correction (supersedes) allowed in Report"
            if (should_block and _report_phase()
                    and not tool_name.endswith(("record_finding", "submit_finding"))):
                # Report work that needs evidence goes to Collect (above Report,
                # so a DAIR pop resumes it) instead of a refusal plus a manual
                # dair_assess round trip.
                try:
                    from core.execution_log import log
                    log.record_phase_transition("Collect", "report_follow_up", trigger=tool_name)
                    notices.append(("phase_transition",
                                    f"Report -> Collect: {tool_name} is evidence work. Finish it, "
                                    f"then dair_assess with stack_action='pop' to resume Report."))
                    should_block = False
```

[`core/middleware.py:659-673`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L659-L673)

[9] DAIR 참여 게이트([`core/middleware.py:187-188`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L187-L188))와 단계 게이트는 예외가 나면 통과시킨다.

```python
    except Exception:
        tb = traceback.format_exc()
        print(f"[TRUDI WARN] dair gate check failed (fail-open): {tb}", file=sys.stderr)
        try:
            from core.execution_log import log
            log.record_system_error("dair_gate", tb)
        except Exception as _e:
            print(f"[TRUDI WARN] dair_gate system_error log failed: {_e}", file=sys.stderr)
        return False, "gate check error (fail-open)"
```

[`core/middleware.py:390-398`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L390-L398)

[10] DAIR 참여 게이트를 끄는 환경변수다.
반복 호출 게이트는 [`core/middleware.py:227-231`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L227-L231)과 [`core/middleware.py:264`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L264)에서 끈다.

```python
DAIR_NUDGE_ENABLED = (os.environ.get("TRUDI_DAIR_NUDGE") or "1").strip().lower() not in (
    "0", "off", "false", "none")
```

[`core/middleware.py:100-101`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L100-L101)

[11] 건너뛰는 접두어([`core/middleware.py:105-106`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L105-L106))를 참여 게이트([`core/middleware.py:153-154`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L153-L154))와 반복 호출 게이트([`core/middleware.py:687-689`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L687-L689))가 쓴다.

[12] 가장 최근 준비 점검 항목의 `ready_to_report`와 그 뒤 상태 변화를 본다.
항목을 찾는 부분은 [`tools/misc.py:995-1011`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L995-L1011), 보고서 도구의 호출은 [`tools/misc.py:1984`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L1984)와 [`tools/misc.py:2013`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L2013)이다.

```python
    is_ready = pre_report_entry.get("ready_to_report") is True
    if not is_ready:
        return {
            "success": False,
            "error": (
                "refused: most recent reason.pre_report_check returned "
                "READY_TO_REPORT: false. Resolve the blocking_issues and "
                "re-run pre_report_check before exporting the trace or "
                "writing the final report."
            ),
            "gate": "pre_report_check_required",
            "pre_report_conclusion": conclusion[:500],
        }
    recorded = pre_report_entry.get("readiness_fingerprint")
    current = state_fingerprint(log._entries, log._case_id)
    if not recorded or recorded != current:
        return {"success": False, "gate": "pre_report_check_required",
                "error": "Report snapshot is missing or stale; run reason.pre_report_check again.",
                "missing_check": "reason_pre_report_check"}
```

[`tools/misc.py:1024-1042`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L1024-L1042)

[13] `misc.batch_run`은 받은 argv를 그대로 실행한다: [`tools/misc.py:2626-2651`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L2626-L2651).

[14] 반복 상태는 모듈 전역 `dict`이고([`core/middleware.py:233-235`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L233-L235)) 호출이 끝나면 결과 해시와 횟수를 갱신한다([`core/middleware.py:282-295`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L282-L295)).

[15] 같은 결과가 정한 횟수만큼 되풀이됐으면 거부 문구를 만든다.
문구 전문은 [`core/middleware.py:269-278`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L269-L278)이다.

```python
    if not REPEAT_GATE_ENABLED or REPEAT_BLOCK_AFTER <= 0:
        return ""
    st = _repeat_state.get(key)
    if st and st["identical"] >= REPEAT_BLOCK_AFTER:
        n = st["identical"] + 1
```

[`core/middleware.py:264-268`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L264-L268)
## C04 원본 변경 방지 방식

**상세 항목.** C04.02 증거 파일시스템 읽기 전용 마운트†, C04.03 읽기 전용 접근 API†, C04.04 출력 대상 검사†

### C04.02 증거 파일시스템 읽기 전용 마운트

**구현.** `mount_full_image`는 E01을 `ewfmount`로 붙인 뒤 파티션을 찾아 NTFS 파일시스템을 마운트한다 [1].
NTFS 마운트는 늘 `ro,loop,norecover` 옵션을 쓴다 [2].
코드 설명은 `norecover`를 마운트할 때 NTFS 저널을 다시 적용하지 않게 하는 옵션으로 적는다 [2].
`mount_ntfs`는 `read_only=False`를 받으면 마운트하지 않고 거부한다 [2].
이 마운트 아래 파일을 읽는 도구가 쓰려고 하면 운영체제가 거부한다.

**예외.** 읽기 전용 옵션은 NTFS 마운트에만 붙는다.
서버는 `ewfmount`에 읽기 전용 옵션을 넘기지 않고 도구가 내놓는 FUSE 장치의 성질에 맡긴다 [3].

### C04.03 읽기 전용 접근 API

**구현.** 채팅 DB를 여는 `open_ro`는 SQLite를 `mode=ro&immutable=1` URI로 연다 [4].
이 모드는 `-wal`·`-shm` 파일을 만들지 않고 잠금도 걸지 않는다 [4].
서버 코드에서 SQLite를 여는 곳은 이 함수 하나다 [4].

**예외.** SQLite 증거를 외부 도구에 넘기는 `ez.sqlecmd`·`ez.wxtcmd`·`misc.hindsight_chrome`에서 그 도구가 어떤 모드로 여는지는 확인하지 못했다 [5].

### C04.04 출력 대상 검사

**구현.** 서버는 출력 경로를 실제 경로로 푼 뒤 `/cases/`·`/mnt/`·`/media/`로 시작하거나 경로 조각 하나가 `evidence`이면 증거 위치로 보고 거부한다 [6][7].
도구 함수에 붙는 `@output_safe`는 인자 이름이 `output_path`·`output_dir` 같은 출력 인자 8개 가운데 하나일 때 그 값을 검사한다 [8].
외부 도구 실행기도 출력 폴더와 출력 파일 경로를 한 번 더 검사한다 [8].

**예외.** 출력 대상 검사는 증거의 위치에 기댄다.
설치 안내의 사건 폴더는 `~/cases/<CASE_ID>`이고 사건 지침 견본은 증거를 그 아래 `evidence/`에 둔다 [9].
`/home/<user>/cases/…`는 `/cases/`로 시작하지 않으므로 기본 배치에서 증거를 지키는 것은 `evidence` 조각 대조 하나다 [7].
이 대조는 대소문자를 가린다 [7].

`mount_point`·`ewf_mount_point`·`fs_mount_point`는 검사하는 인자 이름에 없다 [8].
서버는 이 경로에 폴더를 만들고 sudo로 그 위에 마운트한다 [3].
`misc.batch_run`은 모델이 준 argv를 허용 목록과 출력 경로 검사 없이 실행한다 [10].
설치 스크립트는 서버 계정에 암호 없는 sudo 전체 권한을 주므로 `sudo`로 시작하는 명령으로 증거를 바꿀 수 있다 [10].

### 근거

[1] E01을 붙이고 NTFS 파티션을 마운트하는 순서다: [`tools/ewf.py:209-274`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/ewf.py#L209-L274).

[2] NTFS 마운트 옵션([`tools/ewf.py:103-136`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/ewf.py#L103-L136)), `norecover`의 설명([`tools/ewf.py:160-163`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/ewf.py#L160-L163)), 읽기 쓰기 마운트 거부([`tools/ewf.py:166-169`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/ewf.py#L166-L169)).

```python
    options = f"ro,loop,norecover,offset={offset_bytes}"
```

[`tools/ewf.py:118-118`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/ewf.py#L118-L118)

[3] 마운트 지점 폴더를 만들고 sudo로 마운트한다: [`tools/ewf.py:86-87`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/ewf.py#L86-L87), [`tools/ewf.py:220-224`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/ewf.py#L220-L224).

[4] SQLite를 읽기 전용·immutable로 연다.
서버 코드의 `sqlite3.connect` 호출은 이 한 곳이다.

```python
def open_ro(db_path: str) -> sqlite3.Connection:
    """Open a sqlite db strictly read-only: no -wal/-shm sidecars, no locks."""
    uri = f"file:{pathname2url(os.path.abspath(db_path))}?mode=ro&immutable=1"
    return sqlite3.connect(uri, uri=True)
```

[`core/chat_db.py:34-37`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/chat_db.py#L34-L37)

[5] 외부 도구에 SQLite 증거 경로를 넘기는 도구: [`tools/eztools.py:568`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/eztools.py#L568), [`tools/eztools.py:585`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/eztools.py#L585), [`tools/misc.py:331`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L331).

[6] 보호하는 경로 접두어와 경로 조각이다.

```python
READ_ONLY_PREFIXES = (
    "/cases/",
    "/mnt/",
    "/media/",
)

READ_ONLY_SEGMENTS = ("evidence",)
```

[`core/paths.py:8-14`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/paths.py#L8-L14)

[7] 실제 경로로 풀어 비교하고 걸리면 거부한다.

```python
def is_evidence_path(path: str) -> bool:
    """Return True if path is under a protected evidence location."""
    p = os.path.realpath(path)
    for prefix in READ_ONLY_PREFIXES:
        if p.startswith(prefix):
            return True
    parts = Path(p).parts
    return any(seg == "evidence" for seg in parts)


def assert_output_safe(path: str) -> None:
    """Raise ValueError if path resolves inside an evidence directory."""
    if is_evidence_path(path):
        raise ValueError(
            f"Output path '{path}' is inside a protected evidence directory. "
            "Write outputs to ./analysis/, ./exports/, or ./reports/ only."
        )
```

[`core/paths.py:58-74`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/paths.py#L58-L74)

[8] 검사하는 인자 이름 목록([`core/paths.py:109-118`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/paths.py#L109-L118))과 데코레이터([`core/paths.py:121-149`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/paths.py#L121-L149)).
실행기의 검사는 [`core/executor.py:136-137`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L136-L137), [`core/executor.py:390`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L390)이다.

[9] 설치 안내([`install.sh:450-452`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/install.sh#L450-L452))와 사건 지침 견본([`case-template/CLAUDE.md:22-23`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/case-template/CLAUDE.md#L22-L23)).

[10] `misc.batch_run`의 실행([`tools/misc.py:2646-2651`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L2646-L2651))과 설치 스크립트의 sudo 설정([`install.sh:236`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/install.sh#L236)).
## E02 대량 결과 전달 방식

**상세 항목.** E02.01 문자·항목 상한†, E02.02 전체·반환 건수 표시†, E02.06 값 단위 잘림, E02.07 건수 없이 잘림만 알림, E02.08 보관한 출력의 일부 재조회†

### E02.01 문자·항목 상한

**구현.** 외부 도구 실행기는 표준 출력을 51,200자에서 자르고 그다음 150줄에서 자른다 [1][2].
두 상한은 운영자가 환경변수 `TRUDI_OUTPUT_CAP`·`TRUDI_OUTPUT_LINE_CAP`로 정하고 모델은 바꾸지 못한다 [1].
서버 안에서 결과 목록을 만드는 도구에는 도구별 건수 인자가 있다.
예를 들어 `evtx_filter`는 `max_results`(기본 200)에 이르면 읽기를 멈춘다 [3].

**예외.** `evtx_filter`의 `max_results`처럼 서버가 만든 목록의 상한은 모델이 인자로 올린다 [3].

### E02.02 전체·반환 건수 표시

**구현.** 줄 상한에서 자른 출력 끝에는 생략한 줄 수를 적은 꼬리말을 붙인다 [4].
`strings_grep`은 상한을 넘어서도 센 전체 일치 수 `match_count`와 돌려준 수 `returned`를 나누어 싣고 상한에 걸리면 두 수를 적은 안내를 붙인다 [5].
전체 건수와 반환 건수를 함께 싣는 도구는 일부다.

**예외.** 줄 상한 꼬리말의 생략 줄 수는 문자 상한으로 먼저 자른 뒤에 센 값이다 [2][4].
두 상한이 함께 걸리면 원래 출력의 줄 수를 알 수 없다.

### E02.06 값 단위 잘림

**구현.** `evtx_filter`는 맞는 이벤트의 XML을 2,000자에서 잘라 싣는다 [3].
잘린 이벤트에는 표시가 없다 [3].

### E02.07 건수 없이 잘림만 알림

**구현.** 문자 상한만 걸린 출력에는 `truncated: true`만 붙는다 [2].
실행기는 원래 길이 `_stdout_chars`를 계산하지만 호출 기록에만 쓰고 응답에서 뺀다 [6].
`evtx_filter`는 상한에 이르면 `cap_hit`를 싣고 돌려준 개수만 `matches_found`로 적는다 [3].

### E02.08 보관한 출력의 일부 재조회

**구현.** 실행기는 잘리기 전의 표준 출력 전체를 호출 기록 옆 `analysis/.tool_output/<호출 ID>.txt`에 남긴다 [7].
도구 응답에는 그 호출 ID `_trudi_call_id`가 실린다 [8].
`read.output`은 `analysis/` 아래 파일을 읽어 질의어가 많이 든 줄부터 한 번에 문자 상한(기본 51,200자)까지 돌려준다 [9].
줄 위치를 지정해 이어 읽는 인자가 없어 보관한 출력 전체를 끝까지 다시 읽지는 못한다 [9].
도구 응답은 사이드카 경로를 싣지 않고 그 경로는 저장소의 클라이언트 훅 안내 문구에 있다 [10].

**예외.** 사이드카 파일은 8,388,608자까지만 남기므로 그보다 긴 출력은 보관본도 잘린다 [7].

### 근거

[1] 문자 상한과 줄 상한은 환경변수로 정한다.
사이드카 상한은 바로 아래 [`core/paths.py:25-28`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/paths.py#L25-L28)이다.

```python
OUTPUT_CAP = int(os.environ.get("TRUDI_OUTPUT_CAP") or "51200")  # 50 KB default

# Maximum tool output lines returned to the agent (line-based cap)
MAX_TOOL_OUTPUT_LINES = int(os.environ.get("TRUDI_OUTPUT_LINE_CAP") or "150")
```

[`core/paths.py:20-23`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/paths.py#L20-L23)

[2] 실행기가 문자 상한 다음 줄 상한을 적용한다.

```python
        if len(stdout) > OUTPUT_CAP:
            stdout = stdout[:OUTPUT_CAP]
            result["truncated"] = True

        if line_cap is not None:
            stdout, line_truncated = _apply_line_cap(stdout, line_cap)
            if line_truncated:
                result["truncated"] = True
```

[`core/executor.py:179-186`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L179-L186)

[3] `evtx_filter`의 기본 상한([`tools/misc.py:79-81`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L79-L81))과 결과 필드([`tools/misc.py:247-257`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L247-L257)).
이벤트 XML을 2,000자에서 자르고 상한에 이르면 멈춘다.

```python
                if m and int(m.group(1)) in ids:
                    results.append(event_xml[:2000])
                    if len(results) >= max_results:
                        cap_hit = True
                        break
```

[`tools/misc.py:190-194`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/misc.py#L190-L194)

[4] 줄 상한 꼬리말에 생략한 줄 수를 넣는다.
꼬리말 문구는 [`core/executor.py:12-15`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L12-L15)이다.

```python
def _apply_line_cap(text: str, max_lines: int) -> tuple[str, bool]:
    """Trim text to max_lines, appending a footer if trimmed."""
    lines = text.splitlines(keepends=True)
    if len(lines) <= max_lines:
        return text, False
    omitted = len(lines) - max_lines
    return "".join(lines[:max_lines]) + _TRUNCATION_FOOTER.format(n=omitted), True
```

[`core/executor.py:21-27`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L21-L27)

[5] 전체 일치 수와 돌려준 수를 나누어 싣는다.
상한에 걸렸을 때의 안내는 [`tools/strings_tools.py:242-244`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/strings_tools.py#L242-L244)이다.

```python
        "pattern": pattern,
        "match_count": total_matches,
        "matches": matches,
        "returned": len(matches),
        "max_matches": max_matches,
        "lines_scanned": lines_scanned,
        "complete": complete,
        "truncated": truncated,
```

[`tools/strings_tools.py:229-236`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/strings_tools.py#L229-L236)

[6] 전체 출력과 길이는 기록 전에 결과에서 꺼낸다: [`core/executor.py:74-75`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L74-L75), [`core/executor.py:176-177`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L176-L177).

[7] 표준 출력 전체를 사이드카 파일에 쓴다.
폴더는 호출 기록 파일 옆 `.tool_output`이다([`core/execution_log.py:1542-1547`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/execution_log.py#L1542-L1547)).

```python
                # Always kept: .tool_output/<cid>.txt is the one predictable place
                # a call's output lives. Short outputs used to be excerpt-only and
                # every read of them failed "file not found" (2026-09-23 runs).
                if stdout_full:
                    self._write_stdout_sidecar(cid, stdout_full, entry)
```

[`core/execution_log.py:1517-1521`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/execution_log.py#L1517-L1521)

[8] 호출 기록 ID를 결과에 넣는다: [`core/executor.py:81-96`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L81-L96).

[9] `read.output`의 인자와 문자 상한([`tools/read_output.py:92-114`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/read_output.py#L92-L114)).
읽을 수 있는 경로는 `analysis/`·`exports/`·`reports/` 아래다([`core/paths.py:80-102`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/paths.py#L80-L102)).
사이드카가 없을 때의 안내는 [`tools/read_output.py:51-53`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/read_output.py#L51-L53)이다.

[10] 클라이언트 PreToolUse 훅의 거부 문구: [`claude/hooks/guard_pretooluse.py:246-249`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/claude/hooks/guard_pretooluse.py#L246-L249).
## F03 실행 요청 내용 기록 방식

**상세 항목.** F03.03 실제 실행 명령 기록†, F03.05 모델 호출의 입력·응답 기록†

### F03.03 실제 실행 명령 기록

**구현.** 외부 도구 실행기는 실제로 실행한 argv를 공백으로 이어 결과의 `cmd`에 둔다 [1].
`sudo`가 붙은 명령이면 `sudo`까지 들어간다 [1].
실행기는 명령이 끝난 뒤 이 `cmd`로 `tool_call` 항목을 만든다 [2].
항목에는 `cmd`와 함께 호출 ID·끝난 시각·성공 여부·종료 코드가 들어간다 [3].
SSH와 Velociraptor 실행기는 인자마다 셸 따옴표를 쳐서 잇는다 [4].
Velociraptor는 API 설정 파일 경로를 `<redacted>`로 바꾼다 [4].
서버 안 파이썬 함수로 구현한 도구는 명령을 실행하지 않아 이 항목의 적용 범위가 아니고 기본 항목에 `<py>:<도구 이름>`만 적는다 [5].

**예외.** 외부 도구 실행기의 `cmd`는 argv를 공백으로 이어 공백이 든 인자 하나와 인자 여러 개를 기록에서 가를 수 없다 [1].

### F03.05 모델 호출의 입력·응답 기록

**구현.** 서버 안에서 모델을 부르는 `reason.*` 도구는 모델에게 보낸 사용자 메시지 전체와 최대 토큰 수, 시스템 프롬프트 종류를 `inputs`로 만든다 [6].
호출 전에는 모델 이름을 적은 `call_initiated` 항목을 남긴다 [7].
호출이 끝나면 `reason_call` 항목에 도구 이름·성공 여부·모델 답에서 뽑은 결론과 지시·입출력 토큰 수·`inputs`를 넣는다 [8].
호출이 실패하면 오류 문구도 넣는다 [8].
`reason.evaluate_finding`이 성공하면 인용한 출력의 해시와 심사 정책 식별값을 담은 evidence packet과 review receipt를 같은 항목에 덧붙인다 [9].
심사 정책 식별값은 프롬프트·게이트 소스 파일의 해시와 모델 이름, 토큰 상한 같은 검토 설정을 합친 값이다 [10].

**예외.** 모델 호출 기록에는 시스템 프롬프트 본문이 없고 종류 이름만 있다 [6].
모델 답 원문은 형식 오류가 났을 때만 남긴다 [11].
정책 식별값은 `reason.evaluate_finding`의 성공한 검토에만 붙는다 [9].

### 근거

[1] 실행기 결과의 `cmd`는 argv를 공백으로 이은 문자열이다.
`sudo`는 바로 앞 [`core/executor.py:145-146`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L145-L146)에서 붙는다.

```python
        "cmd": " ".join(cmd),
```

[`core/executor.py:155-155`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L155-L155)

[2] 명령이 끝난 뒤 결과의 `cmd`로 기록한다: [`core/executor.py:78-95`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/executor.py#L78-L95).

[3] `tool_call` 항목의 필드다.

```python
            entry: dict = {
                "call_id": cid,
                "type": "tool_call",
                "ts": _utcnow(),
                "cmd": cmd,
                "success": success,
                "truncated": truncated,
                "retries": retries,
                "exit_code": exit_code,
                "elapsed_seconds": elapsed_seconds,
                "stderr": stderr[:512] if stderr else "",
            }
```

[`core/execution_log.py:1490-1501`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/execution_log.py#L1490-L1501)

[4] SSH([`core/ssh.py:199-202`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/ssh.py#L199-L202))와 Velociraptor의 기록 문자열이다.

```python
    safe_cmd = (
        f"{bin_path} --api_config <redacted> " +
        " ".join(shlex.quote(a) for a in argv)
    )
```

[`tools/velo.py:100-103`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/velo.py#L100-L103)

[5] 파이썬 도구의 기본 항목이다.

```python
            return log.record_tool_call(
                cmd=f"<py>:{tool_name}",
                success=ok,
                truncated=False,
                retries=0,
```

[`core/middleware.py:546-550`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/middleware.py#L546-L550)

[6] 모델 입력으로 기록할 값이다.

```python
    _inputs = {
        "user_message": user,
        "max_tokens": max_tokens,
        "system_prompt_kind": _tool_name,
    }
```

[`tools/reasoning.py:921-925`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/reasoning.py#L921-L925)

[7] 호출 전 모델 이름을 기록한다: [`tools/reasoning.py:937-942`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/reasoning.py#L937-L942).
호환 API 경로도 모델 이름을 적는다: [`tools/reasoning.py:702-704`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/reasoning.py#L702-L704).

[8] `reason_call` 항목의 필드와 오류 기록([`core/execution_log.py:1641-1645`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/execution_log.py#L1641-L1645)).
도구는 [`tools/reasoning.py:1854-1878`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/reasoning.py#L1854-L1878)에서 이 함수를 부른다.

```python
            entry: dict = {
                "call_id": cid,
                "type": "reason_call",
                "ts": _utcnow(),
                "tool": tool,
                "success": success,
                "conclusion": conclusion or "",
                "directives": directives,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            }
```

[`core/execution_log.py:1618-1628`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/execution_log.py#L1618-L1628)

[9] 검토가 성공하면 receipt와 packet을 항목에 덧붙인다.

```python
    if packet is not None and result.get("success"):
        if not packet_current(log, packet):
            result.update(success=False, error="Evidence changed during review; retry with current evidence",
                          retryable=True)
        else:
            receipt = {'schema_version': 1, 'packet_id': packet['packet_id'],
                       'binding': packet_binding(packet), 'policy': packet['policy']}
            result['review_receipt'] = receipt
            log.update_reason_call(result.get('_trudi_call_id', 0),
                                   review_receipt=receipt, evidence_packet=packet)
```

[`tools/reasoning.py:2764-2773`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/reasoning.py#L2764-L2773)

[10] 정책 식별값을 만드는 함수: [`core/evidence_packets.py:58-72`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/core/evidence_packets.py#L58-L72).

[11] 형식 오류일 때만 원문을 넣고 그 밖에는 원문을 버린다: [`tools/reasoning.py:1846-1850`](https://github.com/nebulae/trudi/blob/88fbca78186b6a0ca40423cf5e37a9dc46ae051e/tools/reasoning.py#L1846-L1850).
