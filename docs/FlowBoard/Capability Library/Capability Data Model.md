---
tags: [flowboard, capability-library, data-model]
module: Capability Library
---

# Capability Data Model

Three layers of the model exist in the sources: the **v1 PRD schema**, the **architecture's generalisation**, and the **record shape the mockup implies**. They are not yet reconciled — see [[Capability Library Open Questions]].

## v1 PRD schema (SQLite)

```sql
CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,   -- the slash command, e.g. 'grill-me'
  name          TEXT NOT NULL,
  description   TEXT,
  source        TEXT NOT NULL,          -- 'local'|'github'
  repo_url      TEXT,
  git_ref       TEXT,
  install_path  TEXT NOT NULL,          -- directory passed to --plugin-dir / --add-dir
  frontmatter   TEXT,                   -- JSON
  installed_at  INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE agents (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  system_prompt  TEXT NOT NULL,
  default_model  TEXT NOT NULL DEFAULT 'sonnet',
  default_effort TEXT NOT NULL DEFAULT 'medium',
  allowed_tools  TEXT,                  -- JSON array
  is_builtin     INTEGER NOT NULL DEFAULT 0,
  ...
);
```

Step definitions reference them:

```sql
CREATE TABLE step_defs (
  ...
  kind      TEXT NOT NULL,              -- 'skill' | 'agent' | 'shell' | 'manual'
  skill_id  TEXT REFERENCES skills(id),
  agent_id  TEXT REFERENCES agents(id),
  ...
);
```

Backlog gap (Story 7.1): *"Show stored frontmatter or stop storing it."*

## Architecture generalisation

`02-core-and-engine.md`: **`skills` gains `provider` + `format`** — a Claude plugin dir is one packaging of a capability. Packs are passed to the provider in `RunSpec.capabilities`:

```ts
export interface CapabilityPack {
  id: string;
  provider: ProviderId;                // 'claude-code' | 'codex' | 'replay'
  mount:
    | { kind: 'plugin_dir'; path: string }
    | { kind: 'system_prompt'; text: string }
    | { kind: 'native'; config: Record<string, unknown> };
}

export interface RunSpec {
  prompt: PromptParts;
  model: string;                       // logical id
  effort?: Effort;
  allowedTools?: string[];
  capabilities?: CapabilityPack[];     // skills / plugins to mount
  cwd: string;
  ...
}
```

## Record shape implied by the mockup

```ts
type Kind = 'skill' | 'agent' | 'pack';
type Provider = 'claude' | 'codex';

interface Capability {
  id: string;                         // 'code-review', 'architect', 'Delivery pack'
  kind: Kind;
  author: string;                     // '@flowboard/core', '@team-sec'
  seeded?: boolean;                   // ships with FlowBoard
  desc: string;
  packs: Partial<Record<Provider, { ver: string; at: string }>>; // one per provider
  update?: { ver: string; note: string };  // upstream moved past installed commit
  src?: string;                       // 'github.com/team-sec/fb-secret-scan'
  commit?: string;                    // installed commit, e.g. '7d3e0b1'
  tools?: string[];                   // tools it may use
  used: [flow: string, version: string, step: string][]; // '—' = whole pack

  // skill
  command?: string;                   // '/secret-scan'
  manifest?: unknown;                 // parsed SKILL.md

  // agent
  model?: string;                     // logical id
  effort?: 'low' | 'medium' | 'high';
  prompt?: string;

  // pack
  contains?: { skills: string[]; agents: string[]; flows: string[] };
}
```

### Derived values

| Value | Derivation |
|---|---|
| Rail dot | `update ? 'up' : used.length ? 'in use' : 'orphan'` |
| Provider gaps | providers with no entry in `packs` |
| Removable | `used.length === 0` |
| Status-bar coverage | count of capabilities with a `codex` pack ÷ total |
| Network tool | `tools ∩ {WebFetch, WebSearch, Bash}` |

> [!note] `used` is derived in a real system
> The mockup stores `used` on the record. In a real implementation it is a query over step definitions in every flow version that references the capability — it should not be stored.

## Related

- [[Capability Versus Provider Pack]]
- [[Capability Runtime Mounting]]
- [[Capability Library API And Routes]]
- [[Capability Library Open Questions]]
