# OpenSandbox Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sandbox: { runtime: opensandbox }` runs a whole flow inside one OpenSandbox sandbox per run.
The agents' edits never touch the Mac, egress is an allowlist, and the real keys stay on the host.
The run ends with a patch for the owner to review and apply.

**Architecture:** run-flow stays on the host and supervises. At run start it creates one sandbox and uploads `git archive HEAD` of the folder to the folder's own absolute path inside. It also starts a relay that turns HTTP-upgrade connections through OpenSandbox's port gateway into processes with live stdio. Every step (shell or AI) spawns through an `ExecHost` built on that relay. The artifacts folder is mirrored into the box before each step and back after it. `ask_user` reaches the host broker through a reverse tunnel on the same relay. At the end, `git diff --binary` comes back as `<run folder>/changes.patch`.

**Tech Stack:** TypeScript on Node 24 (type stripping, `node --test`), `@alibaba-group/opensandbox` 1.1.1, OpenSandbox server run by the owner (`uvx opensandbox-server`), the `flowboard-cli` image.

**Spec:** `docs/FlowBoard/Sandboxing/OpenSandbox Spike.md` (the spike's FINDINGS; spike scripts on branch `spike/opensandbox`, `spike/opensandbox/t1–t4*.mjs`, `relay.cjs`).

## Global Constraints

- Pin `@alibaba-group/opensandbox` at exactly `1.1.1` in `packages/adapters/package.json`.
- Server requirements (documented, checked at run start where possible): `[egress] mode = "dns+nft"`, `publish_host = "127.0.0.1"`, an `api_key`. Connection comes from `OPENSANDBOX_DOMAIN` (default `127.0.0.1:8080`) and `OPENSANDBOX_API_KEY`, never from the flow YAML.
- SDK `requestTimeoutSeconds: 120` on every connection (the default 30 s loses the first create while images pull).
- Network policy is always `defaultAction: "deny"`; rules are FQDNs or `*.` wildcards (IP/CIDR unsupported).
- Credentials never enter the box: the box env carries a fake value of the right shape, and a vault `bearer` binding injects the real one. Built-in bindings: `CLAUDE_CODE_OAUTH_TOKEN` → `api.anthropic.com`; `OPENROUTER_API_KEY` → `openrouter.ai`.
- Paths are identical inside and out: the folder, the artifacts folder, the run's temp folders and plugin folders live at their host absolute paths in the box. FlowBoard's own code is at `/opt/flowboard` in the image, reached through `ExecHost.mapPath`.
- The relay checks a per-run token (`?token=`) on every upgrade; the gateway has no auth of its own.
- Agents never write to the Mac. Only run-flow writes, and only into the run folder: state, logs, mirrored artifacts, `changes.patch`.
- `runtime: docker` (today's behaviour) stays the default and keeps passing its tests unchanged.
- Live tests run only with `FLOWBOARD_OPENSANDBOX=1` and skip otherwise.

## Review Focus

1. **The box disappears mid-run** (TTL, server restart): the step in flight must end with an error line naming the sandbox id, never a hang. Pinned in Task 4 (`a step whose box was killed ends with an error`).
2. **`--resume` after run-flow died:** it reconnects to the same sandbox from `<run folder>/sandbox.json`. If that sandbox is gone, it refuses with a clear line and does not create an empty one (the edits would be lost silently). Pinned in Task 6.
3. **Binary files and deletions in the agents' edits** must survive the patch (`--binary`, deleted files). Pinned in Task 4 (`patch keeps a deleted file and a binary file`).
4. **Ctrl+C / stop** must kill the process inside the box (the relay gets a kill frame), not just drop the connection. Pinned in Task 1 (`kill() ends the remote process with its signal`).
5. **Two steps in parallel** (fan-out) share one box: each gets its own relay connection, and their stdio never cross. Pinned in Task 1 (`two children at once keep their streams apart`).

---

### Task 1: The relay and its client ExecHost

The relay runs inside the box. The client turns each relay connection into a `ChildProcess`-like object, so providers and `execShell` keep working unchanged. Both are tested on the host: the relay is plain Node, so tests start it locally on a free port, with no OpenSandbox involved.

**Files:**
- Create: `code/flowboard/packages/adapters/src/exec/opensandbox/relay.cjs` (no imports beyond Node built-ins; it is uploaded and run with `node` in the box)
- Create: `code/flowboard/packages/adapters/src/exec/opensandbox/frames.ts`
- Create: `code/flowboard/packages/adapters/src/exec/opensandbox/relay-host.ts`
- Test: `code/flowboard/packages/adapters/test/opensandbox-relay.test.ts`

**Interfaces:**
- Produces:
  - Frame codec, shared by protocol (`relay.cjs` keeps its own copy of the same 20 lines, since it cannot import TS): a frame is `[type: u8][length: u32 BE][payload]`. Types: `0` stdin (host→box), `1` stdout, `2` stderr, `3` exit (payload JSON `{"code":number|null,"signal":string|null}`), `4` kill (host→box, payload = signal name), `5` stdin end (host→box, empty).
  - `encodeFrame(type: number, payload: Buffer): Buffer` and `class FrameReader { push(chunk: Buffer): Array<{ type: number; payload: Buffer }> }` in `frames.ts`.
  - Relay HTTP API on its port: `GET /` → `200 relay`. Upgrade `/spawn?token=&spec=<base64 JSON {command,args,cwd,env}>` → the process, framed. Wrong token → `403` and no upgrade.
  - `relayExecHost(o: { connect: () => Promise<{ url: string; headers?: Record<string,string> }>; token: string; profile: SandboxProfile; tmpDir?: string; mapPath?: (p: string) => string; beforeSpawn?: () => Promise<void> }): ExecHost` in `relay-host.ts`. `id: 'container'`. `spawn()` returns a `ChildProcessWithoutNullStreams`-compatible `EventEmitter` with `stdin`/`stdout`/`stderr` streams, `pid` (a positive pseudo id), `exitCode`, `signalCode`, `kill(sig?)`. It emits `spawn`, `exit(code, signal)` and `close(code, signal)` in Node's order, and `error` when the connection fails.
  - `spawn` is synchronous (the port contract), so connection setup runs async behind it. Stdin written before the upgrade completes is buffered, and `beforeSpawn` (Task 4 uses it to upload tmp and plugin folders) is awaited before the upgrade request.

- [ ] **Step 1: Write the failing tests** in `opensandbox-relay.test.ts`, starting `relay.cjs` with `node` on a free port with a test token:
  - `frames round-trip across chunk boundaries`: encode three frames, feed `FrameReader` the bytes 1 at a time, and get the three back with equal payloads.
  - `stdin reaches the process and stdout comes back live`: spawn `cat -n`, then write `first\n`, and `stdout` yields `1\tfirst` (after trimming) before `second\n` is written.
  - `stderr and the exit code arrive separately`: `sh -c 'echo out; echo err >&2; exit 3'` gives stdout `out`, stderr `err`, then `exit` with `(3, null)` and `close` with `(3, null)`.
  - `kill() ends the remote process with its signal`: spawn `sleep 30`, `kill('SIGTERM')`, then `exit` with `(null, 'SIGTERM')` within 2 s, and no `sleep 30` is left in `ps`.
  - `two children at once keep their streams apart`: two `sh -c 'for i in 1 2 3; do echo A$i; sleep 0.1; done'` (A and B) at once; each one's stdout holds only its own letter.
  - `a wrong token is refused`: spawn with a bad token emits `error` whose message contains `403`.
  - `stdin end closes the process's stdin`: spawn `wc -l`, write `a\nb\n`, `stdin.end()`, and stdout is `2`.

- [ ] **Step 2: Run them to verify they fail**
  Run: `cd code/flowboard && node --test packages/adapters/test/opensandbox-relay.test.ts`
  Expected: FAIL, cannot find `relay-host.ts`.

- [ ] **Step 3: Implement `frames.ts`, `relay.cjs` and `relayExecHost`.** The relay is the spike's `relay.cjs` grown to the frame protocol plus the token check. It spawns with `stdio: 'pipe'`, kills on a kill frame, and sends the exit frame on `close`, then ends the socket. The client does the upgrade with `http.request` (the spike's `t2-stdin.mjs` shows the headers the gateway passes: `Connection: Upgrade`, `Upgrade: websocket`, a `Sec-WebSocket-Key`, `Sec-WebSocket-Version: 13`).

- [ ] **Step 4: Run the tests to verify they pass**
  Run: `cd code/flowboard && node --test packages/adapters/test/opensandbox-relay.test.ts && pnpm -s typecheck:packages`
  Expected: 7 pass, no type errors.

- [ ] **Step 5: Commit**
  `git commit -m "feat(adapters): a relay that gives processes in a sandbox live stdio over one upgrade"`

### Task 2: A reverse tunnel for `ask_user`

The box cannot reach the Mac, so the host opens connections and the relay hands each one to a shim that connects inside the box.

**Files:**
- Modify: `code/flowboard/packages/adapters/src/exec/opensandbox/relay.cjs`
- Modify: `code/flowboard/packages/adapters/src/exec/opensandbox/relay-host.ts`
- Test: `code/flowboard/packages/adapters/test/opensandbox-relay.test.ts`

**Interfaces:**
- Consumes: the relay and its token check from Task 1.
- Produces:
  - Relay: upgrade `/listen?token=&path=<socket path in the box>` → the relay listens on that Unix socket (created on first call, `mkdir -p` its folder), and pairs the next shim connection there with this upgraded socket, piping raw bytes both ways (no frames). One upgrade carries one shim connection.
  - `ExecHost.tunnel?(boxSocket: string, hostSocket: string): Promise<{ close(): void }>`: the new optional port member (added to `core/src/ports/exec-host.ts` in this task). It keeps one waiting `/listen` upgrade open at all times. When one gets paired, it pipes it to a fresh `net.createConnection(hostSocket)` and opens the next waiting upgrade.

- [ ] **Step 1: Write the failing tests**:
  - `a shim connection in the box reaches the host broker`: start a `startBroker(<host sock>, …)` from `packages/cli/src/ask/broker.ts` answering `{ a: 'yes' }`. Call `tunnel('<tmp>/box/ask.sock', '<host sock>')`. Then `askBroker('<tmp>/box/ask.sock', …)` from `@flowboard/ask-user` returns `{ answers: { a: 'yes' } }`. The relay runs on the host, so its socket path is a local path.
  - `three requests in a row each get their answer`: `askBroker` three times in sequence; three answers, in order.
  - `close() stops listening`: after `close()`, `askBroker` on the box socket rejects with `cannot reach the question broker`.

- [ ] **Step 2: Run to verify they fail**, using the Task 1 command. Expected: FAIL, `tunnel` is not a function.
- [ ] **Step 3: Implement `/listen` in the relay and `tunnel` in `relayExecHost`.**
- [ ] **Step 4: Run to verify they pass**, using the Task 1 command plus `pnpm -s test:packages`. Expected: all pass.
- [ ] **Step 5: Commit**
  `git commit -m "feat(adapters): ask_user reaches run-flow from a sandbox through a reverse tunnel"`

### Task 3: Providers that do not assume the box shares their disk

The OpenCode provider checks a marker file with `existsSync`, loads its guard plugin from a host path, and connects to the server's printed URL. `withAsking` points the shim at a host path. With OpenSandbox, all three are wrong, so the port gains small optional hooks.

**Files:**
- Modify: `code/flowboard/packages/core/src/ports/exec-host.ts`
- Modify: `code/flowboard/packages/adapters/src/agent/opencode/provider.ts`, `.../opencode/server.ts`, `.../opencode/options.ts` (guard plugin path)
- Modify: `code/flowboard/packages/cli/src/run.ts` (`withAsking`)
- Test: `code/flowboard/packages/adapters/test/opencode-provider.test.ts`, `code/flowboard/packages/cli/test/run.test.ts`

**Interfaces:**
- Produces, on `ExecHost`, all optional, with absent meaning today's behaviour:
  - `mapPath?(hostPath: string): string`: where a file of FlowBoard's own code is inside the box. The OpenSandbox host maps `<FLOWBOARD_ROOT>/x` to `/opt/flowboard/x`; any other path is returned unchanged.
  - `exists?(path: string): Promise<boolean>`: is the file there in the box.
  - `endpoint?(port: number): Promise<{ url: string; headers?: Record<string, string> }>`: how this machine reaches a port the process listens on.
- `withAsking(config, socket, tmp, env, node = process.execPath, shimEntry = SHIM_ENTRY)`: one more trailing parameter.
- OpenCode: guard plugin URL from `exec.mapPath?.(GUARD_PLUGIN) ?? GUARD_PLUGIN`. Marker check is `await (spec.exec?.exists?.(marker) ?? Promise.resolve(existsSync(marker)))`. When `exec.endpoint` exists, the server listens on `0.0.0.0` and a random port in `20000–59999` (one box serves parallel steps, so a fixed port collides), and the client's `baseUrl` and headers come from `endpoint(port)`.

- [ ] **Step 1: Write the failing tests** with a fake `ExecHost` that records calls and spawns a stub server (the existing `opencode-provider.test.ts` already fakes `opencode serve`; reuse its stub):
  - `opencode connects through exec.endpoint when the host offers one`: the client's requests arrive at the URL that `endpoint()` returned, with its headers.
  - `opencode checks the guard marker through exec.exists`: `exists` is called with `<configHome>/flowboard-guard.loaded`, and returning `false` fails the run with `guard plugin not loaded`.
  - `the guard plugin path goes through exec.mapPath`: the config written for the server lists `file://` + the mapped path.
  - In `run.test.ts`, `withAsking puts the given node and shim entry in the tool`: `tools.at(-1)` has `command: 'node'` and `args: ['/opt/flowboard/packages/ask-user/src/main.ts']`.
- [ ] **Step 2: Run to verify they fail**: `node --test packages/adapters/test/opencode-provider.test.ts packages/cli/test/run.test.ts`
- [ ] **Step 3: Implement the port members and the provider and `withAsking` changes.**
- [ ] **Step 4: Run to verify they pass**, plus `pnpm -s test:packages` (the docker tier's tests must be unchanged).
- [ ] **Step 5: Commit**
  `git commit -m "feat: providers reach files, plugins and servers through ExecHost when the box does not share the disk"`

### Task 4: The box: create, fill, mirror, patch, kill

**Files:**
- Create: `code/flowboard/packages/adapters/src/exec/opensandbox/box.ts`
- Modify: `code/flowboard/packages/adapters/src/index.ts` (export `openBox`, `connectBox`, type `Box`)
- Modify: `code/flowboard/packages/adapters/package.json` (`"@alibaba-group/opensandbox": "1.1.1"`)
- Test: `code/flowboard/packages/adapters/test/opensandbox-box.test.ts` (live, `FLOWBOARD_OPENSANDBOX=1`)

**Interfaces:**
- Consumes: `relayExecHost` (Task 1), `tunnel` (Task 2), the port hooks (Task 3).
- Produces:
  ```ts
  interface BoxOptions { image: string; folder: string; egress: string[]; credentials: string[]; timeoutSeconds: number }
  interface Box {
    id: string;
    /** An ExecHost for one step: online/tmpDir/mounts as ExecContext['sandbox'] passes them; mounts are uploaded once per spawn. */
    exec(o: { tmpDir?: string; mounts?: string[] }): ExecHost;
    /** Copies a host folder into the box at the same path, replacing what is there. */
    pushDir(dir: string): Promise<void>;
    /** Copies a box folder back to the host at the same path: new and changed files only, files only. */
    pullDir(dir: string): Promise<void>;
    /** `git diff --binary` of the folder against the base commit. */
    patch(): Promise<string>;
    kill(): Promise<void>;
  }
  function openBox(o: BoxOptions): Promise<Box>;
  function connectBox(id: string, o: Pick<BoxOptions, 'folder'>): Promise<Box>; // for --resume; throws `sandbox <id> is gone` if it is
  ```
- `openBox`: `Sandbox.create` with the image, `networkPolicy` (deny + `egress` allow rules), `credentialProxy: { enabled: true }`, env with the fake values (`FAKE_VALUES`, one per credential name, right shape: `sk-ant-oat01-` + 86 zeros for Claude; `sk-or-v1-` + 64 zeros for OpenRouter), `HOME=/tmp`, and `timeoutSeconds`. Then:
  - create the vault from `process.env[name]` for each credential. A name with no value is skipped, with a warning returned for the caller to print;
  - upload `git -C folder archive --format=tar.gz HEAD`, untar at `folder`, and make the base commit;
  - upload `relay.cjs`, start it on port 7000 in the background, with a per-box random token;
  - wait until `GET /` through the endpoint answers `relay`.
- `pullDir` lists with `files.listDirectory` recursively and writes with `writeFileSync` (`mkdirSync` recursive). `pushDir` uses a `tar.gz` of the dir (`tar -cz --no-xattrs` with `COPYFILE_DISABLE=1`), uploaded and untarred.

- [ ] **Step 1: Write the failing live tests**, run against a server you start yourself (the spike's `spike/opensandbox/sandbox.toml` with `mode = "dns+nft"`):
  - `a box holds the folder's last commit, not its uncommitted edits`: a temp repo with a committed `a.txt` and an uncommitted `b.txt`; in the box, `a.txt` exists and `b.txt` does not.
  - `a step's exec runs in the folder as uid 1000 and cannot reach the Mac`: `sh -c 'pwd; id -u; node -e "fetch(\"http://host.docker.internal\").catch(()=>console.log(\"blocked\"))"'` → `<folder>`, `1000`, `blocked`.
  - `the real key stays outside`: `echo $CLAUDE_CODE_OAUTH_TOKEN | cut -c1-16` in the box prints `sk-ant-oat01-000`.
  - `pushDir and pullDir mirror the artifacts folder`: push a dir with `plan.md`; a step writes `notes.md` there; `pullDir` brings `notes.md` to the host with its content.
  - `patch keeps a deleted file and a binary file`: in the box, delete `a.txt` and write 3 random bytes to `bin.dat`. `git apply --check` of `patch()` on a fresh host clone succeeds, and applying it deletes `a.txt` and recreates `bin.dat` byte for byte.
  - `a step whose box was killed ends with an error`: `kill()` while `sleep 30` runs; the child emits `exit` or `error` within 10 s, and the message names the box id.
  - `connectBox finds a live box and refuses a gone one`: `connectBox(box.id)` runs `true` fine. After `kill()`, `connectBox(id)` rejects with `sandbox <id> is gone`.
- [ ] **Step 2: Run to verify they fail**: `FLOWBOARD_OPENSANDBOX=1 OPENSANDBOX_DOMAIN=127.0.0.1:8091 OPENSANDBOX_API_KEY=… node --test packages/adapters/test/opensandbox-box.test.ts`. Without `FLOWBOARD_OPENSANDBOX` the file must report all tests skipped.
- [ ] **Step 3: Implement `box.ts`.**
- [ ] **Step 4: Run to verify they pass**, and `pnpm -s test:packages` (skipped there).
- [ ] **Step 5: Commit**
  `git commit -m "feat(adapters): an OpenSandbox box holding the repo, with egress rules, the credential vault and a patch out"`

### Task 5: The flow YAML

**Files:**
- Modify: `code/flowboard/packages/cli/src/flow-config.ts`
- Test: `code/flowboard/packages/cli/test/flow-config.test.ts`

**Interfaces:**
- Produces: `Sandbox` becomes a union:
  ```ts
  type Sandbox =
    | { runtime: 'docker'; image: string; env: string[] }
    | { runtime: 'opensandbox'; image: string; egress: string[]; credentials: string[] };
  ```
  YAML: `sandbox: { runtime?: docker | opensandbox, image, env?, egress?, credentials? }`; `runtime` defaults to `docker`.
  - For `opensandbox`: `egress` defaults to the hosts the steps' adapters need (`api.anthropic.com` for claude-code; `openrouter.ai` for an opencode model starting `openrouter/`), and an explicit list replaces the defaults. `credentials` defaults to the built-in names those adapters use.
  - `env` on `opensandbox`, or `egress`/`credentials` on `docker`, is an error `sandbox.<key>: only for runtime <other>`.
  - `egress` entries must match `/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/` (`sandbox.egress.<i>: a host name or *.domain; IP addresses are not supported`).
  - Warning for opensandbox, replacing docker's "open network" one: `sandbox: agents' edits stay in the sandbox; the run ends with changes.patch to review`.

- [ ] **Step 1: Write the failing tests**:
  - `runtime defaults to docker`: the existing sandbox test's config equals `{ runtime: 'docker', image, env }`.
  - `opensandbox derives egress and credentials from the steps' adapters`: DELIVERY with `sandbox: { runtime: opensandbox, image: flowboard-cli }` gives `egress: ['api.anthropic.com', 'openrouter.ai']` and `credentials: ['CLAUDE_CODE_OAUTH_TOKEN', 'OPENROUTER_API_KEY']`.
  - `an explicit egress list replaces the defaults`.
  - `keys of the other runtime are errors`, and `an IP in egress is an error`, with the exact messages above.
- [ ] **Step 2: Run to verify they fail**: `node --test packages/cli/test/flow-config.test.ts`
- [ ] **Step 3: Implement.** `flow-run.ts`'s `sandboxFor` narrows on `runtime === 'docker'` so the docker path compiles unchanged.
- [ ] **Step 4: Run to verify they pass**, plus `pnpm -s typecheck:packages`.
- [ ] **Step 5: Commit**
  `git commit -m "feat(cli): sandbox.runtime: opensandbox, with egress and credentials from the steps' adapters"`

### Task 6: run-flow drives a flow in the box

**Files:**
- Modify: `code/flowboard/packages/cli/src/flow-run.ts`
- Modify: `code/flowboard/packages/cli/src/flow-exec.ts` (ask socket choice)
- Test: `code/flowboard/packages/cli/test/flow-run.test.ts` (with a fake `Box`), `code/flowboard/packages/cli/test/flow-opensandbox-live.test.ts` (live)

**Interfaces:**
- Consumes: `openBox`/`connectBox`/`Box` (Task 4), `Sandbox` (Task 5), `ExecHost.tunnel` (Task 2).
- Produces:
  - `RunDeps.openBox?` and `RunDeps.connectBox?`: injectable for tests, defaulting to the adapters' functions.
  - `<run folder>/sandbox.json` = `{ "id": "<box id>" }`, written right after `openBox`.
  - **Run start** (after the clean-tree check): `openBox({ image, folder, egress, credentials, timeoutSeconds: 86400 })`. Print `-- sandbox <id>: <folder> at its last commit; egress <hosts>`. Print each skipped credential as `-- warning: sandbox: <NAME> is not set; steps that need it will fail`.
  - **`ctx.sandbox`** = `({ tmpDir, mounts }) => box.exec({ tmpDir, mounts })`.
  - **Around each step's launch:** `await box.pushDir(artifactsDir)` before. After its `ended`, `await box.pullDir(artifactsDir)` and `pullDir(logDir)` for the outcome file, before the end is fed to the engine (`set_outcome` and the produced artifacts must be on the host when the engine reads them).
  - **`execAi`, ask choice:** when the exec host has `tunnel`, the shim gets a box socket `<tmp>/ask.sock` and `exec.tunnel(<tmp>/ask.sock, <host broker socket>)`. Otherwise today's two branches (Unix socket on the host, or TCP and token for docker). The shim entry and node come from `exec.mapPath` and `'node'`.
  - **Run end:** status `done` or `failed`: write `await box.patch()` to `<run folder>/changes.patch` and print `-- changes: <shown>/changes.patch (<n> files); review it, then: git -C <folder> apply <path>`. Then `box.kill()`. Status `paused` or `stopped`: leave the box running and print `-- sandbox <id> kept for --resume`.
  - **`--resume`:** a run folder with `sandbox.json` uses `connectBox(id)`. A gone box refuses: `-- sandbox <id> is gone: its edits cannot be resumed; start the flow again` (exit 2).

- [ ] **Step 1: Write the failing tests** in `flow-run.test.ts` with a fake `Box` (an in-memory record of calls, whose `exec` is `hostExecHost` running in a temp copy of the folder):
  - `an opensandbox flow opens one box, mirrors artifacts around each step and ends with changes.patch`: two shell steps; the call order is `open, push, pull, push, pull, patch, kill`, and `changes.patch` holds the fake patch.
  - `a paused flow keeps its box and --resume reconnects to it`: a gate pauses the flow; `kill` is not called, and `sandbox.json` holds the id. `--resume` calls `connectBox` with it.
  - `--resume refuses when the box is gone`: `connectBox` throws `sandbox x is gone`; exit 2 with the line above.
  - `a missing credential is a warning, not an error`.
- [ ] **Step 2: Run to verify they fail**: `node --test packages/cli/test/flow-run.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**, plus `pnpm -s test:packages`.
- [ ] **Step 5: Write the live test** `flow-opensandbox-live.test.ts` (`FLOWBOARD_OPENSANDBOX=1` and `FLOWBOARD_LIVE=1`): the spike's live flow (a claude haiku step writing `claude.txt`, an opencode deepseek step writing `oc.txt`, a check `cat claude.txt oc.txt`) with `runtime: opensandbox`. Assert:
  - the flow ends `done`;
  - neither file exists in the host folder afterwards;
  - `changes.patch` adds both;
  - `git apply --check` of it succeeds on the host folder.
- [ ] **Step 6: Run it** against a live server with the real token and OpenRouter key exported. Expected: PASS, about $0.01.
- [ ] **Step 7: Commit**
  `git commit -m "feat(cli): run-flow runs a flow in one OpenSandbox box and hands back changes.patch"`

### Task 7: Docs

**Files:**
- Modify: `code/flowboard/docker/README.md`. Add a section 3, *OpenSandbox*: the server config (the four settings from Global Constraints), `OPENSANDBOX_DOMAIN` and `OPENSANDBOX_API_KEY`, the YAML, what stays on the host, how to apply `changes.patch`, and pre-pulling `opensandbox/execd:v1.1.0` and `opensandbox/egress:v1.1.7`.
- Modify: `docs/FlowBoard/Sandboxing/Sandboxing Roadmap.md`: mark the egress allowlist and credential injection as delivered through OpenSandbox, linking `[[OpenSandbox Spike]]`.

- [ ] **Step 1: Write both.**
- [ ] **Step 2: Commit**
  `git commit -m "docs: running flows in OpenSandbox"`
