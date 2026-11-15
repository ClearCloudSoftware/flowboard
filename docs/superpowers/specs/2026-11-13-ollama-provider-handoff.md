# Ollama as a model source for OpenCode: handoff

Written 2026-11-13 for the session that builds it. **Verify first (Part 1), build only if every check passes (Part 2).** If a check fails, stop and report to Alex. Don't work around a failure on your own.

## What is wanted

Let an OpenCode step in FlowBoard run on a model served by **Ollama on this machine**, governed by the same approval rules the OpenRouter models already follow. Alex decided:

| Question | Decision |
|---|---|
| Context window too small for an agent | **Warn only**, never refuse |
| Ollama cloud models (run on ollama.com) | **Excluded for now. Local models only** |
| Sandboxed runs (Docker, OpenSandbox) | **Must work in the first version** |
| Where Ollama runs | **Only on this machine**, never another host |

Out of scope: direct LLM calls from FlowBoard (no `complete()` service), Ollama on another machine, Ollama cloud models, per-project model lists.

## Read these first

- `docs/FlowBoard/Agent Providers/OpenRouter Models And Key.md`: the approved-models feature this extends. It covers the rules, the pages, where the check is enforced, the routes and the limits.
- `docs/FlowBoard/Agent Providers/OpenCode Adapter.md`: how a run's OpenCode server is isolated.
- `docs/FlowBoard/Sandboxing/OpenSandbox Runtime.md` and `docs/FlowBoard/Sandboxing/Sandboxing Testing.md`: the two sandbox runtimes and how to run them.
- Code:
  - `code/flowboard/packages/cli/src/openrouter.ts`: the key, the model list, `modelRules`, `prepareRun`.
  - `packages/cli/src/settings.ts`: `ApprovedModel`, `APPROVED_MODELS_SCHEMA` (ids must start with `openrouter/`), `modelProblem`, `isFree`, `FREE_WARNING`.
  - `packages/cli/src/config.ts`: the check in `configFromObject`.
  - `packages/adapters/src/agent/opencode/options.ts`: `buildLaunch`; native packs are merged into OpenCode's config at line ~57.
  - `packages/adapters/src/exec/docker.ts` and `packages/adapters/src/exec/opensandbox/box.ts`: the two sandboxes.
  - `packages/cli/src/flow-config.ts`: computes the sandbox egress and credentials (`NEEDS`, ~line 69 and ~260).
  - `packages/cli/src/flow-exec.ts:362`: the "no price for <model>" line.
  - Pages: `app/settings/openrouter.tsx` (models page, `OpencodeModelSelect`), `app/flows/inspector.tsx` (`OpencodeModel`), `app/settings/nav.tsx`.

## What is already known (checked 2026-11-13 on this machine)

- Ollama **0.40.16** answers on `http://127.0.0.1:11434`. `OLLAMA_HOST` is not set, so it listens on loopback only. OpenCode is **1.19.3**.
- Pulled models:
  - `gemma4:26b-64k`: tools; real window 65,536 tokens (its `num_ctx`).
  - `qwen3-coder:30b`: tools; no `num_ctx` set, so it runs on Ollama's default window.
  - `nomic-embed-text`: embedding only.
- **`/api/tags` already reports `capabilities`** (for example `["completion","tools",…]`) and `details.context_length`. That number is the model's **maximum** (262,144), not the window actually used. The window actually used is the `num_ctx` line in `/api/show`'s `parameters`. Without one, it is the server's `OLLAMA_CONTEXT_LENGTH`, or else Ollama's default.
- **FlowBoard's OpenCode runs cannot use Ollama today.** Each run gets a fresh `XDG_CONFIG_HOME`, so Alex's `~/.config/opencode/opencode.json`, which has an `ollama` provider block, is never read. Run with an empty config folder, `opencode models ollama` prints `Provider not found: ollama`.
- **Injecting the provider works for listing.** With `OPENCODE_CONFIG_CONTENT='{"provider":{"ollama":{"npm":"@ai-sdk/openai-compatible","name":"Ollama","options":{"baseURL":"http://127.0.0.1:11434/v1"},"models":{"gemma4:26b-64k":{"name":"gemma4 26b 64k","limit":{"context":65536,"output":8192}}}}}}'` and an empty `XDG_CONFIG_HOME`, `opencode models ollama` prints `ollama/gemma4:26b-64k`. A real run was **not** tried.
- The adapter merges every `native` capability pack (`{ mount: { kind: 'native', config } }`) into OpenCode's config first, then sets its own keys over it. It never sets `provider`, so a native pack can carry the `provider.ollama` block **without any adapter change**.
- The Docker sandbox runs `docker run` with the default bridge network for AI steps; only shell steps get `--network none`. Docker images `flowboard-sandbox:latest` and `flowboard-cli:latest` exist. OpenSandbox's server config is in `~/.config/flowboard/opensandbox/sandbox.toml`.

