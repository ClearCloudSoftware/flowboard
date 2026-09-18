# Reference implementations

Illustrative code for the architecture in [`../architecture/`](../architecture/). Not the shipped app — a
concrete, runnable sketch of the ports and two example adapters, so the design in
[01 — the ports](../architecture/01-ports.md) and [07 — ports in practice](../architecture/07-ports-in-practice.md)
is more than prose.

```
core/
  ports/
    agent-provider.ts     # ⭐ the swappable-CLI seam (imports events.ts)
    events.ts             # shared Usage + NormalizedEvent
    notifier.ts           # escalation channel port
    workspace.ts          # per-task isolation port (+ TaskRef)
    artifact-store.ts     # step-output store port
    task-source.ts        # ingestion port
    memory-store.ts       # agentic memory port (additive) — see ../architecture/09-memory.md
  hitl/
    question.ts           # the one question schema (MCP / inbox / Slack)
adapters/
  agent/replay/replay-provider.ts       # implements AgentProvider — zero-spend test double
  source/markdown/markdown-source.ts    # implements TaskSource — one parser, stable import_key
```

## Run the two self-checks

No toolchain required — Node 24 strips the types and runs them directly:

```
node docs/reference/adapters/agent/replay/replay-provider.ts     # -> ReplayProvider self-check passed
node docs/reference/adapters/source/markdown/markdown-source.ts  # -> MarkdownTaskSource self-check passed
```

`markdown-source.ts` doubles as the fix for the import bug the first build hit three times (backlog Story 7.3):
one parser for both file shapes, and an `import_key` that is always server-derived and stable across runs.

## Notes

- The standalone files use **relative imports** (`../../../core/ports/…`) so they run with zero config. The
  snippets in [07](../architecture/07-ports-in-practice.md) use the project's `@/` alias, illustrating the built
  app rather than this reference tree.
- Cross-file imports here are `import type` only, so at runtime these depend on **nothing but Node builtins** —
  which is why bare `node` can run them.
- Avoid TS features that need a transform (e.g. parameter properties, enums) so strip-only runtimes keep working.
