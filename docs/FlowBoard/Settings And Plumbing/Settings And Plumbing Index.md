---
tags: [flowboard, settings-and-plumbing, index]
module: Settings And Plumbing
---

# Settings And Plumbing Index

Settings And Plumbing is FlowBoard's platform layer: the **global switches** (feature map §19) and the **plumbing** that connects screens to data and keeps them live (feature map §20). It covers architecture component #15 (*Settings, draft mode, API*) and the database half of #1 (*Domain model & migrations*). The project side of #1 is in [[Projects Index|Projects]].

> [!important] The one idea to get right first
> The web process and the worker share **nothing but the SQLite file**. Handlers write rows and enqueue jobs; the worker leases them; screens stay live by tailing tables over SSE. Settings reach a run as pure **spec transforms**, and the run records what actually ran. See [[Process Topology]] and [[Settings Overrides And Spec Transforms]].

> [!note] No screen design
> There is no settings mockup, so this set has no Screen or Controls note. See [[Settings Surfaces]].

## Start here

- [[Settings And Plumbing Overview]] — purpose, place in the system, design principles
- [[Settings And Plumbing Glossary]] — terms, including the four meanings of "settings"

## Settings

- [[Settings Catalogue]] — every global setting, who reads it, and where the lists disagree
- [[Draft Mode Setting]] — the global switch, and the places its toggle appears
- [[Sandbox Profile Setting]] — default tier, image, egress allowlist, limits; per-step override
- [[Appearance And Theme]] — light, dark or system, and the default nobody agrees on
- [[Nudge Timing Setting]] — the escalation threshold, seen from settings
- [[Memory Settings Block]] — adapter, scopes, recall cap
- [[Settings Overrides And Spec Transforms]] — how a setting reaches a run, and precedence
- [[Settings Surfaces]] — where settings are shown and changed
- [[Settings Defaults]] — starting values and platform constants

## Plumbing

- [[Thin Route Handlers]] — validate, call core, return JSON; routes never spawn agents
- [[Live Updates]] — SSE that tails SQLite, fewer pollers, connection states
- [[Process Topology]] — web, worker, MCP shim; who opens the database; ports
- [[Code Layout And Dependency Rule]] — `packages/core` imports nothing; two layouts in the sources

## Under the hood

- [[Settings Data Model]] — the `settings` table, named keys, proposed schema
- [[Domain Schema]] — every table, its owning set, and the columns the PRD still lacks
- [[Database And Connection]] — SQLite, pragmas, the singleton, `VIBE_DB_PATH`
- [[Migrations]] — drizzle-kit, migrator on first open, and its gaps
- [[Settings And Plumbing API And Routes]] — the whole API surface mapped to its sets, plus settings endpoints
- [[Settings And Plumbing Storage]] — what lives in SQLite, on disk and in the browser
- [[Environment And Configuration]] — env vars, `.env.local`, files, CLI isolation

## Direction

- [[Settings And Plumbing Roadmap]] — v1 scope, backlog, beyond the PRD, ideas, out of scope
- [[Settings And Plumbing Open Questions]] — 30 places the sources disagree or leave a gap
- [[Settings And Plumbing Sources]] — where every fact comes from

## Related

- [[Cost And Control Index]] — draft mode's effect on cost
- [[Execution Index]] — the runner that applies the transforms
- [[Monitor Index]] — the run event stream
- [[Escalation And Notifications Index]] — the escalation threshold
- [[Projects Index]] — projects, repos, check command