## Ground rules for the session

- Ollama runs are **local and free**, so live runs on Ollama are fine. **Never run anything on OpenRouter or Claude that costs money.** The live test suites (`pnpm test:live`) do; don't run them.
- Don't edit `~/.config/opencode`, and don't touch Alex's real data folder (`code/flowboard/data/` in the main checkout). Use a scratch `FLOWBOARD_DATA_DIR`.
- Don't pull, delete or change Ollama models, and don't change `OLLAMA_*` settings, without asking Alex.
- Other Claude sessions may be live. Run `ListAgents` before reusing any worktree.
- Put throwaway spike scripts in your scratchpad, not in the repo.

---

## Part 1: verify before building

Each check names what proves it passed. Write down the results; they go into the final report and the docs.

### V1. Ollama itself

1. `curl -s http://127.0.0.1:11434/api/version` answers.
2. `curl -s http://127.0.0.1:11434/api/tags` lists the models with `capabilities`.
3. `curl -s http://127.0.0.1:11434/api/show -d '{"model":"<name>"}'` shows `num_ctx` for `gemma4:26b-64k` and none for `qwen3-coder:30b`.
4. **Cloud models:** find out from Ollama's API docs how `/api/tags` marks a cloud model. Possibilities include a `remote_host` / `remote_model` field, or a `:cloud` / `-cloud` name. Write down the rule that excludes them. Don't sign in or pull a cloud model to find out.

**Passes when** all four are answered and the cloud-model rule is written down.

### V2. OpenCode alone, on the host

In a fresh temp folder, with an empty `XDG_CONFIG_HOME`, `OPENCODE_DISABLE_PROJECT_CONFIG=1`, and the provider block above in `OPENCODE_CONFIG_CONTENT`:

1. Run `opencode run -m ollama/gemma4:26b-64k "Create a file hello.txt containing the word ok, then stop."`, or the equivalent for 1.19.3 (check `opencode run --help`).
2. Check that `hello.txt` exists with `ok`, which proves the model made a real tool call.
3. Find out whether OpenCode **downloaded `@ai-sdk/openai-compatible`** on first use, and where to: look under `XDG_CACHE_HOME`/`~/.cache/opencode` before and after. If it downloads it, find out whether a run with no internet still works once the package is cached. This matters for sandboxes.
4. Check that `limit.context` is accepted, with no error or warning.
5. Note the **prompt tokens of that minimal run**, from OpenCode's output or `--print-logs`. That is OpenCode's own overhead, and it sets the warning threshold in Part 2.
6. Repeat step 1 once with `qwen3-coder:30b`, which runs on the default window. Note whether it completes the task, or shows signs of a truncated prompt (ignores the instruction, loops, garbles).

**Passes when** step 2 works with `gemma4:26b-64k`. Record the qwen result whatever it is.

### V3. Through FlowBoard's adapter, on the host

The approval check refuses `ollama/` ids today, so test below it. Write a scratch script that builds an `OpencodeProvider` from `@flowboard/adapters` and launches a `RunSpec` with:
- `model: 'ollama/gemma4:26b-64k'`,
- `capabilities: [{ id: 'ollama', provider: 'opencode', mount: { kind: 'native', config: { provider: { ollama: …the block… } } } }]`,
- a temp `cwd`, `guards: { writeRoots: [cwd] }`, and `permissionMode: 'acceptEdits'`.

