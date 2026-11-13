---
tags: [flowboard, projects, security, sandbox, handoff]
module: Projects
---

# Isolation Enforcement Handoff

A project's **Isolation** setting (Trusted, Normal or Untrusted) now decides where every run of that project works. Before this branch, run-flow ignored it: only a flow's own `sandbox:` key boxed anything, and no shipped flow had one, so every run worked on your machine.

This note is the state of branch `feature/isolation-enforcement` (cut from `dev` at `f89a54f`, head `ae80d05`) on 2026-11-13. The branch is not merged or pushed. It records:

- [[#Fixed: the .git escape]]: the last way out of the box, now closed.
- [[#What happens when a run starts]].
- [[#Rulings made on your behalf]]: every decision taken while building, with what it costs if wrong.
- [[#Deferred findings]].

The design and the code-level details are in [[Repository Trust And Sandboxing#Built]]. The plan is `docs/superpowers/plans/2026-11-13-isolation-enforcement.md`.

## Fixed: the .git escape

**A boxed agent could get code run on your machine through git config. That is fixed.**

### What it was

Git reads its settings from whatever `.git` it finds from its working folder, and some of them run commands: `core.fsmonitor` on `git status`, clean filters, hooks, `diff.external`. A Docker box mounts the run's folder read-write, so it could:

- rewrite a task workspace's `.git` file to point at a git dir it wrote,
- create `<subfolder>/.git`, which git finds before the repo's,
- from the repo root, rewrite *other* workspaces' `.git` files under `.flowboard/worktrees/`,
- replace a submodule's `.git`, which `git status` recurses into.

FlowBoard's next git call **on your machine** (the dirty check, the Workspaces page, landing, the Projects page, the run page's diff) then ran the box's command outside the box. The reviewer reproduced the first two.

### How it is fixed

Every git call FlowBoard makes in a project's repo goes through `hostGit` (`packages/adapters/src/workspace/host-git.ts`):

- **The repo is the project's.** Its top folder comes from the registered project, never from git run in the folder.
- **The git dir is found without running git.** Walking up from the folder, the first `.git` must be the repo's own (`<repo>/.git`, read-only in a box) or a worktree's `.git` file pointing into `<repo>/.git/worktrees/<name>`, whose own `gitdir` file, written by git, points back to it. Anything else is refused: *"`<path>/.git` was not made by git for `<repo>`; a sandboxed step may have written it. Remove it and check the repo."*
- **Git is told which.** It runs with `GIT_DIR` and `GIT_WORK_TREE` set, so it never discovers a `.git`, with `core.fsmonitor` off and submodules ignored.

A run whose folder holds a planted `.git` is refused before anything runs, `--allow-dirty` or not. A workspace whose `.git` was rewritten shows as broken on the Workspaces page, with `git -C <repo> worktree repair <path>` as the fix. The run page shows the refusal instead of a diff.

A `-c` blocklist was not enough: a git dir the box controls controls all of git's config.

**What it costs.** A repo whose `<repo>/.git` is a file (a separate git dir, or a worktree registered as a project) is refused. So is a nested repo below a project's root that is not registered as its own project.

## What happens when a run starts

These steps apply to a run started from the runs page or with `pnpm run-flow`. `--check` and `--mermaid` run nothing, so they skip all of them.

### 1. Find the project

run-flow looks up the registered project that owns `--folder`, comparing real paths. A task workspace sits inside its repo, so it belongs to that repo's project. When projects are nested, the innermost one wins.

If no project owns the folder, the run is refused:

> `<folder>: not in a FlowBoard project (none in <data>/projects.json); create one for this repo first`

`<data>` is FlowBoard's own `data/` folder. `FLOWBOARD_DATA_DIR` overrides it, and the app always passes its own.

### 2. Work out the isolation

The project's resolved trust (app setting, then project type, then the project's own override) is the floor. A flow's `sandbox:` key can make a run stricter, never weaker.

| Project | Flow has no `sandbox:` | Flow has its own `sandbox:` |
|---|---|---|
| **Trusted** | Your machine; agents ask before edits and shell commands | The flow's box; nothing asks |
| **Normal** | A Docker box from the `flowboard-cli` image | The flow's box |
| **Untrusted** | A Docker box under gVisor (`runsc`), with only the agents' credentials | The flow's Docker image under gVisor, with only the agents' credentials. An OpenSandbox flow is refused. |

Untrusted on a machine whose Docker has no `runsc` runtime, which includes every Mac, is refused:

> `Untrusted runs need gVisor, and this machine's Docker has no runsc runtime; set the project to Normal, or run it on a Linux host with gVisor`

A flow sandbox with any runtime other than `docker` or `opensandbox` is refused.

### 3. Check the box can start

For a Docker box, run-flow checks, in order:

1. Docker is running, or it refuses with `Docker is not running`.
2. The image exists, or it refuses with `no image flowboard-cli; build it from code/flowboard: docker build -f docker/Dockerfile -t flowboard-cli .`
3. Each credential the flow's agents need is set. A box cannot read the macOS keychain, where your `claude` login lives. A missing credential is refused with:

   > `CLAUDE_CODE_OAUTH_TOKEN is not set: a container cannot use this machine's login. Run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN where FlowBoard runs`

   OpenRouter steps need `OPENROUTER_API_KEY` in the same way.

The repo's git dir is mounted read-only in the box, and FlowBoard's own git calls use only it (see [[#Fixed: the .git escape]]).

### 4. Check someone can answer

A Trusted run with at least one agent step needs a terminal or the runs page to answer its questions. Without either, it is refused:

> `this project is Trusted, so agents ask before edits and shell commands, and no one can answer here; run it in a terminal or from the runs page`

Every refusal in steps 1–4 happens before the workspace, lock or run folder is made, and exits with code 2. The New run form shows it as written.

### 5. Run

The run log names the level:

> `-- isolation: Trusted (host), from project demo; agents ask before edits and shell commands`

The isolation is pinned in `flow.json`.

### Approvals in a Trusted run

These apply when the run works on your machine.

- **What asks.** File edits and shell commands ask. On Claude these are `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash` and `Monitor`; on OpenCode, the `edit` and `bash` permissions. Anything else passes without asking.
- **What never asks.** Writes to the run's own output folder never ask, and neither do shell steps (the flow's or the project's check command).
- **The question.** It reaches the terminal or the runs page like an agent's question, and the step's timeout clock stops while it waits. The prompt is `Edit <path>?` or `Run <command>?`, with three answers:
  - **Allow**
  - **Allow from now on:** every file edit, or commands starting with a prefix such as `pnpm test`
  - **Deny**
- **When Allow from now on is left out.** A command that can run other commands gets no "Allow from now on", only the note "This command can run other commands, so it can only be allowed once." These are:
  - chained or redirected commands: `;` `&` `|` `<` `>` `$` backtick `(` `)` `\` or a newline;
  - shells and interpreters (`bash`, `node`, `python3.12`, `bash-5.1`…);
  - `env`, `sudo`, `xargs`, `find`, `awk`, `sed`;
  - `npx`, and `pnpm exec`, `dlx` or `x`;
  - a path or `NAME=value` as the first word;
  - `git` or a package manager followed by a flag.
- **Saved rules.** They live on the project record in `data/projects.json`, never in the repo. They are read fresh at every question and listed on the project page under **Allowed from now on**, each with a remove button.
- **When asking fails, the call is denied.** This covers a stopped step, an unreadable `projects.json`, and no one able to answer. The run log shows `-- <step>: denied <what>: no one could be asked`.
- **An approval never grants more than the flow's own tool policy.** On Claude, a command the policy refuses may still be asked, then refused anyway.

### Resume

`--resume` reads the pinned `flow.json`, which an agent may have written, as untrusted input. It does these checks in order:

1. Checks the pin against strict schemas.
2. Finds the project by the pinned project id, or by folder for a run from before this branch.
3. Requires that the project still owns the folder.
4. Works out the isolation again from the project's **current** trust, with the same refusals as a fresh start.

If the result differs from the pin, it refuses:

> `cannot resume: its project's isolation changed since it started, or its flow.json was edited; start the flow again`

An OpenSandbox run with no box recorded is refused too. From the runs page, a refused Resume now shows run-flow's reason instead of doing nothing.

## Rulings made on your behalf

These are the decisions taken while building, in the order they were made. They are recorded in full in the run's ledger, `.superpowers/sdd/2026-11-13-isolation-enforcement/progress.md` in the worktree.

| # | Ruling | Why | Cost if wrong |
|---|---|---|---|
| 1 | Commands that run other commands (shells, interpreters, `env`, `sudo`, `xargs`, `find`, `awk`, `sed`, `npx`, `pnpm exec`…) can only be allowed once, never saved | A saved `bash` or `node` rule would allow anything, with no chaining characters needed | You re-approve e.g. `node script.js` every time |
| 2 | Saved prefixes must be plain words: no paths, `NAME=value` or flags; version suffixes are stripped before the runner check | `/bin/bash`, `FOO=1 bash` and `python3.12` slipped past a name-only list | Odd but safe commands (`./gradlew`) can only be allowed once |
| 3 | For package managers, `exec` or `dlx` anywhere, or `x` anywhere but last, makes the command a runner | Keeps `pnpm test --filter x` saveable as `pnpm test` | A trailing `x` argument passes, though it runs nothing on its own |
| 4 | The `OPENROUTER_API_KEY` refusal wording was written to match Claude's | The plan only gave Claude's line | A wording change |
| 5 | Resume works out the isolation again and refuses on any change; this replaces the plan's Decision 6, "keep the pinned tier" | A boxed agent could edit the pin so the next resume ran on your machine | A paused run whose project setting changed must be restarted, not resumed |
| 6 | The app passes its data folder to run-flow on New run and Resume | With `FLOWBOARD_RUNS_DIR` set, run-flow looked in the wrong folder and refused every run | None |
| 7 | Untrusted boxes get only the agents' credentials, never variables a flow lists in `sandbox.env` | "Nothing in a flow can weaken the tier" includes copying secrets into an open-network box | An Untrusted flow can't pass extra variables |
| 8 | Approvals fail closed: a call with an unusable path or command is denied, and Claude's `Monitor` counts as a shell command | A gate that allows when unsure isn't a gate | An odd `Monitor` call needs approval; one using a websocket instead of a command never runs in Trusted |
| 9 | OpenCode: questions are answered off its event loop; it still asks in its auto-approve modes; multi-file patches ask per file, all must be allowed | Waiting on the loop would hang Stop; auto mode would otherwise skip you | You may see several questions at once |
| 10 | OpenCode: edit paths come from its absolute file list; a request with no patterns is not treated as allowed | Its multi-file patch sent one comma-joined path | None |
| 11 | With no "Allow from now on", the note reads "This command can run other commands, so it can only be allowed once." | One message for both chained commands and runners | A wording change |
| 12 | The run log's allowed and denied lines were worded by the implementer; if saving a rule fails, the call is still allowed once | You said allow | A wording change |
| 13 | `ApprovalRule` and `ruleText` moved into `settings.ts` | The project page is client code and must not pull in Node modules | None |
| 14 | Other notes that now stated false run-flow behaviour were corrected too | Same defect as the listed ones | None |
| 15 | The repo's git dir is mounted read-only in Docker boxes | Flows never commit in a box; FlowBoard commits on your machine | An agent can't `git commit` inside a box |
| 16 | When projects are nested, the innermost owning project wins | An Untrusted repo inside a Trusted one got the weaker tier | None |
| 17 | run-flow defaults to FlowBoard's own `data/` folder; `FLOWBOARD_DATA_DIR` still overrides it | It followed the shell's folder, so a hostile repo's own `data/projects.json` could declare it Trusted | A command-line user with data elsewhere must set the variable |
| 18 | Writes to the run's own output folder don't ask | They are FlowBoard's files; asking nudged you toward "every file edit" | None |
| 19 | A Trusted run with agent steps and no one to answer is refused; a failed question logs "no one could be asked" | Otherwise every edit was denied silently while the run spent budget | Trusted runs in CI need `--page` |
| 20 | A Resume refused from the page shows run-flow's reason | It returned ok and nothing happened | None |
| 21 | The sample Scratch project is seeded as Trusted, for new installs only | FlowBoard writes that repo itself, and a fresh install's first run would need Docker, the image and a token | A fresh install's sample runs ask before edits instead of running boxed |
| 22 | Small fixes before merge: `git` or a package manager followed by a flag saves no rule; the package-manager check ignores case; the flow designer no longer says "the flow has no sandbox" | A bare `git` or `npm` rule allowed `git -c core.fsmonitor=…` or `npm install` | None |
| 23 | A test-only hook `RunDeps.canAsk`; the no-one-to-answer refusal applies only to flows with agent steps; Ctrl+C at a question isn't logged as "no one could be asked" | Shell steps never ask, and Ctrl+C is your own choice | None |

## Deferred findings

These are lower priority, kept for later. The full list is in the ledger.

- **Plugin tools.** On Claude, a plugin's tool that writes files passes without asking. Only the listed edit and shell tools ask.
- **"Every file edit" plus a saved script prefix.** Together, rules like "every file edit" and `pnpm test` let an agent run anything: it edits `package.json`, then runs the script.
- **Resume of a gone OpenSandbox box** from the page still fails silently.
- **`projects.json` locking.** Both the app and run-flow write it with no lock, so a rare simultaneous write could be lost.
- **Containerised run-flow.** run-flow started from the Docker image now needs `FLOWBOARD_DATA_DIR`.

## Related

- [[Repository Trust And Sandboxing]]
- [[Project Settings]]
- [[Projects Index]]
