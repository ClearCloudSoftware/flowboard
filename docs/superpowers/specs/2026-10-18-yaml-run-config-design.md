# YAML run config and runner — design

Date: 2026-10-18. Branch: `feature/agent-providers`. Builds on the Claude Code and OpenCode providers in `code/flowboard/packages/adapters/` (see `docs/FlowBoard/Agent Providers/Claude Code Adapter.md`, `OpenCode Adapter.md`, `Provider Implementation Decisions.md`).

## Intent

The owner wants to run one agent task from a file they can keep, edit and rerun, instead of the environment variables `try.ts` uses today. A YAML file says which adapter runs, with which model, effort, budget and permissions, in which folder, with which prompt. A runner command reads it, launches the matching `AgentProvider`, prints the events live, and saves a log.

## Goals

- One YAML file describes exactly one run.
- The YAML picks the adapter (`claude-code` or `opencode`), model, effort, budget, permissions and the folder the agent works in (the owner's list).
- The prompt lives in a separate markdown file the YAML points to (owner's decision).
- While the run goes, events print live in the terminal; every run also writes a log file into a `runs/` folder (owner's decision).
- A wrong config stops before anything launches, with a message that names the field.

## Non-goals

- Several runs, named agents or multi-step flows in one file (owner: "for now only 1 single run").
- A throwaway workspace: the agent works in the folder the YAML names (owner changed this from throwaway).
- Seeding files into the folder, MCP tool servers (`ask_user` needs the HITL broker), resume and fork, input/output artifact lists. Each can become a field later.
- Any database, job queue or UI. This is a local command, not FlowBoard's runner component.

## Anti-goals

- A typo in the YAML silently ignored, running with a default the owner did not mean. Unknown keys are errors.
- A run that writes outside its folder because the YAML forgot to say so. Guards always restrict the agent's file-editing tools to the folder. Shell commands are only checked against dangerous patterns (decision C5 in `Provider Implementation Decisions.md`), so a setting that lets the agent run any shell command is refused unless the YAML opts in explicitly (owner's decision, see *Unrestricted shell* below).
- Losing the log of a run that crashed or was stopped. The log is written as the run goes.

## Constraints

- Same code rules as the providers: TypeScript run by Node 24 type stripping (erasable syntax only, `import type`, `.ts` relative imports), tests with `node:test` + `node:assert/strict`, commands run from `code/flowboard/`.
- Auth is unchanged: Claude uses the installed `claude` login; OpenCode uses its own credentials. The YAML never holds secrets.
- Runs spend real quota or money; automated tests must not.

## The YAML file

Keys are snake_case. Relative paths inside the YAML (`folder`, `prompt`, `plugins`) are resolved against the folder the command is run from, not the YAML file's folder (owner's decision); absolute paths are used as written. Unknown keys anywhere are an error.

```yaml
adapter: claude-code          # required: claude-code | opencode
model: sonnet                 # required: Claude alias or id; for opencode "providerID/modelID"
effort: high                  # optional: low | medium | high | xhigh | max
folder: ../my-project         # required: where the agent works; must be an existing directory
prompt: ./task.md             # required: markdown file holding the task; must exist
system_prompt: You are a careful reviewer.   # optional
plugins: [./plugins/fbecho]   # optional: plugin folders whose skills are mounted
skill: /fbecho:echo           # optional: skill to invoke; must start with "/"
permissions:                  # optional
  mode: acceptEdits           # default acceptEdits: default | acceptEdits | bypassPermissions | dontAsk | plan | auto
  allow: [Read, Write, "Bash(pnpm *)"]
  deny: [WebFetch]
  allow_unrestricted_shell: false   # default false; see "Unrestricted shell"
guards:                       # optional, additive
  deny_paths: [docs/**]       # globs relative to folder
  deny_commands: ['\bnpm\s+publish\b']   # regex sources, added to the defaults
limits:                       # optional
  budget_usd: 0.50
  max_turns: 20
```

### How each field becomes a `RunSpec`

| YAML | `RunSpec` (`@flowboard/core`) |
|---|---|
| `adapter` | which provider the runner constructs: `ClaudeCodeProvider()` or `OpencodeProvider({ models: {} })` |
| `model` | `model`, passed through unchanged (Claude's `resolveModel` is the identity; OpenCode passes through any id containing `/`). For `opencode`, a model without `/` is a config error |
| `effort` | `effort`. A request, not a guarantee: OpenCode drops it when the model has no variant of that name, and the runner cannot know before the server starts, so it does not check (my call) |
| `folder` | `cwd`, as an absolute path |
| `prompt` | the file's text becomes `prompt.preamble`; `inputs` and `outputs` are empty; `closing` is fixed by the runner: *"This is a headless run: there is no terminal to ask into. Do the task, then stop."* (my call) |
| `system_prompt` | `systemPrompt` |
| `plugins` | `capabilities`: one `{ id: <folder name>, provider: <adapter>, mount: { kind: 'plugin_dir', path: <absolute> } }` per entry; each must be an existing directory |
| `skill` | `prompt.invocation` |
| `permissions.mode` | `permissionMode` (default `acceptEdits`, my call, matching `try.ts`) |
| `permissions.allow` / `deny` | `toolPolicy.allow` / `deny` |
| `permissions.allow_unrestricted_shell` | nothing; only gates validation (below) |
| `guards` | always set: `writeRoots: [folder]`, `denyPaths: guards.deny_paths`, `denyCommands: DEFAULT_DENY_COMMANDS + guards.deny_commands` |
| `limits.budget_usd` / `max_turns` | `limits.maxBudgetUsd` / `maxTurns` |

### Unrestricted shell

The guards stop the agent's file-editing tools from writing outside `folder`, but a shell command such as `echo x > ~/file` can still write anywhere the owner can. The YAML lets the agent run *any* shell command when any of these holds (my call on the exact list):

- `permissions.mode` is `bypassPermissions` or `auto` (both adapters);
- `permissions.allow` contains `Bash` with no pattern, or `Bash(*)` (any case, so `bash` too).

When one of them holds and `permissions.allow_unrestricted_shell` is not `true`, validation fails (owner's decision), for example:

```
task.yaml: permissions.mode: bypassPermissions lets shell commands write outside folder; set permissions.allow_unrestricted_shell: true to allow it
```

With the opt-in set, the run goes ahead and the header prints one warning line saying shell commands can write outside `folder` (my call). A narrower pattern such as `Bash(pnpm *)` is trusted as written: it needs no opt-in, even though the command it allows could itself write elsewhere.

## The runner

Command: `pnpm run-agent <path/to/task.yaml>` (a script in `code/flowboard/package.json`).

Every relative path — the YAML path on the command line, the paths inside the YAML, and `runs/` — is resolved against the folder `pnpm` was run from (owner's decision). pnpm runs scripts in the package folder and puts the original folder in `INIT_CWD`, so the runner uses `INIT_CWD` when set, else its own working directory (my call).

1. Read and validate the YAML. On any problem, print one line per problem as `<yaml path>: <field>: <message>` and exit with code **2** without launching anything (my call: 2 = bad config, distinct from a failed run). Checked: YAML syntax, required fields, enum values, unknown keys, `folder` and `plugins` exist as directories, `prompt` exists as a file, `skill` starts with `/`, an `opencode` model contains `/`, numbers are positive, each `guards.deny_commands` entry compiles as a regex, and the unrestricted-shell rule above.
2. Create `runs/` in the folder the command was run from if missing (my call, following the path rule), and open the log `runs/<YYYY-MM-DDTHH-MM-SS>-<adapter>.jsonl` (local time). The runner does not touch any `.gitignore`; ignoring `runs/` is the owner's choice (my call).
3. Print a header: adapter, model, folder, log path. Then launch the provider.
4. For each event: print one line, `type` padded to 14 characters followed by the event as JSON without `raw`, cut to 160 characters (the `try.ts` format); append the full event, `raw` included, to the log.
5. When the run ends, print and log the result.
6. Ctrl+C calls `run.stop()` once; a second Ctrl+C exits immediately.
7. Exit code: **0** when the result has no `error` and `exitCode` 0; **130** when stopped; **1** otherwise.

### Log format

JSONL, written line by line as the run goes, so a crash or stop keeps everything up to that point:

```
{"kind":"start","at":"<ISO time>","yaml":"<abs path>","config":{...the resolved RunSpec without exec...}}
{"kind":"event","at":"<ISO time>","event":{...NormalizedEvent, raw included...}}
{"kind":"result","at":"<ISO time>","result":{...RunResult...}}
```

## Where it lives

A new workspace package `code/flowboard/packages/cli` (`@flowboard/cli`), because it is the one place that knows every adapter (my call). It is not named `runner`: the architecture rule *"core/ and runner/ must never import from adapters/"* reserves that name for FlowBoard's runner component, and this command exists to import adapters (my call). It depends on `@flowboard/core`, `@flowboard/adapters`, `yaml` (Node cannot parse YAML itself) and `zod` (already in the workspace, used for validation with readable messages). `packages/adapters/try.ts` is deleted.

## Testing

Automated tests must spend nothing. Config parsing and validation are pure and get unit tests (a valid file → the expected `RunSpec`; each kind of invalid file → its error line, including each unrestricted-shell trigger with and without the opt-in). The run loop is testable through a seam that lets a test supply the provider (for example the `ReplayProvider`) instead of the real adapter, and check the printed lines, the log file and the exit code. One opt-in live check per adapter, like the providers' live tests, is enough.

## Left to the builder

- The module split inside `packages/cli`, and the exact seam for injecting a provider in tests.
- Exact wording of error messages, as long as each names the file and the field.
- Whether the log `config` line stores relative or absolute paths (absolute is simpler to debug).