Use a prompt that writes a file. The test `packages/adapters/test/opencode-live.test.ts` shows how a spec is built.

**Passes when** the run ends with `exitCode` 0, the file is written, `NormalizedEvent`s stream, and `RunResult.usage` has tokens with `costUsd` 0.

### V4. In the Docker sandbox

Same as V3, but with `spec.exec` from `dockerExecHost` (see `packages/cli/src/flow-run.ts` `sandboxFor` for the profile an AI step gets; image `flowboard-sandbox:latest`), and `baseURL` set to **`http://host.docker.internal:11434/v1`**.

1. First, from a throwaway container: `docker run --rm flowboard-sandbox:latest sh -c 'curl -s http://host.docker.internal:11434/api/version'`, or `wget` if the image lacks curl. With Ollama on loopback only, this works only if Docker Desktop forwards `host.docker.internal` to the host's loopback.
2. Then the full run. Watch for the provider-package download from V2.3: the box has network for AI steps, but check where OpenCode caches inside it.

**Passes when** the run writes its file. **If step 1 fails, stop and report.** Making it work would mean binding Ollama beyond loopback (`OLLAMA_HOST`), which contradicts "only this machine" and is Alex's call.

### V5. In OpenSandbox

Same again with the OpenSandbox runtime (`openBox` in `packages/adapters/src/exec/opensandbox/box.ts`; the server config is in `~/.config/flowboard/opensandbox/`). The box lets out only its `egress` host names; IP addresses are not supported.

1. Open a box with `egress: ['host.docker.internal']` and check that it reaches `http://host.docker.internal:11434/api/version` from inside. Find out whether the egress filter allows a port other than 443.
2. Then the full run, with the provider block, as in V4.

**Passes when** the run writes its file. If the egress filter can't allow it, stop and report what it would take.

### V6. Report

Write the results of V1–V6 into the spec's "Verification results" section below, commit them on the branch, and tell Alex. If everything passed, go on to Part 2. If anything failed, stop at the report.

---

## Part 2: build (only after Part 1 passes)

Branch `feature/ollama-models`, in its own worktree off `dev` (`.claude/worktrees/ollama-models`). Ask Alex before merging.

### The design

**Same rules, second model source.** Approving, the dropdowns, the run check and where it is enforced all stay as built. OpenRouter-only parts become per-source:

