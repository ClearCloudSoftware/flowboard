---
tags: [lamproom, projects, knowledge, handoff]
module: Projects
---

# Knowledge Assets Handoff

A project's **Knowledge assets** setting (Serena on or off, graphify on or off, rebuilt when the base branch moves, once a day or only by hand) is now acted on. Lamproom builds the maps into the repo's `.lamproom/knowledge/`, and every agent step of the project's runs can use them: graphify's code map as files, Serena as a read-only MCP server. Before this branch, the setting was stored and the page said *"Lamproom does not act on it yet"*.

This note is the state of branch `feature/knowledge-assets` on 2026-11-15: cut from `feature/analysis-agent` at `098340e` (Alex chose stacking), commits `3775559..HEAD`, not merged or pushed. Merging it into `dev` brings `feature/analysis-agent` in too. It records:

- [[#How it works]], in brief.
- [[#Decisions open to your review]]: the six choices that shape the feature.
- [[#Rulings made on your behalf]]: the smaller decisions taken while building, with what each costs if wrong.
- [[#Left for later]]: what is left unfixed.

The plan is `docs/superpowers/plans/2026-11-15-knowledge-assets.md`.

## How it works

- **A build is an ordinary run of the project.** `startKnowledgeBuild` in `packages/cli/src/knowledge-run.ts` writes a one-step flow, a single shell step whose script `buildCommand` (`knowledge.ts`) makes from the settings, into `<data>/internal/knowledge/<project id>/knowledge-build.yaml`, and starts it with `startRun`. So it gets the project's isolation tier, takes the folder lock, shows in the runs list as `knowledge-build`, and counts toward the monthly cap at $0. A cloned repo can't make it run on this machine.
  - **Trusted:** on this machine, through `uvx`, pinned to `graphifyy==0.7.5` and Serena v2.1.0 (`5e4f5cd`), with Lamproom's Serena home in `<data>/serena`.
  - **Normal and Untrusted:** in a shell step's box (`--network none`) from the sandbox image, which now carries uv, graphify, Serena and Serena's TypeScript/JavaScript and Python language servers (`docker/Dockerfile`, `docker/lr-serena.sh`).
  - **OpenSandbox:** never; the box would hold only the last commit.
- **What a build makes:** it first deletes `.lamproom/knowledge/`, so nothing a repo or an earlier run left there survives. Then `graphify-out/` (`graphify update`: parsed from the code, no AI calls, free), Serena's index in `serena/` under a `project.yml` Lamproom writes whole (`SERENA_PROJECT_YML`: `read_only: true`, the two languages, no tool, mode or prompt keys), and `stamp.json` (`{ commit, builtAt, graphify, serena }`) for agents. Lamproom never reads the stamp back: an agent in a box could write it. The record keeps `knowledgeBuild: { run, commit }`.
- **When a build starts:**
  - After a GitHub clone, first: `buildThenAnalyse` starts the build, waits until its run ends and the folder lock is free, then starts the repo analyst, which already reads both maps. The clone log says `-- knowledge build started: run …` and `-- knowledge built at <commit>` or `-- knowledge build failed: …; the analysis starts anyway`. A build that can't start never stops the analyst, and nothing fails the clone.
  - **Build** / **Rebuild** on the project page's knowledge card (`POST /api/projects/:id/knowledge`).
  - The scheduler: `instrumentation.ts` starts `startScheduler` once per server process (a `globalThis` guard), and every 10 minutes `knowledgeTick` starts each due build in turn (`dueBuild`). *When the base branch moves*: the base branch is checked out and its local tip isn't the commit last mapped. *Once a day*: 24 hours after the last build started. Never while a build runs; a build that failed isn't retried until the base moves (or a day passes).
- **The card** reads `knowledgeView`: *off*, *never built*, *building…* with a link to its run, *built at <commit> · <time>*, *stale: main is at <commit> now*, or *build failed: <why>*, the why being the build's last line.
- **In runs** (`knowledgeFor` in `flow-run.ts`): a run in the repo's own folder, on this machine or in a Docker box, gets Serena as an MCP server on every agent step and a line in each agent's prompt pointing at `GRAPH_REPORT.md`, but only when the project's last build ended *built* (or *stale*) and git tracks nothing under `.lamproom/`. Serena also needs `read_only: true` in its project file and no `project.local.yml` beside it. Serena runs with context `ide` and modes `planning`, `no-onboarding` and `no-memories`. Checked for real on this machine, it offers only `find_declaration`, `find_implementations`, `find_referencing_symbols`, `find_symbol`, `get_diagnostics_for_file`, `get_symbols_overview`, `initial_instructions` and `search_for_pattern`: no editing, shell or memory tool.
- **The settings page** no longer says *not acted on*. graphify reads *local, no AI calls, free*, its cost warning is gone, and so is the wizard's size-based cost estimate (`graphifyCost`).

## What was checked for real

All free: shell-only builds, no agent run.

- **The image:** `lamproom-cli:knowledge` was built from this branch; the shared `lamproom-cli` was not touched. In a box as lr-run-flow makes one (`--network none`, read-only root, uid 1000), the build mapped a TypeScript and Python repo and indexed both languages (`python=1, typescript=1`), with `read_only: true` and the stamp.
- **Serena's tools:** an MCP `tools/list`, in a box and on this machine, listed only the eight read-only tools above.
- **Through the app** (a dev server on a spare port, scratch data and runs folders): a Trusted project built on this machine and a Normal one in a container (`LAMPROOM_IMAGE=lamproom-cli:knowledge`). On each, the card went *never built* → *building…* → *built*; after a commit on `main` it said *stale*, and **Rebuild** built it again. The scheduler started a build of *Scratch* on its own (`-- knowledge: Scratch: never built; build started`). Cloning `octocat/Hello-World` built first and then tried the analyst, which was refused for want of `CLAUDE_CODE_OAUTH_TOKEN`, so nothing was spent.

## Decisions open to your review

Each was taken to keep the first version small; none is hard to change.

| # | Decision | Why | What changing it takes |
|---|---|---|---|
| 1 | *When the base branch moves* watches the local base branch; nothing fetches from GitHub | A build maps the working tree, which a fetch doesn't change, and fetching every 10 minutes would need the network and the GitHub login from the server | Fetch, then build from a temporary worktree at `origin/<base>` and copy the map back |
| 2 | That rule only builds while the base branch is checked out | The map is of the working tree; on a feature branch it would map the feature | On another branch the card says *stale* and waits |
| 3 | A build maps the working tree as it is, uncommitted changes included, and is recorded with HEAD | Runs work in that tree | A map can include work that was never committed |
| 4 | After a clone, the wizard waits for the build before the analyst starts and before it says done | The analyst reads the maps, and the folder lock lets one run at a time | A large repo's Serena index can take minutes. Instead: start the analyst in the background when the build ends, and let the wizard finish at once |
| 5 | graphify's code map is free, so it has no warning. Its paid document extraction (`graphify extract`) isn't built | `graphify update` parses code and calls no AI service | If document extraction is ever wanted, it needs its own setting and cost warning |
| 6 | Serena and graphify reach only runs in the repo's own folder, on this machine or in a Docker box | A task worktree or a subfolder has no index of its own, and a box mounts only its folder; an OpenSandbox box holds the last commit, which never has `.lamproom/` | Index each worktree, or mount the main tree's `.lamproom/knowledge/` read-only into boxes |

## Rulings made on your behalf

| # | Ruling | Why | Cost if wrong |
|---|---|---|---|
| 1 | The box image is `boxImage()`: `LAMPROOM_IMAGE`, else `lamproom-cli` | This branch must not rebuild the shared `lamproom-cli`; it built and tested `lamproom-cli:knowledge` | None; unset, nothing changes |
| 2 | The build's flow is generated per project in the data folder, not a file in `internal/` | Its script depends on the project's settings and tier; one file per project means two starts can't race | A flow you can't read in the repo; it's in `<data>/internal/knowledge/<id>/` |
| 3 | The record keeps the build's run and commit; `stamp.json` is for agents only | An agent in a box can write the repo, so the stamp can't decide what Lamproom does | None |
| 4 | Serena gets Lamproom's own config (`internal/knowledge/serena_config.yml`): index under `.lamproom/knowledge/serena`, no dashboard, no trusted project | A repo's own `.serena/project.yml` must never run its `activation_command` | None |
| 5 | The build deletes `.lamproom/knowledge/`, then writes Serena's `project.yml` before Serena indexes | Without it, Serena writes its own, or uses a `.serena/` the repo ships; after review, also so no repo file survives (I1, I3) | None |
| 6 | Serena indexes only TypeScript/JavaScript and Python (`language_servers` in Lamproom's project file) | With several languages, Serena asks on stdin which to index, and a shell step's stdin is empty; only those servers are in the image | Other languages get no symbols; graphify still maps them |
| 7 | The script exits 0 even when a map fails; its last line says so, and the card reads it | A failed shell step with no fail edge waits at a gate for a person, holding the folder lock (found by a real build) | The runs list shows such a build as *done*; the card says *build failed* |
| 8 | graphify runs from inside `.lamproom/knowledge/` | graphify 0.7.5 writes `graphify-out/manifest.json` into its working folder whatever `GRAPHIFY_OUT` says (found by a real build) | None |
| 9 | `GRAPHIFY_FORCE=1` | A rebuild after code was deleted has fewer nodes, which graphify otherwise refuses to save | None |
| 10 | Serena's list of files it couldn't index is moved from the repo's `.serena/logs/` to `serena/indexing-failures.txt` | Serena hard-codes that path; the repo would gain an untracked `.serena/` | None |
| 11 | In the image, Serena runs the installed `pyright-langserver` (`ls_path`) | Serena runs pyright through `uvx`, which writes into the read-only `/opt/uv/tools` (found in a box) | None |
| 12 | The Serena MCP server gets its env whole: on this machine `PATH`, `HOME` and `SERENA_HOME` from lr-run-flow's; in a box a fixed `PATH` and `HOME=/tmp` | An MCP server may get only the env it is given | A `PATH` without `uvx` leaves the agent without Serena's tools; the run goes on |
| 13 | lr-run-flow writes Lamproom's Serena config before a Trusted run that gets Serena | A project made Trusted after a boxed build has no config on this machine yet | None |
| 14 | The scheduler's first pass is 10 minutes after the server starts | No request waits on it, and a crash loop can't start builds | A due build waits up to 10 minutes after a restart |
| 15 | A refused scheduled build is retried every pass and logged to the server's console each time | Nothing is recorded for a start that never happened | A project whose folder stays locked, or whose box can't start, logs a line every 10 minutes |
| 16 | `dueBuild` takes the project too, beyond the plan's signature | It needs the record and the base branch | None |
| 17 | The card shows when the build started (from its run's name), not when it ended | The record keeps no time, and the stamp isn't read back | The time is a few seconds early |
| 18 | The knowledge card is its own card on the project page, below the analysis card, not inside the *Knowledge* settings page | That page edits a draft shared with the wizard and the app settings page | Status is one card further down |
| 19 | The graphify cost estimate is deleted with its warning | It only priced graphify | None; the wizard still shows the repo's size |
| 20 | Serena's tools are read-only because Lamproom owns the project file, not because of the modes. Corrected after review: the project file applies after the modes, so a repo's `project.local.yml` (`read_only: false`, `included_optional_tools`) put the shell and editing tools back. The build now deletes the folder and writes the file whole, and runs refuse Serena when a `project.local.yml` exists or git tracks anything under `.lamproom/` | Every injected MCP server is pre-approved, so on a Trusted project those tools would run with no approval. Serena has no global setting that ignores a project's tool keys | A file a run writes into `.lamproom/knowledge/serena/` between builds still reaches the next run; a box agent can already do anything in its box, and a Trusted agent asks before writing |
| 21 | After review: a build at a gate reads *failed*, and whoever reads it next stops it (`stopStuck`, from the scheduler and the clone's wait); the clone's wait also has its own 25-minute deadline | The engine opens a `run_failed` gate for any step error (a timeout, a box that won't start), and the run held the folder, kept the wizard on *setting up* and blocked the scheduler for good | A stopped build reads *the run paused* on its run page |
| 22 | After review: agents get the maps only when the recorded build ended *built* or *stale* | A failed build's leftovers, or a repo's own `GRAPH_REPORT.md`, were presented as Lamproom's map | None |

## Review

A fresh reviewer read `098340e..87f0f70`. No critical findings; three important ones, all fixed with a test that failed first:

1. **A repo could turn the read-only Serena into a shell and editor on a Trusted project** through `.lamproom/knowledge/serena/project.local.yml`. Rulings 5 and 20.
2. **A build that timed out or couldn't start held the wizard and the folder lock for good**, at a `run_failed` gate. Ruling 21.
3. **Agents were pointed at any `GRAPH_REPORT.md` as Lamproom's map**, including a repo's own or a failed build's. Rulings 5 and 22.

Its five minor findings are in [[Deferred Work#Knowledge assets]]. It declined to judge:

- Trusted builds running repo code on this machine (allowed by design: Trusted means that).
- Whether Serena's read-only tools can read files outside the repo (not tested).
- Decisions 1–6, as product calls.
- The image's size.
- graphify's report repeating the repo's own text, which reaches the agents' context.

## Left for later

What this work left unfixed or open is in [[Deferred Work#Knowledge assets]], the one list of deferred work.

## Related

- [[Project Settings]]: the *Knowledge assets* row
- [[Analysis Agent Handoff]]: the analyst that runs after the build and reads both maps
- [[Repository Trust And Sandboxing]]: the tiers a build runs in
- [[Project Budget Handoff]]: the cap a build counts toward, at $0
- [[Projects Index]]
