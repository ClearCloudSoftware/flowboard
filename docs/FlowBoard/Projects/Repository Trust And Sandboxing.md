---
tags: [flowboard, projects, security, sandbox]
module: Projects
---

# Repository Trust And Sandboxing

Agents read the project's repo, and the repo is untrusted input. The sandboxing design picks an isolation tier by **how far you trust the repo**; since 2026-11-13 the project record's trust field decides it ([[#Built]]).

## Why the repo matters

> *"Every step runs with `permission_mode='bypassPermissions'` by default — a fully-autonomous agent that reads untrusted content (repo files, the backlog, web pages, prior artifacts)."* (PRD §11.1)

> *"Stated plainly: even a hardened sandbox with `bypassPermissions` cannot stop a malicious repo from exfiltrating whatever is *inside* the sandbox (including any credentials mounted there) to whatever the allowlist permits. Run trusted repos, keep the allowlist tight, mount no host secrets."* (`08`, security profile)

The pitch names the risk: a prompt injection *"can exfiltrate a credential or corrupt a repo"* (`docs/pitch.md`).

## Trust picks the tier

From `08`, *The isolation ladder*: *"Pick the weakest tier that covers the trust level of the repo and the content the step reads."*

| Tier | Use when (`08`) |
|---|---|
| `host` | *"trusted repo **and** not bypassing permissions"* |
| `container` | *"default for headless/bypass runs on trusted-ish repos"* |
| `gvisor` | *"untrusted-ish content"* |
| `microvm` | *"untrusted repos / running unreviewed generated code"* |

Recommendation (`08`): the default tier is `container` *"whenever a step's `permission_mode` is `bypassPermissions`"*; `host` *"only for non-bypass steps or an explicit trusted-repo opt-out"*; and *"`gvisor`/`microvm` opt-in for untrusted repos"*. Backlog decision D7: *"Container + egress allowlist; `host` only for non-bypass or a trusted opt-out"*. D8: *"Docker baseline; gVisor/Firecracker opt-in per untrusted repo"*.

The other sources say the same in their own words:

| Source | Wording |
|---|---|
| PRD §11.1 | *"Optionally run each step inside a **container** (or, for untrusted repos, a gVisor/microVM) instead of a host process."* |
| Drawio *Tiers* | *"host (no box, approval mode only) · container (default when autonomous) · gVisor runsc (untrusted repos, Linux hosts) · microVM / docker sandbox"* |
| Feature map §10 | *"From "no box" (fast, for work you trust) up to strong isolation for untrusted code. You pick based on how much you trust what the agent will read."* |

> [!question] Where does "per repo" live?
> The tier is configured as *"a `sandbox_profile` in `settings` (tier, image, egress allowlist, limits), overridable per step"* (PRD §11.1), with an optional `step_defs.sandbox_profile` (backlog Story 1.1). Nothing is per project, though only D8 says *"per untrusted repo"*; `08` says *"opt-in for untrusted repos"* and allows *"an explicit trusted-repo opt-out"*, D7 *"a trusted opt-out"*, and PRD §11.1 reserves gVisor/microVM *"for untrusted repos"*. **Proposal:** a nullable `projects.sandbox_profile` that overrides the global default and is overridden by the step. See [[Projects Open Questions]] #16 and [[Sandboxing Open Questions]] #5. Answered 2026-11-13: per project, and the project's tier is the floor ([[#Built]]).

## Built

Since 2026-11-13 a project's trust (*Trusted*, *Normal*, *Untrusted*; [[Project Settings]]) decides where its runs work (`isolation.ts`, `flow-run.ts`). Not built: an egress proxy for Docker boxes, a project budget, a New run form that picks a project (the run's `--folder` finds it).

**A flow never runs without a project.** run-flow refuses a `--folder` that no registered project owns, on real paths, a task worktree under the repo included: `<folder>: not in a FlowBoard project (none in <data>/projects.json); create one for this repo first`. A repo inside another project's repo is its own project: the innermost owner decides. run-flow reads `FLOWBOARD_DATA_DIR`, else FlowBoard's own `code/flowboard/data/`, wherever it is started from. `--check` and `--mermaid` run nothing and stay project-free.

**The project's tier is the floor.** The flow's own `sandbox:` may keep it or make it stronger (host < docker = opensandbox < gVisor); nothing in a flow or the repo weakens it.

| Trust | Flow has no `sandbox:` | Flow has `sandbox:` |
|---|---|---|
| Trusted | The machine (`host`); agents ask before edits and shell commands | The flow's box, no asking |
| Normal | Docker `flowboard-cli`, `env` the credentials the agents need | The flow's box |
| Untrusted | Docker under gVisor (`--runtime runsc`), `flowboard-cli` | A `docker` flow: its image under gVisor. `opensandbox`: refused, *"Untrusted runs need gVisor; this flow's OpenSandbox box is not gVisor"* |

- **Untrusted without gVisor is refused**, macOS included, with no container fallback: *"Untrusted runs need gVisor, and this machine's Docker has no runsc runtime; set the project to Normal, or run it on a Linux host with gVisor"*. An Untrusted box gets only the agents' credentials, never the flow's `sandbox.env`.
- **Normal is refused until its credentials are set.** A container cannot read the macOS keychain, where the `claude` login is, so `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) must be set where FlowBoard runs, and `OPENROUTER_API_KEY` for an OpenCode step on OpenRouter. The image must exist (`docker build -f docker/Dockerfile -t flowboard-cli .`) and Docker be up, or the run is refused with the command. The same holds for any Docker box.
- **Refusals** are `run-flow` error lines with exit code 2, shown as written by the runs page's New run form. Every run prints `-- isolation: Normal (container), from project <name>`.
- **Normal's network is open**: agent containers reach the internet and hold real keys, because the egress proxy is not built.
- **The repo's git dir is read-only in a box.** A Docker box mounts the folder read-write, and the repo's git dir (`git rev-parse --git-common-dir`) read-only over it, so a box running in the repo root cannot plant a hook or `core.fsmonitor` in the repo's git dir. Flows commit on the machine, never in a box. **Not yet covered:** a box in a task workspace or a subfolder can still write a `.git` that FlowBoard's own git calls on the machine then run; see [[Isolation Enforcement Handoff#Open critical issue]].

### Approvals in Trusted runs

An agent's file edit or shell command is held until you answer: **Allow**, **Allow from now on** or **Deny**. Anything but file edits and shell commands passes, and so do edits inside the run's own artifacts folder (`.flowboard/<run>/`, where the prompts tell agents to write their outputs).

- **Where asked:** Claude Code through a `PreToolUse` hook (Claude's `Monitor` tool counts as a shell command; a `Monitor` with no command is denied); OpenCode through its permission requests (`apply_patch` over several files asks per file, all must be allowed). The question reaches the terminal or the runs page like an `ask_user`.
- **Someone must be able to answer.** A Trusted run with agent steps and neither a terminal nor `--page` is refused at start and at `--resume`: *"this project is Trusted, so agents ask before edits and shell commands, and no one can answer here; run it in a terminal or from the runs page"*.
- **Fails closed:** an ask that fails (the run stopped, nobody to answer) is a no, as is an edit or shell call whose path or command is not a string. One nobody could answer shows `-- <step>: denied <what>: no one could be asked`.
- **Only what the policy already allows:** an approval never grants more than the step's tool policy and guards. On Claude, a command the allow list refuses is still asked, then refused.
- **Shell steps never ask**, the flow's or the project's check command: they are the recipe's and the project's, not an agent's choice. Only agent steps ask.
- **Allow from now on** saves a rule on the project record (`approvals` in `data/projects.json`): all file edits, or a shell *prefix*, the command's first word plus its second unless that starts with `-` (`pnpm test --filter x` saves `pnpm test`). For `git` and the package managers (`npm`, `pnpm`, `yarn`, `bun`) a flag as the second word saves no rule, and a saved bare `git` or `npm` does not match such a command: `git -c core.fsmonitor=…` or `npm --prefix x install` can run anything. The project page lists the rules, each removable. Rules are read fresh at every call. A command holding `` ; & | < > $ ` ( ) \ `` or a newline never matches a rule and cannot be saved as one. Neither can a command that runs another command: shells, `env`, `sudo`, `node`, `python`, `find`, `pnpm exec` and the like, versioned names included (`python3.12`, `bash-5.1`); every word of a saved prefix must be plain (letters, digits, `.`, `_`, `-`; no paths or `NAME=value`). Those can be allowed once, with the help line *"This command can run other commands, so it can only be allowed once."*

### Decisions open to Alex's review (2026-11-13)

1. Normal with no `sandbox:` runs in `flowboard-cli`, which needs the token above, so a Normal project's runs are refused until it is set.
2. Untrusted with an OpenSandbox flow is refused: its box is not gVisor.
3. Shell steps never ask, even in Trusted.
4. An approval gates only what the tool policy allows; a command the Claude allow list refuses is still asked first (ceiling: match `toolPolicy.allow` before asking).
5. A saved shell prefix is as above, and a runner is never saved (the plan allowed `node` or `bash` prefixes; a rule for one would allow anything).
6. Isolation is decided as the run starts and pinned in `flow.json` (`config.isolation`). `--resume` does not keep the pin: it finds the project by the pinned `isolation.projectId` (by the pinned folder only for a pin from before isolation was built), requires the project to still own that folder, works the tier out again from the project's current trust and the pinned flow `sandbox:`, and refuses if the project is gone, the folder is no longer in it, or the result differs from the pin: *"its project's isolation changed since it started, or its flow.json was edited; start the flow again"*. A paused run whose project's trust changed must be started again. The plan said the pin was kept; a pin an agent can edit would otherwise lower the tier.
7. The app passes its data folder to `run-flow` as `FLOWBOARD_DATA_DIR` (starting a run and resuming one), so run-flow and the app read the same `projects.json`. A resume run-flow refuses comes back to the page as a 422 with its words.
8. The seeded Scratch project is Trusted (`overrides.trust`): FlowBoard wrote its repo. Installs seeded before keep theirs.

## The git boundary

| Control | Source |
|---|---|
| Only the task worktree is writable in the box | *"the only writable bind-mount is the task worktree"* (`08`); drawio *Mounts*: *"rw: task worktree → /work"*; feature map §10: the agent *"only ever sees the one task's files — never your keys or your other projects"* |
| No route to the project remote | egress excludes *"the project's git remote"* (PRD §11.1, backlog Story 3.5) |
| No push, no base-branch moves | PreToolUse hook (PRD §7) |
| Host secrets stay out | *"Never mount host secrets (`~/.ssh`, cloud credentials), the host DB, or the Docker socket."* (PRD §11.1) |
| The host does git | PRD §11.1 *"the host does all git work"*; drawio *"host-side push / fetch"*, a dashed (*"optional or later"*) edge |

## Plugins in the project store

The project's capability store holds code from git URLs. On the host tier, *"a step that mounts a git-installed plugin does not run … Seed plugins still run there."* (PRD §11.1; Capability Library D15). See [[Capability Tools And Egress]].

## Related

- [[Project Repository]]
- [[Capability Tools And Egress]]
- [[Run Guardrails At Launch]]
- [[Sandbox Configuration]]
- [[Isolation Tiers]]
- [[Projects Open Questions]]
