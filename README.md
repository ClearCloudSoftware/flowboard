# FlowBoard

**A local-first control room for the AI coding agents you already run.**

FlowBoard is a Kanban board where each column isn't a human workflow stage ("In Progress") but an
**automated AI‑agent step** — "Research", "Plan", "Build", "Review". A task flows through a graph of these
steps, each one a headless coding‑agent session with its own model, budget, and guardrails. Some steps
advance on their own; others pause for your approval or a quick question. It runs on your machine, over your
repositories, for one developer.

## The problem it solves

Most of us already run AI coding agents the same way: one terminal, one session, watched by hand, on our own
laptop, with full permissions. That's fine at first, and quietly expensive:

- **Invisible cost.** Agent spend is one opaque line — no idea what a task or a stage actually cost, and a
  real slice is wasted on runs that loop or get thrown away.
- **Unsupervised risk.** To avoid babysitting every prompt, agents run unsandboxed over untrusted content
  (dependency code, issue text, fetched web pages) — one prompt injection from a leaked secret or a wrecked repo.
- **Serial and hand‑held.** Research → plan → build → review is a pipeline, but it's run one step at a time
  with a person tethered to the terminal.

## The aim

Turn running coding agents from *babysitting a terminal* into *operating a board* — making agent work
**visible, controllable, and safe to leave running**:

- **Visible** — a dollar figure on every stage and every task, plus a wasted‑spend number you can actually attack.
- **Controllable** — per‑step budgets, model and effort choices, human approval gates, and independent steps
  that run in parallel.
- **Safe** — each step runs in a sandbox with a default‑deny network wall, so an autonomous agent can't reach
  or leak what it shouldn't.
- **Provider‑agnostic** — every model call goes through an agent CLI (Claude Code today), behind one seam, so
  other tools (e.g. Codex) can slot in without reworking your flows.
- **Local‑first** — your machine, your repos, your keys; single‑user, no accounts, no multi‑tenancy.

## How it works

A **flow** is a recipe of steps wired into a graph. A **task** enters the backlog, gets promoted, and then
moves through the flow — the board shows where it is, live.

```
research → plan ─┬─→ build ─┬─→ review ──→ summarize
                 └─→ tests ─┘      └─ ✋ waits for your approval · ↺ a failed review loops back to build
```

- Independent steps **fan out** and run at once; a later step **joins** and waits for all of them.
- A step can **pause** for your approval, or **ask you a question** — answered in one fast **inbox**, and
  escalated to chat (e.g. Slack) if it waits too long.
- A failed step can **loop back** to be retried, up to a safe limit.
- Everything a step produces (a brief, a plan, a summary) is a **real file** in the task's own isolated
  workspace, tracked in git — so it's easy to read, diff, and review.

## Core concepts

- **Flow** — a versioned recipe (a graph of steps). Editing it creates a new version; a running task keeps the
  version it started on, so edits never disrupt work in progress.
- **Step** — one job for one agent: what to do, which model, how hard to think, how much it may spend, and
  whether it needs your approval.
- **Task** — one piece of work moving through a flow, in its own private copy of the code.
- **Run** — one attempt at a step; retries create further attempts.
- **Artifact** — a file a step produces, and the contract the next step can rely on.

## Status

Early. This is the **v3 rebuild** — the first attempt stalled, and the lessons are captured in the
[rebuild backlog & post‑mortem](docs/old/REBUILD-BACKLOG.md). The repository currently holds the **design
corpus**; the application itself is being (re)built.

## Docs

- **[Feature map](docs/feature-map.md)** — a plain‑English tour of every component, and a space to braindump ideas.
- **[Mockups](docs/mockups/)** — clickable, self‑contained screens built ahead of the code, each with a
  field guide: the [monitor](docs/mockups/monitor.html), the [flow designer](docs/mockups/flow-designer.html),
  and the [task detail](docs/mockups/task-detail.html).
- **[Architecture & genericization](docs/old/architecture/README.md)** — how the pieces fit, and how the
  agent‑CLI integration is made provider‑agnostic (Claude Code / Codex behind one seam).
- **[Sandboxing](docs/old/architecture/08-sandboxing.md)** — running agents safely: containers, network egress,
  and the threat model.
- **[Build spec (PRD)](docs/old/PRD.MD)** — the full specification.
- **[Rebuild backlog](docs/old/REBUILD-BACKLOG.md)** — what went wrong the first time, and the plan for v3.
