# sift-kernel 시범 전환 원고

B04·C04·E02·F03 4개 셀을 새 보고서 형식으로 쓴 원고다. 셀과 상세 항목의 정의는 `상세정의.yaml`을 따른다. 상세 항목마다 **구현**을 쓰고 †가 붙은 항목에는 **예외**를 따로 쓴다. 본문의 [번호]는 그 절 끝 **근거**의 같은 번호를 가리킨다.

**기준 커밋.** [`ea51bec`](https://github.com/Sathvik-1007/sift-kernel/tree/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396)(2026-06-16). 줄 번호는 모두 이 커밋 기준이다.

**확인 방법.** 코드는 기준 커밋을 `git show`로 읽었다. 실행 확인은 WSL Ubuntu 26.04와 Node 22.23.3에서 서버를 MCP 클라이언트로 부른 기록(`기록/판정검토_sift-kernel_2026-09-29/`)을 인용한다. 그 환경에는 `ewfverify`·`foremost`·`tshark`가 없었고 서버를 루트 권한 없이 돌렸다.

## B04 선행 상태에 따른 실행 제어 방식

**상세 항목.** B04.01 메모리 상태·능력 집합 대조†, B04.03 단계 전이 조건 검사†

### B04.01 메모리 상태·능력 집합 대조

**구현.** 서버는 분류 도구의 연산마다 실행에 필요한 능력(`requires`)과 성공한 뒤 생기는 능력(`produces`)을 명세로 둔다 [1]. 예를 들어 `list_directory`는 `evidence_mounted`와 `integrity_verified`를 요구하고 성공하면 `filesystem_accessible`을 만든다 [1]. 서버가 지금 가진 능력은 `CapabilityGraph`의 메모리 집합 `held`에 있다 [2].

모델이 분류 도구를 부르면 서버는 `operation` 인자로 내부 연산을 고른다 [3]. 외부 도구를 실행하기 직전에 그 연산의 `requires`를 `held`와 대조한다 [4]. 모자란 능력이 있으면 실행하지 않고 `CAPABILITY_BLOCKED` 오류를 돌려준다 [4]. 오류에는 모자란 능력, 가진 능력, 다음 작업 권고가 들어간다 [4]. 마운트 전에 `list_directory`를 부르자 `evidence_mounted`·`integrity_verified`가 모자라 거부됐다 [5].

실행이 성공으로 끝나면 `produce`가 그 연산의 `produces`를 `held`에 더한다 [6]. 실패한 연산은 능력을 만들지 않는다 [6]. 다음 호출의 대조는 이렇게 늘어난 집합을 쓴다.

**예외.** 능력 대조는 분류 도구의 연산에만 걸린다. `register_finding`·`register_hypothesis`·`reassess_finding`·`corroborate_finding`·`challenge_finding`·`generate_report`는 명세에 요구 능력이 있지만 능력 대조보다 앞의 분기에서 처리되고 돌아간다 [7]. 마운트 전에 `register_hypothesis`를 부르자 가설이 등록됐다 [7].

능력이 생기는 조건은 연산의 성공이고 그 연산이 확인하려던 사실이 아니다. `verify_integrity`는 `ewfverify`를 부르는데 실행 파일이 없으면 실행기가 해시를 계산하지 않는 `img_stat`으로 바꿔 부른다 [8]. `img_stat`이 성공하면 `integrity_verified`가 생긴다 [6][8]. `list_registry_hives`는 파일 목록 기록이 없어도 성공으로 끝나 `registry_accessible`을 만든다 [9]. 능력은 증거와 묶이지 않고 `held`에 더해지기만 하므로 다른 이미지를 다시 마운트해도 앞의 확인이 그대로 쓰인다 [2][6].

HTTP 전송은 요청마다 서버를 새로 만들고 서버를 만들 때 능력 그래프도 빈 집합으로 새로 만든다 [10]. 앞 요청이 만든 능력은 다음 요청에 남지 않는다. 상태가 얼마나 남는지는 A05에서 본다.

### B04.03 단계 전이 조건 검사

**구현.** 방법론 상태 기계는 증거 종류별 기준 도구와 상관 분석 도구를 시도하면서 단계를 옮기고 마지막에 `REPORT` 단계에 이른다 [11]. `generate_report`는 `REPORT` 단계가 아니면 남은 기준 도구 가운데 요구 능력을 채운 도구를 센다 [12]. 발견사항이 하나도 없고 그런 도구가 남았으면 `INVESTIGATION_INCOMPLETE`로 거부한다 [12]. 그 밖에는 상태 기계를 `REPORT`로 옮기고 보고서를 만든다 [12].

**예외.** 요구 능력을 채운 기준 도구가 하나도 없으면 발견사항이 없어도 검사를 통과한다 [12]. 기준 도구는 모두 파일시스템·레지스트리·이벤트 로그 능력을 요구하므로 마운트 전에는 이 경우에 든다 [13].

### 근거

[1] 도구 명세의 요구·생성 능력이다.

```typescript
  { tool: "list_directory", requires: ["evidence_mounted", "integrity_verified"], produces: ["filesystem_accessible"], category: "filesystem", description: "List directory contents with deleted file detection" },
```

[`src/domain/capability-graph.ts:21-21`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/capability-graph.ts#L21-L21)

[2] 보유 능력은 서버 객체가 만든 메모리 집합이다.

```typescript
export class CapabilityGraph {
  private readonly specs: ReadonlyMap<string, ToolCapabilitySpec>;
  private readonly held: Set<Capability>;

  constructor() {
    this.specs = new Map(TOOL_SPECS.map((s) => [s.tool, s]));
    this.held = new Set();
  }
```

[`src/domain/capability-graph.ts:223-230`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/capability-graph.ts#L223-L230)

[3] 분류 도구 이름과 `operation`으로 내부 연산을 고르고 도구 이름을 바꾼다: [`src/server.ts:386-400`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L386-L400).

[4] 요구 능력을 보유 집합과 대조하고([`src/domain/capability-graph.ts:246-251`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/capability-graph.ts#L246-L251)) 모자라면 거부 응답을 돌려준다.

```typescript
    // ── Capability Check ──
    const canExec = capabilityGraph.canExecute(name);
    if (canExec.isErr()) {
      const error = canExec.error;
      return { content: [{ type: "text" as const, text: JSON.stringify({
        error: "CAPABILITY_BLOCKED",
        tool: name,
        missing_capabilities: error.missing,
        held_capabilities: error.held,
        guidance: error.guidance,
        suggestion: methodology.suggestNextAction(capabilityGraph.getHeld()),
      }) }], isError: true };
    }
```

[`src/server.ts:1783-1795`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1783-L1795)

[5] 마운트 전 `list_directory` 호출 결과(실행 확인, [probe_out.txt 6줄](../../판정검토_sift-kernel_2026-09-29/probe_out.txt)). 능력이 모자라 거부된 다른 예는 [probe2_out.txt 7줄](../../판정검토_sift-kernel_2026-09-29/probe2_out.txt)이다.

[6] 성공한 연산만 능력을 만들고([`src/server.ts:2057-2068`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L2057-L2068)) `produce`는 집합에 더하기만 한다.

```typescript
  /** Produce capabilities after successful tool execution */
  produce(tool: string): readonly Capability[] {
    const spec = this.specs.get(tool);
    const produced: Capability[] = [];
    if (spec) {
      for (const cap of spec.produces) {
        if (!this.held.has(cap)) {
          this.held.add(cap);
          produced.push(cap);
        }
      }
    }
    return produced;
  }
```

[`src/domain/capability-graph.ts:254-267`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/capability-graph.ts#L254-L267)

[7] 이 도구들의 분기가 능력 대조([`src/server.ts:1784`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1784))보다 앞에 있다: [`src/server.ts:657`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L657), [`src/server.ts:665`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L665), [`src/server.ts:685`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L685), [`src/server.ts:789`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L789), [`src/server.ts:796`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L796), [`src/server.ts:816`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L816). 마운트 전 가설 등록 결과(실행 확인, [probe3_out.txt 1줄](../../판정검토_sift-kernel_2026-09-29/probe3_out.txt)).

[8] 실행 파일이 없을 때 바꿔 부를 이름의 목록에 `ewfverify`→`img_stat`이 있다. 실행기는 실행 파일을 찾지 못하면 이 목록의 이름으로 다시 실행한다([`src/adapters/process-executor.ts:221-224`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/adapters/process-executor.ts#L221-L224)). `verify_integrity`의 실행 파일은 `ewfverify`다([`src/server.ts:202`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L202)). `ewfverify`가 없는 환경에서 `verify_integrity`가 성공으로 기록됐다(실행 확인, [probe2_out.txt 10줄](../../판정검토_sift-kernel_2026-09-29/probe2_out.txt)).

```typescript
  ["ewfverify", "img_stat"],
  ["img_stat", "ewfverify"],
```

[`src/adapters/process-executor.ts:81-82`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/adapters/process-executor.ts#L81-L82)

[9] 파일 목록 기록이 없어도 `success: true`를 돌려준다.

```typescript
function handleListRegistryHives(_params: Record<string, unknown>, ctx: HandlerContext): HandlerResult {
  const flsEntries = ctx.ledgerEntries.filter(e => e.tool === "list_directory");
  if (flsEntries.length === 0) {
    return { success: true, output: JSON.stringify({ result: "no_filesystem_data", message: "Run list_directory first to discover registry hive files.", suggestion: { tool: "list_directory", params: { path: "/Windows/System32/config/" } } }) };
  }
```

[`src/handlers/in-process.ts:633-637`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/handlers/in-process.ts#L633-L637)

[10] HTTP 요청마다 서버를 만든다. 서버를 만드는 함수가 능력 그래프를 새로 만든다([`src/server.ts:299-300`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L299-L300)).

```typescript
    // Create transport and server for each session
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
    const server = createSiftKernelServer(config);
```

[`src/http-transport.ts:48-50`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/http-transport.ts#L48-L50)

[11] `CORRELATE` 단계에서 남은 상관 분석 도구와 열린 가설이 없으면 `REPORT`로 옮긴다: [`src/domain/methodology.ts:538-549`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/methodology.ts#L538-L549). `isReadyForReport`는 단계가 `REPORT`인지만 본다: [`src/domain/methodology.ts:789-792`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/methodology.ts#L789-L792).

[12] `generate_report`의 검사다. 요구 능력을 채운 남은 도구가 있고 발견사항이 없을 때만 거부한다.

```typescript
      if (!methodology.isReadyForReport()) {
        const remaining = methodology.getRemainingSteps();
        const heldCaps = capabilityGraph.getHeld();
        // A tool is "actionable" if it hasn't been attempted AND its prerequisites are met
        const actionableRemaining = remaining.tools.filter(t => {
          const spec = TOOL_SPECS.find(s => s.tool === t);
          if (!spec) return false;
          return spec.requires.every(cap => heldCaps.includes(cap));
        });
        if (actionableRemaining.length > 0 && findings.size < 1) {
          // Hard block: no findings registered AND tools are still runnable — too early
          return { content: [{ type: "text" as const, text: JSON.stringify({
            error: "INVESTIGATION_INCOMPLETE",
            message: `Cannot generate report — no findings registered and ${actionableRemaining.length} tools remain actionable. Call suggest_next_action() and continue investigating.`,
            fsm_state: methodology.getState(),
            remaining_tools: actionableRemaining.slice(0, 10),
            remaining_count: actionableRemaining.length,
            coverage: methodology.getOverallCoverage(),
            action_required: "Call suggest_next_action() to get the next tool to execute.",
          }) }] };
        }
        // Otherwise: findings exist, and remaining tools are blocked by unmet prerequisites
        // (e.g. timeline tools need Plaso which failed). Force-advance FSM and proceed.
        methodology.forceAdvanceToReport();
```

[`src/server.ts:820-843`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L820-L843)

[13] Windows 디스크 기준 도구 목록: [`src/domain/methodology.ts:165-190`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/methodology.ts#L165-L190). 목록의 도구는 모두 `filesystem_accessible`·`registry_accessible`·`eventlogs_accessible` 가운데 하나 이상을 요구한다([`src/domain/capability-graph.ts:21-171`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/capability-graph.ts#L21-L171)).
## C04 원본 변경 방지 방식

**상세 항목.** C04.06 외부 도구에 의존†

### C04.06 외부 도구에 의존

**구현.** 서버에는 원본 쓰기를 막는 장치가 없다. 원본 보호는 서버가 부르는 외부 도구가 이미지를 읽기만 한다는 데 달려 있다. 이미지를 다루는 연산은 Sleuth Kit(`fls`·`mmls`·`istat`·`icat`·`fsstat`·`img_stat`)에 이미지 경로를 넘기고 결과를 표준 출력으로 받는다 [1]. Volatility와 YARA 연산도 이미지 경로를 읽기 인자로 받는다 [2]. 파일을 만드는 외부 도구(`tsk_recover`·`foremost`·`bulk_extractor`·`log2timeline`)에는 서버가 출력 폴더 아래 경로를 쓰기 위치로 넣는다 [3]. 외부 도구의 작업 폴더도 출력 폴더라서 쓰기 위치를 따로 받지 않는 도구가 만드는 파일도 출력 폴더에 생긴다 [3]. 분석 연산이 받는 이미지 경로는 `mount_evidence`가 조사 상태에 적은 원래 이미지 파일의 경로다 [4].

원시 이미지는 `mount -o ro,loop,noexec,noatime`으로 읽기 전용 마운트를 시도한다 [5]. 마운트가 실패하면 `fls`로 이미지를 직접 읽을 수 있는지 보고 읽히면 성공으로 처리한다 [6]. 마운트가 성공해도 분석 연산은 마운트 지점이 아니라 이미지 파일 경로를 쓴다 [4]. E01은 첫 단계인 `ewfmount`만 실행하고 읽기 전용 마운트 명령은 단계 설명 문자열에만 있다 [7]. 분석 경로가 읽기 전용 마운트를 쓰지 않으므로 C04.02에는 연결하지 않는다.

**예외.** `extract_files_from_pcap`은 `tshark --export-objects`의 목적지를 출력 폴더가 아니라 조사 상태의 증거 경로 뒤에 `pcap_export/`를 붙여 정한다 [8]. pcap 마운트는 받은 경로에 파일이 있는지 보지 않고 조사 상태의 증거 경로로 적는다 [9]. tshark 3.6.2는 내보내기 목적지 폴더를 부모 폴더까지 만든다 [10]. 그래서 증거 폴더 안의 없는 파일 이름으로 pcap을 마운트한 뒤 이 연산을 부르면 증거 폴더 안에 새 폴더와 내보낸 파일이 생긴다. 이 경로는 tshark가 없는 환경이라 실행하지 못했다. 원본 파일을 고치지는 않지만 증거 폴더에 새 자료를 만든다.

### 근거

[1] Sleuth Kit 연산은 이미지 경로 `ev`를 읽기 인자로 받는다.

```typescript
    list_directory: { binary: "fls", buildArgs: (p, ev, off) => [...(p["recursive"] ? ["-r"] : []), "-l", "-p", ...(p["show_deleted"] ? ["-d"] : []), "-o", String(off), ev, ...(p["inode"] ? [String(p["inode"])] : [])] },
    list_partitions: { binary: "mmls", buildArgs: (_, ev) => [ev] },
    get_file_metadata: { binary: "istat", buildArgs: (p, ev, off) => ["-o", String(off), ev, String(p["inode"])] },
    extract_file: { binary: "icat", buildArgs: (p, ev, off) => ["-o", String(off), ev, String(p["inode"])] },
```

[`src/server.ts:161-164`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L161-L164)

[2] Volatility 연산([`src/server.ts:206-216`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L206-L216))과 YARA 연산([`src/server.ts:191`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L191))의 인자 구성.

[3] 파일을 만드는 도구의 쓰기 위치는 출력 폴더 `out` 아래다. `tsk_recover`는 [`src/server.ts:171`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L171), `log2timeline`은 [`src/server.ts:181`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L181)에 있다. 실행기의 기본 작업 폴더는 출력 폴더다([`src/adapters/process-executor.ts:153`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/adapters/process-executor.ts#L153)).

```typescript
    carve_files: { binary: "foremost", buildArgs: (p, ev, _off, out) => ["-o", `${out}/carved/`, ...(p["file_types"] ? ["-t", (p["file_types"] as string[]).join(",")] : []), "-i", ev] },
    analyze_unallocated: { binary: "bulk_extractor", buildArgs: (_, ev, _off, out) => ["-o", `${out}/be_out/`, ev] },
```

[`src/server.ts:176-177`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L176-L177)

[4] 분석 연산은 조사 상태의 이미지 경로로 인자를 만든다: [`src/server.ts:1848-1849`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1848-L1849), [`src/server.ts:1939`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1939). 마운트가 성공하면 조사 상태에 원래 이미지 경로를 적는다: [`src/server.ts:1744-1749`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1744-L1749).

[5] 원시 이미지의 마운트 명령이다.

```typescript
      } else {
        // Raw/dd — direct mount
        mountSteps.push(`mount -o ro,loop,noexec,noatime "${imagePath}" /mnt/evidence/`);
        mountCommand = { binary: "mount", args: ["-o", "ro,loop,noexec,noatime", imagePath, "/mnt/evidence/"] };
```

[`src/server.ts:1663-1666`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1663-L1666)

[6] 마운트가 실패하면 `fls`로 직접 읽히는지 본다.

```typescript
      // FALLBACK: If mount fails, check if the image is directly accessible by sleuthkit
      // This handles ewfmounted images (/mnt/ewf/ewf1) and raw images that don't need mounting
      if (!success) {
        const flsCheck = await executor.execute("fls", ["-o", "0", imagePath]);
        if (flsCheck.isOk() && flsCheck.value.exitCode === 0 && flsCheck.value.stdout.length > 0) {
          success = true;
          rawOutput = `Image accessible directly via Sleuth Kit (no filesystem mount needed).\nRoot entries:\n${flsCheck.value.stdout.slice(0, 2000)}`;
```

[`src/server.ts:1674-1680`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1674-L1680)

[7] E01의 두 단계 가운데 실행하는 것은 `mountCommand` 하나다: [`src/server.ts:1644-1650`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1644-L1650), [`src/server.ts:1669-1670`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1669-L1670).

[8] 내보내기 목적지는 증거 경로 `ev` 뒤에 붙는다.

```typescript
    extract_files_from_pcap: { binary: "tshark", buildArgs: (p, ev) => ["-r", String(p["path"] ?? ""), "--export-objects", `http,${ev || "/tmp"}/pcap_export/`] },
```

[`src/server.ts:197-197`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L197-L197)

[9] pcap 확장자면 파일 확인 없이 조사 상태에 경로를 적고 능력을 준다: [`src/server.ts:1625-1632`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1625-L1632).

[10] [tshark 3.6.2 `ui/cli/tap-exportobject.c`](https://github.com/wireshark/wireshark/blob/wireshark-3.6.2/ui/cli/tap-exportobject.c)의 내보내기 목적지 처리.
## E02 대량 결과 전달 방식

**상세 항목.** E02.01 문자·항목 상한†, E02.07 건수 없이 잘림만 알림†

### E02.01 문자·항목 상한

**구현.** 외부 도구 실행기는 표준 출력을 50 MiB와 50만 줄에서 끊는다 [1]. 서버는 연산에 따라 더 작은 줄 상한을 준다. `search_filename`은 5만 줄, 재귀 `list_directory`는 2만 줄, 이벤트 로그 연산은 3천 줄이다 [2]. 실행기는 줄을 출력 조각 단위로 세므로 상한을 넘은 조각까지 모은 뒤 프로세스를 끊는다 [3]. 상한이나 시간 제한에 걸려 끊어도 모은 출력이 있으면 실행기는 종료 코드 -1과 출력을 돌려준다 [4]. 서버는 이 결과를 성공으로 처리한다 [5]. 전용 파서가 없는 연산의 출력은 기본 처리에서 1만 자로 자른다 [6]. 모델은 이 상한들을 호출 인자로 바꿀 수 없다 [2][6].

**예외.** 전용 파서를 거친 결과에는 건수 상한이 없다. regipy 연산은 결과 JSON 파일을 크기 제한 없이 읽으므로 실행기의 출력 상한도 걸리지 않는다 [7].

### E02.07 건수 없이 잘림만 알림

**구현.** 1만 자에서 자른 출력 끝에는 `...[truncated]`를 붙인다 [6]. 기본 처리는 전체 줄 수 `recordCount`와 잘렸는지를 뜻하는 `rawTruncated`도 만든다 [6]. 서버는 파서 결과에서 `data`만 응답에 넣으므로 이 두 값은 모델에게 가지 않는다 [8].

**예외.** 잘림 표시는 파서 없는 연산의 1만 자 잘림에만 붙는다. 줄 상한이나 시간 제한에서 끊긴 결과에는 잘림 표시도 건수도 없다 [4][5]. 파일 60,000개가 든 이미지에서 `search_filename`은 50,015건을 잘림 표시 없이 돌려줬다 [9]. 서버는 원래 출력을 `raw` 폴더에 파일로 보관하지만 그 파일을 응답과 이어 읽게 하는 도구는 없다 [10]. 그래서 E02.04에 연결하지 않는다.

### 근거

[1] 실행기의 기본 출력 상한이다.

```typescript
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_OUTPUT_LINES = 500_000; // Kill process if output exceeds this many lines
```

[`src/adapters/process-executor.ts:84-85`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/adapters/process-executor.ts#L84-L85)

[2] 연산별 줄 상한과 시간 제한이다.

```typescript
      const execOpts: import("./ports/tool-executor.port.js").ExecutorOptions = {};
      if (name === "search_filename") {
        Object.assign(execOpts, { timeoutMs: 30_000, maxLines: 50_000 });
      } else if (name === "list_directory" && toolParams["recursive"]) {
        Object.assign(execOpts, { timeoutMs: 30_000, maxLines: 20_000 });
      } else if (name === "parse_event_log" || name === "search_events" || name === "parse_powershell_logs") {
        // evtx_dump on a 262MB log emits millions of JSONL events; bound output to a
        // representative sample (≈3000 events) — enough to detect clearing (EID 1102),
        // logons (4624/4625), process creation (4688) — without flooding LLM context.
        Object.assign(execOpts, { timeoutMs: 35_000, maxLines: 3_000 });
      }
```

[`src/server.ts:1944-1954`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1944-L1954)

[3] 출력 조각을 먼저 모으고 줄 수가 상한에 이르면 프로세스를 끊는다: [`src/adapters/process-executor.ts:195-212`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/adapters/process-executor.ts#L195-L212).

[4] 끊긴 프로세스에 출력이 있으면 종료 코드 -1로 돌려준다.

```typescript
        if (killed) {
          // If killed due to output limits but we have data, return partial output with non-zero exit code
          if (stdout.length > 0) {
            resolve(ok({ stdout, stderr, exitCode: -1, durationMs }));
          } else {
            resolve(err(executionError(binary, code, stderr || "Process killed (timeout or output limit)", true)));
          }
          return;
```

[`src/adapters/process-executor.ts:236-243`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/adapters/process-executor.ts#L236-L243)

[5] 종료 코드 -1이어도 출력이 있으면 성공이다.

```typescript
        // exitCode -1 = killed due to line limit (partial output is valid for searches)
        success = execResult.value.exitCode === 0 || (execResult.value.exitCode === -1 && rawOutput.length > 0);
```

[`src/server.ts:1962-1963`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1962-L1963)

[6] 파서가 없는 연산의 기본 처리다.

```typescript
    default:
      // Fallback: wrap raw output in basic structure
      return ok({
        summary: raw.split("\n").slice(0, 3).join("\n"),
        data: { raw: raw.length > 10000 ? raw.slice(0, 10000) + "\n...[truncated]" : raw },
        recordCount: raw.split("\n").filter(Boolean).length,
        anomalies: [],
        rawTruncated: raw.length > 10000,
      });
```

[`src/parsers/index.ts:106-114`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/parsers/index.ts#L106-L114)

[7] regipy 연산은 표준 출력 대신 결과 파일을 통째로 읽는다.

```typescript
        if (success && mapping.binary === "regipy-plugins-run") {
          try {
            const { readFileSync, unlinkSync } = await import("node:fs");
            try {
              const json = readFileSync(`${config.outputPath}/regipy_out.json`, "utf8");
              if (json.trim().length > 0) rawOutput = json;
```

[`src/server.ts:1967-1972`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1967-L1972)

[8] 응답에 넣는 값은 파서 결과의 `data`다: [`src/server.ts:139-142`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L139-L142), [`src/server.ts:2081-2089`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L2081-L2089).

[9] 파일 60,000개 이미지의 `search_filename` 결과 건수(실행 확인, [probe2_out.txt 4줄](../../판정검토_sift-kernel_2026-09-29/probe2_out.txt)).

[10] 원래 출력 저장: [`src/server.ts:2049-2051`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L2049-L2051). 저장한 원래 출력을 다시 읽는 곳은 발견사항 등록의 근거 확인([`src/server.ts:731`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L731), [`src/server.ts:747`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L747))과 서버 안 처리기의 입력 준비([`src/server.ts:1996`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1996))뿐이다.
## F03 실행 요청 내용 기록 방식

**상세 항목.** F03.02 도구명과 구조화 인자 기록†

### F03.02 도구명과 구조화 인자 기록

**구현.** 호출 기록 항목은 도구 이름 `tool`과 인자 객체 `params`를 따로 가진다 [1]. SQLite 저장소는 `params`를 JSON 문자열 열에 넣고 읽을 때 객체로 되돌린다 [2]. 외부 도구와 서버 안 처리기를 부르는 공통 경로는 실행이 끝난 뒤 이 항목을 만든다 [3].

기록하는 도구 이름과 인자는 모델이 보낸 요청 그대로가 아니다. 서버는 분류 도구 호출의 도구 이름을 `operation`이 가리키는 내부 연산 이름으로 바꾸고 `operation`을 인자에서 뺀다 [4]. 레지스트리 연산에 경로가 없으면 기본 하이브 경로를 넣는다 [5]. 이미지 안 경로를 받은 이벤트 로그·레지스트리 연산은 파일을 출력 폴더로 꺼낸 뒤 `path`를 꺼낸 파일의 경로로 바꾼다 [5]. `list_directory`·`search_filename`은 `path`로 찾은 inode를 `inode`에 넣고 `path`를 지운다 [6]. 호출 기록에는 이렇게 바뀐 값이 남는다 [3]. 서버는 이 값으로 외부 도구의 인자 배열을 만든다 [7].

**예외.** 모델이 보낸 원래 값은 바뀐 뒤 남지 않는다. `path`를 inode로 바꾼 연산은 요청한 경로가 기록에서 사라진다 [6]. 외부 도구에 넘긴 인자 배열은 기록하지 않고 인자 배열을 만들 때 더하는 증거 경로·파티션 오프셋·출력 폴더도 항목에 없다 [1][7]. 그래서 F03.03·F03.04에는 연결하지 않는다.

경로를 따라가려고 서버가 부른 `fls`·`icat`는 호출 기록에 남지 않는다 [5][6]. `mount_evidence`는 `image_path`와 형식만 남긴다 [8]. 발견사항 등록·보고서 생성처럼 능력 대조 앞의 분기에서 처리되는 도구는 `mount_evidence`를 빼고 항목을 만들지 않는다 [9]. 능력이 모자라 거부된 호출도 항목이 없다 [9].

### 근거

[1] 호출 기록 항목의 필드다.

```typescript
  const id = nanoid() as unknown as LedgerEntryId;
  return {
    id,
    tool: params.tool,
    params: params.toolParams,
    outputHash: params.outputHash,
    rawOutputPath: params.rawOutputPath,
    timestamp: new Date().toISOString(),
    prevHash: params.prevHash,
    capabilitiesHeld: params.capabilitiesHeld,
    findingsProduced: params.findingsProduced,
    anomaliesFlagged: params.anomaliesFlagged,
    durationMs: params.durationMs,
    success: params.success,
    errorMessage: params.errorMessage,
  };
```

[`src/domain/ledger.ts:57-72`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/domain/ledger.ts#L57-L72)

[2] `params`를 JSON 문자열로 넣고([`src/adapters/sqlite-ledger.ts:198-204`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/adapters/sqlite-ledger.ts#L198-L204)) 읽을 때 되돌린다([`src/adapters/sqlite-ledger.ts:323`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/adapters/sqlite-ledger.ts#L323)).

[3] 공통 경로는 실행 뒤 바뀐 `toolParams`로 항목을 만든다.

```typescript
    // Create ledger entry first (need the ID for raw store)
    const outputHash = hashData(JSON.stringify(parsed));
    const lastEntry = ledgerStore.getLastEntry();
    const prevHash = lastEntry ? hashEntry(lastEntry) : getGenesisHash();
    const entry = createLedgerEntry({
      tool: name,
      toolParams,
      outputHash,
      rawOutputPath: "",
      prevHash,
      capabilitiesHeld: capabilityGraph.getHeld(),
      findingsProduced: [],
      anomaliesFlagged: [],
      durationMs,
      success,
      ...(errorMsg ? { errorMessage: errorMsg } : {}),
    });
```

[`src/server.ts:2031-2047`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L2031-L2047)

[4] 분류 도구 호출을 내부 연산으로 바꾼다.

```typescript
      // Rewrite the call to the internal tool name, passing remaining params
      name = internalTool;
      const { operation: _op, ...rest } = toolParams;
      toolParams = rest;
```

[`src/server.ts:396-399`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L396-L399)

[5] 기본 하이브를 넣고([`src/server.ts:1871-1874`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1871-L1874)) 이미지에서 꺼낸 파일 경로로 `path`를 바꾼다.

```typescript
          if (currentInode) {
            // Stream-extract via icat to a host file (no size cap — handles 262MB evtx)
            const safeName = (segments[segments.length - 1] ?? "file").replace(/[^A-Za-z0-9._-]/g, "_");
            const extractedPath = `${config.outputPath}/extracted_${currentInode}_${safeName}`;
            const exResult = await executor.extractToFile(
              "icat",
              ["-o", String(investigationState.partitionOffset), evidencePath, currentInode],
              extractedPath,
            );
            if (exResult.isOk()) {
              toolParams["path"] = extractedPath;
            }
```

[`src/server.ts:1896-1907`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1896-L1907)

[6] `path`를 inode로 바꾸고 지운다.

```typescript
          if (currentInode) {
            toolParams["inode"] = currentInode;
            delete toolParams["path"];
          }
```

[`src/server.ts:1933-1936`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1933-L1936)

[7] 외부 도구 인자는 `toolParams`에 증거 경로·오프셋·출력 폴더를 더해 만든다: [`src/server.ts:1939`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1939).

[8] 마운트 항목의 인자: [`src/server.ts:1727-1729`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1727-L1729).

[9] 앞의 분기([`src/server.ts:403-1581`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L403-L1581))에는 항목을 만드는 코드가 없다. 항목은 마운트([`src/server.ts:1617`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1617), [`src/server.ts:1637`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1637), [`src/server.ts:1727`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1727)), 비동기 실행([`src/server.ts:1826`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1826)), 공통 경로([`src/server.ts:2035`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L2035))에서만 만든다. 능력 대조 거부는 항목 없이 돌아간다([`src/server.ts:1784-1795`](https://github.com/Sathvik-1007/sift-kernel/blob/ea51bec90d4cb543e4aa6063af6e85ae3e4d9396/src/server.ts#L1784-L1795)).
