# lr-doctor: is this machine ready to run Lamproom?

Date: 2026-11-17. Branch: `feature/lr-doctor` (off `dev`).

## Why

Lamproom depends on a dozen outside systems (Docker, an image, agent CLIs, logins, tokens, model providers, GitHub,
Slack). Today you find out one is missing when a run is refused or fails partway. `lr-doctor` answers, in one go,
"can this machine run my projects right now, and if not, what do I do?" — in the terminal now, and later on a page in
the app, from the same code and the same report.

## Goals

- One command, `pnpm lr-doctor`, lists every system Lamproom uses, whether it is installed, running and signed in,
  and the exact command or step that fixes each problem.
- **Needed vs. optional comes from your setup**, not a fixed list: your projects' trust tiers (plus the tier a new
  project gets) and the agents your flows use decide what must work.
- `pnpm lr-doctor --json` prints the same report as one JSON document, so the UI (and scripts, CI) can read it.
- Exit code says whether anything needed is broken, so scripts can gate on it.

## Non-goals

- Fixing anything. The doctor is read-only: it never installs, builds an image, logs in, or edits a file (one
  exception, below). It prints the fix.
- The UI page. This design fixes the report's shape so a page can be built on it later; the page is its own work.
- Packaging Electron (which removes node/pnpm from the list). Until it exists, the doctor checks node and pnpm.
- Checking a run's flow before it starts — `lr-run-flow` already refuses with reasons. The doctor is the machine-wide
  view, not a per-run gate.

## Anti-goals

- A doctor whose answer differs from what a run would do. Every check calls the same function the run or the
  Settings page already calls (`dockerNotReady`, `harnessStatus`, `ghStatus`, `refreshOllama`, …). No second copy of
  a probe.
- A wall of red on a fresh machine for things you don't use. Optional things are never `fail`.
- A slow doctor. Probes run in parallel with timeouts; a stuck one is reported, not waited on forever.

## Approaches (how the UI reads the output)

| | How | Trade-off |
|---|---|---|
| **A. Shared module (picked)** | `packages/cli/src/doctor.ts` exports `runDoctor(): Promise<DoctorReport>`. The CLI prints it as a table or `--json`; a later `app/api/doctor/route.ts` returns `Response.json(await runDoctor())`. | Same pattern as `app/api/agents/route.ts` → `harnessStatus`. No process spawn, typed on both sides. The JSON from the CLI is byte-for-byte the route's body, so either can be used. |
| B. UI spawns `lr-doctor --json` | The route runs the CLI and parses stdout. | A process per page view, PATH issues under Electron, slower; only buys isolation we don't need. |
| C. Doctor writes `data/doctor.json`, UI reads it | | Stale the moment anything changes; needs a refresh story. |

A wins: it is how the app already shows agent and GitHub status. Packaging approach (option 2: packaged Electron
app, Normal/Untrusted tools in the image, Trusted keeps host tools) was picked by Alex in the conversation.

## What it reads first: the needs

Before probing, the doctor works out what this setup needs. All from existing code:

