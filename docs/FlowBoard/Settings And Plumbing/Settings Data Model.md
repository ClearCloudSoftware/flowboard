---
tags: [flowboard, settings-and-plumbing, settings, data-model]
module: Settings And Plumbing
---

# Settings Data Model

## The table

PRD §5 gives settings one generic key/value table:

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

That is the whole schema. No source lists the keys, their types or their encoding. The keys below come from other places that refer to a setting by name.

## Keys the sources name

| Key as written | Shape the sources describe | Source |
|---|---|---|
| draft mode | a toggle | PRD §13, `06` §15 |
| `settings.escalation_threshold_ms` | milliseconds, default 5 min | `04` §10, backlog 6.1 |
| escalation threshold (minutes) | minutes | `06` §15, backlog 8.3 |
| theme | `light` / `dark` / `system` | `06` §15, backlog 8.3 |
| `sandbox_profile` | *"tier, image, egress allowlist, limits"* | PRD §11.1, backlog 1.1 |
| `memory` block | *"adapter id, endpoint / key ref, enabled scopes, recall limit, `max_recall_chars`"* | PRD §11.2, `09` |
| `settings.memory.max_recall_chars` | integer, default 6,000 | PRD §7 |

`settings.memory.max_recall_chars` is a dotted path into a block, so at least the memory block is structured, not a flat scalar.

## Typed shapes from the ports

Two settings have typed shapes in the port sketches:

```ts
// 01-ports.md, reference/core/ports/exec-host.ts
type IsolationTier = 'host' | 'container' | 'gvisor' | 'microvm';
interface SandboxProfile {
  tier: IsolationTier;
  image?: string;
  egressAllow: string[];   // default-deny; model endpoint (via the credential-injecting proxy) + registries; no git remote. [] = offline
  limits?: { memoryMb?: number; cpus?: number; pids?: number; wallClockMs?: number };
  mounts?: Array<{ source: string; target: string; readOnly?: boolean }>;  // never host secrets / docker.sock
  env?: Record<string, string>;   // run-scoped; never a real credential
  nonRoot?: boolean;              // default true; bypassPermissions requires it
}

// 01-ports.md, reference/core/ports/memory-store.ts
interface MemoryStore {
  id: 'mem0' | 'mem0-cloud' | 'local' | 'none';
  ...
}
```

## Proposed encoding

> [!example] Proposal — not in any source
> One row per setting, `value` as JSON, validated by one zod schema shared by the route and the worker:
>
> ```ts
> const Settings = z.object({
>   draft_mode: z.boolean().default(false),
>   theme: z.enum(['light', 'dark', 'system']),
>   escalation_threshold_ms: z.number().int().min(60_000).max(1_800_000).default(300_000),
>   sandbox_profile: SandboxProfileSchema,
>   memory: z.object({
>     adapter: z.enum(['none', 'local', 'mem0', 'mem0-cloud']).default('none'),
>     endpoint: z.string().optional(),
>     key_ref: z.string().optional(),
>     scopes: z.array(z.enum(['user', 'project', 'agent', 'task'])),
>     recall_limit: z.number().int().optional(),
>     max_recall_chars: z.number().int().default(6000),
>   }),
> });
> ```
>
> The 1–30 minute range comes only from the old design prototype's `escalationMinutes` tweak (`min:1, max:30`). The draft-mode default and the theme default are not stated anywhere. Listed in [[Settings And Plumbing Open Questions]] #5.

## What the run records

Settings are not copied onto the task. The run records the values a transform resolved:

| Column | Holds | Source |
|---|---|---|
| `runs.model`, `runs.effort` | the model and effort that actually ran, after draft mode | `02` §1, backlog 1.1, 3.2 |
| `runs.sandbox` | the tier that actually ran | PRD §11.1, backlog 1.1, 3.5 |

PRD §5's `runs` table has none of the three. See [[Domain Schema]].

There is no settings history. Nothing records who changed a setting or when. See [[Settings And Plumbing Open Questions]] #11.

## Related

- [[Settings Catalogue]]
- [[Settings Defaults]]
- [[Settings And Plumbing Storage]]
- [[Domain Schema]]
- [[Settings And Plumbing API And Routes]]
