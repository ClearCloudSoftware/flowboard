---
tags: [flowboard, workspaces, data-model]
module: Workspaces
---

# Workspaces Data Model

Workspaces add no table. They use a few columns on existing tables, a settings key, and the port types.

## Columns

| Table.column | Type | Meaning | Source |
|---|---|---|---|
| `projects.repo_path` | `TEXT NOT NULL` | *"absolute path to the git repo"*; the repo every worktree is cut from | PRD §5 |
| `tasks.branch_name` | `TEXT` | the task's branch; nullable, so presumably null until created *(inference)* | PRD §5, §11 |
| `tasks.worktree_path` | `TEXT` | the task's folder; every run's `cwd` | PRD §5, §11 |
| `tasks.status` | `TEXT NOT NULL` | decides when cleanup may be offered | PRD §5 |
| `tasks.flow_id` | `TEXT` | *"null while in backlog, pinned on promotion"* (PRD §5, also PRD §12 and backlog 2.1), the same moment the worktree is made. PRD §4 (*"version-pinned at task start"*), the architecture README (*"a task pins its version at start"*), the drawio (*Start task / pin flow version*) and feature map §3 pin at **start** instead. See [[Workspaces Open Questions]] #1 and [[Flow Design Open Questions]] #7 | PRD §4, §5, §12; backlog 2.1; architecture README; drawio; feature map §3 |
| `artifacts.path` | `TEXT NOT NULL` | *"absolute path on disk"*, inside the worktree | PRD §5 |
| `runs.sandbox` | — | *"records the tier that actually ran"* | PRD §11.1, backlog 1.1, drawio *SQLite* card (*"runs (… sandbox)"*) |
| `step_defs.sandbox_profile` | — | *"an optional `step_defs.sandbox_profile` override"* | backlog 1.1 (**NEW**) |
| `settings` key `sandbox_profile` | `settings.value TEXT NOT NULL` (PRD §5's generic key/value table); the encoding is not given | *"tier, image, egress allowlist, limits"* | key named in PRD §11.1, backlog 1.1 and the drawio *SQLite* card (*"settings (memory, sandbox_profile)"*) |

`runs.sandbox` and `step_defs.sandbox_profile` are not in the PRD §5 SQL. They come from §11.1's prose, backlog 1.1 and the drawio. Their types are not given. See [[Sandboxing Data Model]] and [[Sandboxing Open Questions]] #8 and #9.

PRD §11 says *"Store both paths on the task."* Only one of the two values is a path; the other is a branch name.

## Types

From `docs/old/reference/core/ports/`:

```ts
interface TaskRef { id: string }                       // workspace.ts, shared with ArtifactStore
interface WorkspaceHandle { path: string; branch?: string }
type IsolationTier = 'host' | 'container' | 'gvisor' | 'microvm';   // exec-host.ts
```

`RunSpec` (`agent-provider.ts`) carries the workspace into a run: `cwd: string` (*"Workspace path (the Workspace port owns its lifecycle)."*) and `exec?: ExecHost`.

```mermaid
erDiagram
  projects ||--o{ tasks : has
  tasks ||--o{ artifacts : "files in its worktree"
  tasks ||--o{ step_instances : has
  step_instances ||--o{ runs : has
  projects {
    text repo_path
  }
  tasks {
    text branch_name
    text worktree_path
    text status
  }
  artifacts {
    text path
  }
  runs {
    text sandbox
  }
```

## Not modelled

- No record of **cleanup**: no `cleaned_up_at`, no status. After cleanup, `worktree_path` still holds a path to nothing. *(Observation.)*
- No **base commit** or base branch on the task.
- No workspace **adapter id** per project or task.

See [[Workspaces Open Questions]].

## Related

- [[Workspaces Index]]
- [[Workspace Port]]
- [[Task Data Model]]
- [[Workspaces Storage]]