| Piece | Ollama |
|---|---|
| Ids | `ollama/<name>` exactly as `/api/tags` names it, tag included: `ollama/gemma4:26b-64k` |
| Address | Not a setting. Read `OLLAMA_HOST` the way the `ollama` CLI does, default `127.0.0.1:11434`. **Refuse a host that isn't loopback** (`127.0.0.1`, `localhost`, `::1`): local only |
| Model list | `/api/tags`, plus `/api/show` for each model to read `num_ctx`. Keep only models that support **tools**, and leave out **cloud** models (rule from V1.4). Store `{ id, name, local: true, tools, context: <the window actually used>, maxContext, size }`. Fetch it when a page opens and at run start; it's local, so no hourly cache is needed, but keep the last list for the designer's synchronous check, as with OpenRouter |
| Approving | Same `opencodeModels` list. Widen `APPROVED_MODELS_SCHEMA` to `openrouter/…` or `ollama/…`. An Ollama entry has `free: true`, `price: { in: 0, out: 0 }`, and a new `local: true`. Keep `ApprovedModel` backward compatible: an existing entry with no `local` is not local |
| Run check (`modelProblem`) | Not approved → refused, as now. **No longer pulled** (Ollama answered and the model isn't listed) → refused: `<id> is no longer in Ollama; pick another model`. **Ollama not answering** at run start → refused before anything launches: `Ollama does not answer on <address>; start it, then run again`. The designer's check doesn't fetch, so it doesn't refuse for "not answering" |
| Privacy warning | **None** for a local model. Change the free-model warning to apply to free models that aren't local |
| **Context warning** (warn only) | When the window actually used is below a threshold, warn on the Models page row, under the dropdowns, and in the flow check: `<id> runs with a <n>-token window, which an agent can outgrow; set num_ctx on the model, or OLLAMA_CONTEXT_LENGTH`. Threshold: OpenCode's overhead from V2.5 plus room for work; **32,768 unless V2 says otherwise** (say which in the report) |
| Reaching OpenCode | A `native` capability pack with `{ provider: { ollama: { npm: '@ai-sdk/openai-compatible', name: 'Ollama', options: { baseURL }, models: { [name]: { name, limit: { context: <window>, output: … } } } } } }`, naming **only the step's model**. Add it where the spec is finished for launch, so the CLI owns it and the adapter doesn't change |
| `baseURL` per runtime | Host: `http://127.0.0.1:11434/v1` (or from `OLLAMA_HOST`). Docker and OpenSandbox: `http://host.docker.internal:11434/v1`. The runtime is known where `spec.exec` is set; that is where to choose. Recommended: give `ExecHost`, or the sandbox profile, the name a box reaches the host by, so this isn't a string test on runtime names |
| OpenSandbox egress | `flow-config.ts` adds `host.docker.internal` (and whatever V5 found it needs) to `egress` for an `ollama/` step, as it adds `openrouter.ai` for an OpenRouter one. No credential |
| Cost | Really $0. In `flow-exec.ts:362`, don't print "no price for <model>… budget cannot stop it" for a local model. Print once per step instead: `-- <step>: <model> runs locally at $0, so only limits.max_turns or a timeout stops it`. The existing "no limits.max_turns …" flow warning stays |
| Pages | **Connections → Ollama** (`/settings/connections/ollama`): address, answering or not, version, how many models, and a note that only local, tool-capable models are listed. **Agents → OpenCode models**: group or tab rows by source (OpenRouter, Ollama); Ollama rows show size and the window actually used (context warning icon), and need no price columns. Dropdowns (`OpencodeModel` in the designer, `OpencodeModelSelect` in settings) mark local models `· local` instead of `· free` |
| Abstraction | With two sources, `openrouter.ts` becomes a small model-source shape, for example `models/` with `openrouter.ts` and `ollama.ts`, each giving `{ prefix, list(), local, opencodeConfig(model, hostName) }`, and `modelRules` built from both. Keep it this small; no registry or plugin system |

### Tests (no network, no Ollama needed)

Following `packages/cli/test/openrouter.test.ts`:
- Turning `/api/tags` and `/api/show` into a list, with an injected `fetch`: tools-only, cloud models left out, the window actually used taken from `num_ctx`.
- The `OLLAMA_HOST` reading, and refusing a non-loopback host.
- `modelProblem` for `ollama/` ids: not approved, no longer pulled, Ollama not answering.
- The context warning appears below the threshold and not above it.
- The native pack's `baseURL` for host and for a sandbox.
- A flow with an `ollama/` step under OpenSandbox gets `host.docker.internal` in `egress`.
- The `$0` message replaces "no price".
- An existing `opencodeModels` entry with no `local` still reads.

Add one **live** test, opt-in like the others (`FLOWBOARD_LIVE=1`), that skips when Ollama doesn't answer: a run on the first approved, tool-capable local model writes a file. Ask Alex before adding it to `test:live`.

Then run the app on a spare port with a scratch `FLOWBOARD_DATA_DIR`. Check both pages and the designer dropdown in a headless browser; the previous session drove Chrome over CDP for this. Run one real flow on `ollama/gemma4:26b-64k`: once on the host, once in each sandbox runtime.

### Docs

- Widen `docs/FlowBoard/Agent Providers/OpenRouter Models And Key.md` to cover both sources. Rename it if it no longer fits, and fix the 10 links to it.
- Update `Running Agent Work.md` (the `/docs` page): how to approve an Ollama model, the context warning, and that only local models are offered.
- Update the Settings Catalogue, the Roadmap row, OpenCode Adapter, and Providers And Sandboxing (how a box reaches Ollama).

## Verification results

Run 2026-11-13 on branch `feature/ollama-models` (worktree `.claude/worktrees/ollama-models`, off `dev` at `af73a0b`). Ollama 0.40.16, OpenCode 1.19.3, Docker Desktop 4.91.0, `opensandbox-server` with execd v1.1.0 and egress v1.1.7. Every run was local and cost $0. Nothing ran on OpenRouter or Claude, no Ollama model or setting changed, and `~/.config/opencode` was not touched. **All six checks passed.**

### V1. Ollama itself: passed

1. `/api/version` → `{"version":"0.40.16"}`.
2. `/api/tags` lists `gemma4:26b-64k` (`completion, vision, tools, thinking`), `qwen3-coder:30b` (`completion, tools`) and `nomic-embed-text:latest` (`embedding`). Each entry has `capabilities` and `details.context_length` (262,144 for both chat models, which is their maximum).
3. In `/api/show`, `parameters` has `num_ctx 65536` for `gemma4:26b-64k` and no `num_ctx` for `qwen3-coder:30b`.
4. **Cloud-model rule.** Ollama's API reference for `/api/tags` ([docs.ollama.com/api/tags](https://docs.ollama.com/api/tags.md)) defines `remote_model` ("Name of the upstream model, if the model is remote") and `remote_host` ("URL of the upstream Ollama host, if the model is remote"). On a local server, cloud models use a `:cloud` name, such as `gemma4:cloud` ([docs.ollama.com/cloud/models](https://docs.ollama.com/cloud/models.md)). Older catalogue names use a `-cloud` tag suffix, such as `gpt-oss:120b-cloud`. **Rule: leave a model out if `remote_host` or `remote_model` is set, or if its tag is `cloud` or ends in `-cloud`.** The field test is the documented signal, and the name test is a backstop. No cloud model is pulled here, so the rule was not seen live.

**Finding that changes Part 2: a model with no `num_ctx` does not run on a small default window here.** `/api/ps` (loaded models) reports `context_length`. While loaded, `qwen3-coder:30b` showed **262,144**, its full maximum, and `gemma4:26b-64k` showed 65,536. This Mac has 128 GB of unified memory. Ollama's default window depends on available memory, which the API doesn't report, so "the window actually used" can't be read from `/api/show` alone when `num_ctx` is missing. It is known only from `/api/ps` while the model is loaded, or from `OLLAMA_CONTEXT_LENGTH` if set (it isn't here). See the open question at the end.

