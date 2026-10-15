---
tags: [flowboard, intake-and-import, concept, agent, adapter]
module: Intake And Import
---

# Backlog Importer Agent

An internal agent that reads a markdown file and returns tasks as JSON. In v3 it is the fallback for files the deterministic parser cannot read.

> *"The import endpoint also uses an internal **`backlog-importer`** agent — part of the import feature, not a seed, so it never appears in the library or the step picker. Its job: given a markdown file path, produce a JSON array of `{ import_key, title, body, acceptance_criteria?, non_goals? }` (the last two from "Acceptance criteria" / "Non-goals" sub-sections when present)."* — PRD §15

## Its role, source by source

| Source | Role |
|---|---|
| PRD §15 | *"The import endpoint also uses"* it. It also derives the key. |
| backlog 7.3 | *"Agent path exists for messy files only."* *"Agent output is normalised through the same function."* |
| backlog D6 | *"Deterministic parser supports headings **and** bullets; agent optional"* |
| `05` §14 | *"The `backlog-importer` agent is simply the "messy file" adapter."* |
| `01-ports.md` | *"the `backlog-importer` agent is the "messy file" adapter"* |
| drawio *FlowBoard ideation* | *"D6 · Deterministic parser / Supports headings and bullets; agent-assisted parse optional."* |
| drawio *Harness architecture* | *"Backlog import / backlog-importer agent → {import_key, title, body, acceptance_criteria, non_goals} → upsert"* |

The *Harness architecture* card draws only the agent path. Which path is the default, and what makes a file *messy*, are [[Intake And Import Open Questions]] #3.

## How it is invoked

Backlog 7.3 (**FIX**): *"Agent invocation: haiku, `--tools ""`, extract the first `[`…`]`; fall back to the parser on any failure and **report which path ran**."*

- **Model**: haiku.
- **Tools**: none (`--tools ""`). The agent reads the file it is given, not the repo.
- **Output**: the first JSON array in its reply.
- **On failure**: the deterministic parser runs instead.
- **Report**: which path ran. `05` §14: the endpoint *"reports which path ran (deterministic vs agent)"*.

Backlog 7.3 (**BUG**): *"Isolate the importer from global hooks (see 0.1)."* Story 0.1 is the general problem: *"Decide how to isolate headless runs from `~/.claude` hooks/settings (e.g. `--settings` with an empty file, or `CLAUDE_CONFIG_DIR`)"*. Decision D5 recommends *"Empty `--settings` file per run"*. See [[Import Trust And Isolation]].

The backlog's header lists *"nine headless `backlog-importer` runs"* among the sessions it was derived from.

## Not a seed, not in the library

- Backlog Story 1.2: *"`backlog-importer` is internal to import (Story 7.3), not a seed."*
- Capability Library decision D30: *"`backlog-importer` is internal to markdown import and never appears in the library"*. [[Seeded Capabilities]]: *"never shown in the library or the step picker, so it cannot be removed out from under import"*.
- PRD §5 has `agents.is_builtin`, but no source says whether `backlog-importer` has an `agents` row at all.

## Its key is never trusted

Everything it returns goes through the same `import_key` function as the parser (backlog 7.3). See [[Import Key]].

## Related

- [[Intake And Import Index]]
- [[TaskSource Port]]
- [[Markdown Task Source]]
- [[Import Job Lifecycle]]
- [[Import Trust And Isolation]]
- [[Seeded Capabilities]]
