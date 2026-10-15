---
tags: [flowboard, capability-library, data-model]
module: Capability Library
---

# Capability Data Model

Three layers of the model exist in the sources: the **v1 PRD schema**, the **architecture's generalisation**, and the **record shape the mockup implies**. The [[Capability Library Decisions|2026-10-15 decisions]] reconcile them into the v1 schema below; the sections after it are kept as source history.

## v1 schema (decided)

```sql
CREATE TABLE plugins (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,          -- plugin.json name, else repo name
  source       TEXT NOT NULL,          -- 'seed' | 'git'
  repo_url     TEXT,                   -- any git URL, incl. file://; null for seeds
  commit_sha   TEXT NOT NULL,          -- installed commit; seeds: FlowBoard's sha
  has_mcp      INTEGER NOT NULL,       -- ships .mcp.json → amber
  has_hooks    INTEGER NOT NULL,       -- ships hooks/ → amber
  installed_at INTEGER NOT NULL,
  UNIQUE (project_id, name)
);

CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  plugin_id     TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,         -- invoked as /<plugin.name>:<slug>
  description   TEXT,
  allowed_tools TEXT,                  -- JSON array, from SKILL.md
  UNIQUE (plugin_id, slug)
);

-- agents: the PRD table below, plus project_id,
--   UNIQUE (project_id, slug); default_model holds a Claude alias (opus|sonnet|haiku)

-- step_defs: kind becomes 'ai' | 'shell' | 'manual'; an 'ai' step sets agent_id, skill_id or both (D27)
--             + extra_plugin_ids TEXT   -- JSON array of plugins.id, mounted alongside the skill's plugin
-- tasks:     + capability_pins  TEXT   -- JSON {plugins: {id: sha}, agents: {id: <agent row>}}, set at task start
```

| Choice | Why | Decision |
|---|---|---|
| Plugin row, skills as children | The plugin dir is what gets mounted, updated and removed | D4 |
| No `install_path` column | Derived: `<project>/.flowboard/skills/<name>/<commit_sha>/` | D5 |
| No `frontmatter` column | The disk is the source of truth; parse `SKILL.md` when shown | D23 |
| `UNIQUE (plugin_id, slug)`, not global | Skills are invoked fully qualified, so two plugins may share a slug | D16 |
| `capability_pins` as JSON on `tasks` | GC reads it with `json_each` over non-terminal tasks; a `task_pins` table only pays off if that query gets slow | D10, D11 |
| No `provider` / packs table | v1 is Claude-only; `CapabilityPack` stays in the port | D1, D2 |

`used` is a query, never stored: steps in each flow's latest version, plus versions pinned by a non-terminal task, whose skill belongs to the plugin or whose `extra_plugin_ids` contain it (D17).

## v1 PRD schema (SQLite)

As the PRD first specified it. The PRD now carries the decided schema above.

```sql
CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,   -- the slash command, e.g. 'grill-me'
  name          TEXT NOT NULL,
  description   TEXT,
  source        TEXT NOT NULL,          -- 'local'|'github'
  repo_url      TEXT,
  git_ref       TEXT,
  install_path  TEXT NOT NULL,          -- plugin dir passed to --plugin-dir
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
  provider: ProviderId;
  mount:
    | { kind: 'plugin_dir'; path: string }
    | { kind: 'system_prompt'; text: string }
    | { kind: 'native'; config: Record<string, unknown> };
}

export interface RunSpec {
  prompt: PromptParts;
  model: string;                       // logical id
  effort?: Effort;
  toolPolicy?: { allow?: string[]; deny?: string[] };
  capabilities?: CapabilityPack[];     // skills / plugins to mount
  cwd: string;
  ...
}
```

`ProviderId` is `'claude-code' | 'codex' | 'replay' | (string & {})` — an open set.

> [!warning] Two shapes for `CapabilityPack`
> `05-environment-and-registry.md` §13 sketches it with a method — `provider: AgentProvider['id']; mount(spec: RunSpec): void;` — while `agent-provider.ts` makes `mount` a data union the adapter interprets. The union suits a registry that stores packs as rows. **Decided: the data union** ([[Capability Library Decisions|D2]]).

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
  packs: Partial<Record<Provider, { ver: string; at: string }>>; // one per provider; agent packs use ver '—'
  update?: { ver: string; note: string };  // upstream moved past installed commit
  src?: string;                       // 'github.com/team-sec/fb-secret-scan'
  commit?: string;                    // installed commit, e.g. '7d3e0b1'
  tools?: string[];                   // tools it may use
  used: [flow: string, version: string, step: string][]; // '—' = whole pack

  // skill
  command?: string;                   // '/secret-scan'
  manifest?: [cls: string, text: string][]; // SKILL.md as highlight tuples, not a parsed object

  // agent
  model?: string;                     // logical id
  effort?: 'low' | 'medium' | 'high';
  prompt?: string;

  // pack
  contains?: { skills: string[]; agents: string[]; flows: string[] };
}
```

The install dialog's candidate (`CANDIDATE`) has the same shape plus `url`, the pasted repository.

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

- [[Capability Library Decisions]]
- [[Capability Versus Provider Pack]]
- [[Capability Runtime Mounting]]
- [[Capability Library API And Routes]]
- [[Capability Library Open Questions]]