### V2. OpenCode alone, on the host: passed

Fresh `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` and `XDG_STATE_HOME`; `OPENCODE_DISABLE_PROJECT_CONFIG=1`; the provider block in `OPENCODE_CONFIG_CONTENT` (plus `permission: {edit: allow, bash: allow}` so `opencode run` doesn't prompt). `opencode run -m ollama/<model> --format json "<prompt>"` is the 1.19.3 form.

1. With `gemma4:26b-64k` it finished in about 12 s.
2. `hello.txt` holds `ok` (no newline), written by a real `write` tool call, then the model replied in text.
3. **No package download.** Afterwards the fresh cache held only `opencode/models.json` and an empty `opencode/bin`, with no `node_modules` and no `@ai-sdk/openai-compatible`. OpenCode 1.19.3 ships that provider built in. V5 also showed that a run with no internet beyond Ollama works, because `models.dev` was blocked there.
4. `limit.context` / `limit.output` were accepted with no warning or error in `--print-logs`.
5. **OpenCode's overhead: 6,816 prompt tokens** for the minimal run on gemma4 (7,123 on qwen3-coder, a different tokenizer). Through FlowBoard's adapter it was 6,829–6,845, because the guard plugin and the permission rules add a little. **The 32,768 threshold stands.** It leaves about 25k tokens for work after the overhead.
6. `qwen3-coder:30b` completed the task cleanly in about 33 s, wrote `ok` and replied, with no sign of truncation. That is expected given the 262,144 window it actually gets here (see V1).

Side note: the first V2 attempt hung for 10 minutes after `init` and never contacted Ollama. The cause appears to be `opencode run` waiting on an open, non-TTY stdin. Re-runs with stdin closed, including one with a brand-new data folder, never hung. FlowBoard uses `opencode serve`, not `opencode run`, so this doesn't affect it.

### V3. Through FlowBoard's adapter, on the host: passed

The scratch script built `new OpencodeProvider({ models: {} })` and launched `model: 'ollama/gemma4:26b-64k'`. The provider block went in as `capabilities: [{ id: 'ollama', provider: 'opencode', mount: { kind: 'native', config: { provider: { ollama: … } } } }]`, with a temp `cwd`, `guards: { writeRoots: [cwd] }`, `permissionMode: 'acceptEdits'` and `limits: { maxTurns: 6 }`. **The adapter was not changed.**

- Events streamed: `system 1, tool_use 1 (write), tool_result 1, usage 2, assistant_text 1, result 1`.
- `RunResult`: `{ usage: { input: 6829, output: 28, cacheRead: 6790, numTurns: 2, costUsd: 0 }, exitCode: 0 }`, with no `error`.
- `hello.txt` = `ok`. The guard plugin loaded; otherwise the run would have failed with `guard plugin not loaded`. About 13 s.

### V4. In the Docker sandbox: passed

1. `flowboard-sandbox:latest` has neither curl nor wget, so the check used Node: `docker run --rm --entrypoint node flowboard-sandbox:latest -e 'fetch("http://host.docker.internal:11434/api/version")…'` → `{"version":"0.40.16"}`. **Docker Desktop forwards `host.docker.internal` to the host's loopback,** so Ollama can stay on `127.0.0.1` and `OLLAMA_HOST` doesn't need to change.
2. Full run as V3, but with `exec: dockerExecHost({ tier: 'container', image: 'flowboard-sandbox:latest', egressAllow: ['*'], mounts: [FlowBoard root, read-only] }, { tmpDir })` (the AI-step profile from `sandboxFor` / `flow-exec.ts:322`) and `baseURL: http://host.docker.internal:11434/v1`. Result: `exitCode 0`, `costUsd 0`, input 6,845, `hello.txt` = `ok`, about 44 s including container start.
3. Cache inside the box: `HOME=/tmp` is a fresh tmpfs every run. That doesn't matter, because nothing is downloaded (V2.3).

### V5. In OpenSandbox: passed

The server was started from `~/.config/flowboard/opensandbox/sandbox.toml`, which listens on **port 8091** (the README's example says 8080), so `OPENSANDBOX_DOMAIN=127.0.0.1:8091`. It was stopped afterwards.

1. A box opened with `egress: ['host.docker.internal']` reached `http://host.docker.internal:11434/api/version` → `{"version":"0.40.16"}`. In the same box, `https://example.com` and `https://models.dev` failed with `ENOTFOUND`. **The egress filter (dns+nft) allows an allowed host on port 11434,** not only 443, and a host name is enough; no IP address is needed.
2. Full run with `openBox({ image: 'flowboard-sandbox:latest', egress: ['host.docker.internal'], credentials: [] })`, `box.exec({ tmpDir })` and the provider block with the `host.docker.internal` baseURL: `exitCode 0`, `costUsd 0`, input 6,843, and `hello.txt` = `ok` pulled back from the box. About 86 s including box creation. **`host.docker.internal` is the only egress an Ollama step needs.** OpenCode got by without `models.dev`.

### V6. Report

All of V1–V5 passed. Part 2 can go ahead as designed, with one question first.

**Open question for Alex (affects the context warning).** For a model without `num_ctx`, the window it actually gets is Ollama's memory-based default. On this machine that is the model's full maximum, 262,144 for qwen3-coder. The API doesn't report that default for a model that isn't loaded. Options:
- **(a) Recommended.** Window = `num_ctx` if set, else `OLLAMA_CONTEXT_LENGTH` if FlowBoard can see it, else `/api/ps`'s `context_length` if the model is loaded, else "Ollama's default", shown as unknown with **no** warning. Only a known window below 32,768 warns.
- (b) Treat an unknown window as small and warn. On this machine that would be a false alarm for qwen3-coder.
- (c) Load the model briefly to measure it. That costs memory and seconds on every page open, so not recommended.

Also for Part 2: the provider block's `limit.context` should be the same window, or `details.context_length` when the window is unknown, so OpenCode's compaction matches what Ollama really holds.

**Decided 2026-11-15: option (a).** Alex: "yes with a, make sure to document this for later". The rule Part 2 builds, in order:

1. `num_ctx` in `/api/show`'s `parameters` → that is the window (source `num_ctx`).
2. Else `OLLAMA_CONTEXT_LENGTH` in FlowBoard's own environment → that number (source `OLLAMA_CONTEXT_LENGTH`). FlowBoard only sees it if it runs with the same environment as the Ollama server; the Ollama app on macOS doesn't share it, so this is best effort.
3. Else, if `/api/ps` lists the model as loaded → its `context_length` (source `loaded`). That is what Ollama really picked, but it is a snapshot: it changes if Ollama reloads the model with other settings.
4. Else → **unknown** (source `default`): the page says "Ollama's default" and **no warning** is shown.

Only a known window (1–3) below **32,768** warns. For OpenCode's `limit.context`, an unknown window uses `details.context_length` (the model's maximum). **Revisit** if a machine with less memory gets false "fine" readings: Ollama then picks a small default (for example 4,096) that FlowBoard can't see, and an agent may lose its prompt without a warning. The fix then is to set `num_ctx` on the model, which rule 1 reads. The Part 2 docs (`Ollama Models.md` or its successor, and `Running Agent Work.md`) repeat this rule.

## Part 2: built 2026-11-15

On `feature/ollama-models`, not merged. The whole feature is documented in `docs/FlowBoard/Agent Providers/OpenCode Models.md` (renamed from *OpenRouter Models And Key*). Departures from the design above:

- **No `models/` folder or source interface.** `openrouter.ts` keeps the key and OpenRouter's list, `ollama.ts` is new, and `models.ts` builds both sources' rules and `prepareRun`. The source is the id's prefix. Two modules didn't need a shared shape.
- **`ModelRules.free` became `ModelRules.warning`**, one sentence per model: the free-model privacy warning, or the context warning.
- **`/api/openrouter` (GET) became `/api/models`**, since it now carries both sources; `/api/openrouter/key` stays. `app/settings/openrouter.tsx` became `app/settings/models.tsx`.
- **`ExecHost.hostName`** (core) is how a sandboxed process reaches this machine: `host.docker.internal` from `dockerExecHost` and from an OpenSandbox box's `exec`. The native pack is added in `execAi` once `spec.exec` is set (`ExecContext.opencodeConfig`), and in `run.ts` for run-agent.
- **The pack is read from the saved list** (`opencodeConfigFor(dataDir)`), so a resumed run, which skips the model check, still gets the provider.
- **Live test** `packages/cli/test/ollama-live.test.ts`: opt-in with `FLOWBOARD_LIVE=1`, skips when Ollama does not answer. Passed on gemma4 (25 s). **Not added to `test:live`**: Alex to decide.

Verified 2026-11-15: package tests, the app's typecheck, and the touched files' lint all pass. The app ran on port 3117 with a scratch data folder, and headless Chrome checked Connections → Ollama, the Ollama tab of OpenCode models (window `64k / num_ctx` for gemma4, `default / unknown` for qwen3-coder, and a Remove banner for an approved model no longer in Ollama), and the designer's picker (`ollama/gemma4:26b-64k · local`). One real one-step flow on `ollama/gemma4:26b-64k` ran on the host, in Docker (`flowboard-cli`) and in OpenSandbox (`flowboard-sandbox`, egress `host.docker.internal` only). Each wrote its artifact at $0 and printed the "runs locally at $0" line.

Found on the way, not fixed: **neither sandbox image has ripgrep**, so OpenCode's `glob` and `grep` tools fail in a box (`ripgrep execution failed`) whatever the model. A first Docker run that searched before writing ran out of turns. Adding `ripgrep` to `docker/Dockerfile` would fix it.