- **Tiers** = the resolved trust of every project (`readProjects` + `resolveSettings(readAppSettings(…), type,
  overrides)`).
  - any `normal`/`untrusted` → the container tier is needed
  - any `untrusted` → gVisor is needed
  - any `trusted` → host agent CLIs (and uv, if that project's knowledge assets are on) are needed
- **The tier a new project gets** = `resolveSettings(readAppSettings(…), 'software', {}).trust` (the wizard's
  default type; a type default wins over the app setting, so today this is Normal). It **only warns**: what it would
  need but your existing projects don't is `warn` with "needed for new projects", never `fail`. A Trusted-only
  machine is `ready` (exit 0); a fresh machine with no projects is `ready` with warnings. *(My call: a fresh machine
  shouldn't be red for things nothing uses yet, but should hear that its first project will need Docker.)*
- **Flow sandboxes**, as `isolationFor` (`isolation.ts`) treats them: a flow's own `sandbox: { runtime: docker,
  image: X }` puts its runs in a container whatever the project's tier. So the container tier is also needed if any
  flow declares a docker sandbox, and the **images to check** = `boxImage()` (if a Normal/Untrusted project exists,
  or for new projects) ∪ every `image` a flow's docker sandbox names. *(My call: follow `isolationFor` so the doctor
  can't drift from runs; the bundled flows use no `sandbox:` today, so this is just `lamproom:cli` for now.)*
- **Agents** = the union of `agentNeeds(steps)` over every flow in the flows folder (`listFlows` / `loadFlow`,
  `LAMPROOM_FLOWS_DIR` or the default): `claude`, `openrouter`, `ollama`. A flow that does not load is counted in the
  report's context, not a check failure. Plus: does any flow say `sandbox: { runtime: opensandbox }`?
- **Local models** = any approved OpenCode model is `ollama/…` (`isLocal`).

The report carries these in `context` so you (and the UI) can see *why* something is needed.

## Exactly what is checked

Status per check: `ok` · `warn` (optional and broken, or needed but degraded) · `fail` (needed and broken) · `skip`
(not run: not needed, or something it depends on already failed — the reason is in `detail`).

### Core — always needed

| id | Probe | ok when | Fix shown |
|---|---|---|---|
| `node` | `process.version` of the doctor itself | ≥ 22.18 (runs `.ts` without a flag); `warn` below 24 (the image's 24.11.1) | install Node 24 |
| `pnpm` | `pnpm --version` | runs; `warn` if major ≠ `packageManager`'s (10) | `corepack enable` |
| `git` | `git --version` | runs | install git |
| `data` | `defaultDataDir()` exists, is writable; `projects.json` parses | both | the path and the parse error |

### Container tier — needed if any project is Normal/Untrusted or any flow has a docker `sandbox:` (new-project default: warn only)

| id | Probe | ok when | Fix shown |
|---|---|---|---|
| `docker` | `docker --version`, then `docker info` (as `dockerNotReady`), memory via `dockerDefaultMemoryMb` | daemon answers | "Start Docker Desktop" / install Docker |
| `docker.image` | `docker image inspect` on each image to check (see the needs: `boxImage()` — `lamproom:cli` or `LAMPROOM_IMAGE` — plus flows' own) | all exist; detail = each image's created date and size, or which are missing. One check, one stable id, however many images | `docker build -f docker/Dockerfile -t lamproom:cli .` for Lamproom's; "build or pull X" for a flow's |
| `docker.gvisor` | `dockerHasGvisor()` | `runsc` registered. Needed only with an Untrusted project; on macOS the detail says it is not available there | set the project to Normal, or run on Linux with gVisor |
| `token.claude` | `CLAUDE_CODE_OAUTH_TOKEN` in the doctor's env, shape `sk-ant-oat01-…` | set. Needed when the container tier is needed **and** a flow uses claude. Not sent anywhere | `claude setup-token`, then export it where Lamproom runs |

### Agents on this machine — needed if any project is Trusted

| id | Probe | ok when | Fix shown |
|---|---|---|---|
| `claude` | `harnessStatus('claude-code', settings path)` | installed and `signIn.ok`. Needed when a Trusted project exists and a flow uses claude; otherwise optional (it's also how you make the token) | `signIn.text` from the probe |
| `opencode` | `harnessStatus('opencode', settings path)` | **installed**; `signIn.text` goes in the detail but doesn't decide the status. Needed when a Trusted project exists and a flow uses openrouter or ollama. *(My call: runs don't use `opencode auth` — they get the OpenRouter key from `secrets.json`/env via `applySavedKey`, and Ollama needs none — so the key is the `openrouter` check's job, not this one's)* | install opencode |
| `uv` | `uv --version` | runs. Needed when a Trusted project has graphify or Serena on (host builds run `uvx`, which fetches the pinned graphify 0.7.5 / Serena 2.1.0 on first use) | install uv |

### Models

| id | Probe | ok when | Fix shown |
|---|---|---|---|
| `openrouter` | `keyView` (env or saved, last 4), then `testKey` → `GET openrouter.ai/api/v1/key` (free) | key accepted; detail = credit left. Needed when a flow uses openrouter | Settings → LLM Provider |
| `ollama` | `refreshOllama(dataDir)` | answers; detail = version, model count. Needed when a flow uses ollama or a local model is approved | "start Ollama" (the probe's own message) |

### Connections — optional unless noted

| id | Probe | ok when | Fix shown |
|---|---|---|---|
| `github` | `ghStatus()` | `connected` (detail = login). Optional: only the New Project wizard and clones use it; `missing`/`signed-out` → `warn` | `gh auth login` / the probe's message |
| `slack` | `slackTokens(dataDir)`; if a bot token is saved, `slackCall(bot, 'auth.test')` | no tokens → `skip` ("escalation goes nowhere"); tokens → accepted | Settings → Connections |
| `opensandbox` | an HTTP request to `OPENSANDBOX_DOMAIN` (default `127.0.0.1:8080`), and `docker image inspect lamproom:sandbox` | both. Needed only if a flow uses `runtime: opensandbox` | start the server (config in `~/.config/lamproom/opensandbox/`), build `docker/Dockerfile.opensandbox` |

### Deliberately not checked

The app server being up (you don't need it for terminal runs, and the UI is proof of it), graphify/Serena versions
inside the image (pinned by the Dockerfile), whether the image is older than the Dockerfile, egress, Codex (no
adapter yet).

## What it does (side effects)

- Runs the CLIs above with argument lists, never a shell, each with a timeout (reuse the probes' own: 10–30 s).
- Network calls: `openrouter.ai/api/v1/key` (with a key), Slack `auth.test` (with a token), `gh auth status`
  (GitHub), Ollama and OpenSandbox on localhost. No call costs money.
- **One write:** `refreshOllama` saves `ollama-models.json` in the data folder, as the Models page does. Kept: it is
  the probe the app uses, and the cache it refreshes is the one runs read.
- Never prints a secret: tokens and keys appear as "set" / last 4 characters only.

## The report (`--json`, and the UI's contract)

```ts
type Status = 'ok' | 'warn' | 'fail' | 'skip';
type Group = 'core' | 'container' | 'agents' | 'models' | 'connections';

interface Check {
  id: string;              // stable: 'docker.image'; the UI keys on it
  group: Group;
  label: string;           // 'Image'
  status: Status;
  needed: boolean;         // from the needs above
  why: string;             // 'Normal projects run steps in containers: api, web'
  detail: string;          // one line: 'lamproom:cli, built 2026-11-16, 2.11 GB' or what is wrong
  fix?: string;            // one line, a command where there is one
  version?: string;
  ms: number;              // how long the probe took
}

interface DoctorReport {
  schema: 1;               // bump on a breaking change to this shape
  at: string;              // ISO time
  runner: 'terminal' | 'app';   // whose env was checked: see "Terminal vs. app" below
  host: { platform: NodeJS.Platform; arch: string };
  context: {
    dataDir: string;
    flowsDir: string;
    defaultTrust: Trust;
    projects: { id: string; name: string; trust: Trust }[];
    flowNeeds: ('claude' | 'openrouter' | 'ollama')[];
    opensandboxFlows: string[];
    unreadableFlows: string[];
  };
  summary: { ok: number; warn: number; fail: number; skip: number; ready: boolean };  // ready = no fail
  checks: Check[];         // always every id above, in this order; skipped ones say why
}
```

Every check is always present (as `skip` if not run), so a page can lay out a fixed grid without guessing.

## The terminal output

```
Lamproom doctor · macOS arm64 · data data
Projects: api (Normal), web (Normal), Scratch (Trusted) · new projects: Normal

Core
  ✓ node         24.11.1
  ✓ pnpm         10.23.0
  ✓ git          2.47.1
  ✓ data         3 projects
Containers                                  needed: api, web are Normal
  ✓ Docker       28.1.1, 7.6 GB memory
  ✗ Image        lamproom:cli is not built
                 → docker build -f docker/Dockerfile -t lamproom:cli .
  – gVisor       not needed: no Untrusted project
  ✗ Claude token CLAUDE_CODE_OAUTH_TOKEN is not set
                 → claude setup-token, then export CLAUDE_CODE_OAUTH_TOKEN where Lamproom runs
Agents on this machine                      needed: Scratch is Trusted
  ✓ claude       2.3.1, logged in with a Claude subscription
  ! opencode     not installed (optional: no flow uses it)
  ✓ uv           0.9.10
Models
  ✓ OpenRouter   saved key …a1b2, $4.20 left
  ! Ollama       does not answer on 127.0.0.1:11434 (optional)
Connections
  ✓ GitHub       connected as alex
  – Slack        no tokens saved: escalation goes nowhere
  – OpenSandbox  not needed: no flow uses runtime: opensandbox

Not ready: 2 problems stop runs, 2 warnings.
```

Colour only on a TTY and without `NO_COLOR`. `✓ ✗ ! –` as the marks.

## CLI surface

```
pnpm lr-doctor          # the table above
pnpm -s lr-doctor --json   # DoctorReport on stdout, nothing else (-s keeps pnpm's banner out)
```

Exit `0` when `ready`, `1` when any check is `fail`, `2` on a bad argument or the doctor itself crashing. Warnings
don't change the exit code. Arguments via `node:util` `parseArgs`, as `flow-run.ts` and `workspace.ts` do.

## Files

- `packages/cli/src/doctor.ts` — needs, checks, `runDoctor(deps?)`, the types. Probes injectable
  through `deps` (as `RunDeps` does in `flow-run.ts`) so the test runs without Docker or network.
- `packages/cli/src/doctor-main.ts` — args, table/JSON printing, exit code.
- `package.json` — `"lr-doctor": "node packages/cli/src/doctor-main.ts"`.
- `packages/cli/test/doctor.test.ts` — one file: the needs rules (Trusted-only machine with Docker
  down is `ready`, Docker `warn` "needed for new projects"; Untrusted needs gVisor; a flow's docker `sandbox:` makes
  Docker needed and adds its image; optional broken → `warn`, never `fail`), every id present, `--json` parses.
- Later, separate work: `app/api/doctor/route.ts` (behind `refused(request)` like the other routes) and the page.

## Terminal vs. app

Found while designing: the Electron app imports only `PATH` from your login shell (`electron/path.js`), not other
variables. So `CLAUDE_CODE_OAUTH_TOKEN` exported in `.zshrc` reaches a terminal run but **not** the app opened from
Finder — the terminal doctor says ✓ while the app's runs are refused. `runner` in the report records which env was
checked, and the CLI's line for `token.claude` notes "checked in this terminal; the app opened from Finder may not
have it". Fixing the gap (keeping the token in `secrets.json` like the OpenRouter key — cross-platform, no
keychain) is separate work.

## Left to the builder

- Whether to make `ghStatus`/`dockerNotReady`/`dockerHasGvisor` async (they use `spawnSync`, which blocks parallel
  probes and, later, the Next server) or run those few in sequence. Either is fine; don't duplicate them.
- The OpenSandbox reachability request (any HTTP answer from the domain counts as up; use the SDK's own health call
  if it has one).
- Exact wording of `why`/`detail`/`fix` lines, in the house style of the existing refusal messages.
