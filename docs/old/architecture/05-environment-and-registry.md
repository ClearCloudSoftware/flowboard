# 05 — Environment ports & registries

Where runs live (workspace + artifact store), what capabilities they mount (skills/agents), and where tasks
come from (ingestion). Three ports, each turning a hardwired assumption in the spec into a swappable adapter.

← back to [README](./README.md) · ports: [01](./01-ports.md)

---

## 11. Artifact store & workspace → two ports

- **Role:** files under `<worktree>/.vibe/task-<id>/` (PRD §6), and a git worktree per task for isolation
  (PRD §11).
- **Seam:** two concerns fused today. Separate them:
  - **[Workspace](./01-ports.md#workspace)** — create/destroy/cwd + `execHost`. Isolation lifecycle, and where
    processes run against it.
  - **[ArtifactStore](./01-ports.md#artifactstore)** — put/scan/resolve path/metadata. The DB stores only
    type + path + bytes; the bytes live in the store.
- **Genericize:**
  - Workspace adapters climb an **isolation ladder**: `host` (worktree) → `container` → `gvisor` → `microvm`
    (Firecracker/Kata). Beyond fixing the shared-worktree collision (PRD §11), the sandboxed tiers add a
    *security* boundary — default-deny egress allowlist, dropped capabilities, non-root, resource limits —
    around a headless agent that reads untrusted content. The Workspace hands the runner an **`ExecHost`**
    ([01](./01-ports.md#exechost-and-sandboxing)) so *where* a process runs is decoupled from *which* provider
    runs it: any provider × any tier. **`bypassPermissions` requires a sandbox tier.** Full design:
    [08 — sandboxing](./08-sandboxing.md).
  - ArtifactStore stays disk+git by default (agents read files natively, git makes them diffable — the whole
    rationale of §6); a remote/content-addressed adapter enables multi-machine later.
- **Composes with:** the runner ([03 §6](./03-execution-substrate.md#6-runner--execution-host)) runs in the
  Workspace `cwd`; the artifact contract ([02 §2](./02-core-and-engine.md#2-flow-definition--validation)) is
  enforced over the ArtifactStore.
- **Idea:** contract validation is store-agnostic — it checks the artifact **type graph** (does an ancestor
  produce what this step requires?), never the bytes. Keep it that way and any store works, local or remote.
  Worktree hygiene: append `.vibe-worktrees/` to `<repo>/.git/info/exclude` so the parent repo stays clean;
  cleanup only via explicit action, only when done/cancelled/failed.
- **Artifacts vs memory** ([MemoryStore, 09](./09-memory.md)): two different jobs, don't conflate them. An
  **artifact** is the *verbatim, within-task* output — a real file on disk, git-tracked, diffable, the contract
  the next step reads. **Memory** is the *cross-task distillation* — the facts worth carrying to the next task,
  extracted and de-duplicated by Mem0. Artifacts stay the source of truth inside a task; memory is what survives
  it. The runner *writes* memory *from* declared artifacts and answers (never the reverse, and never from raw
  agent output), so the artifact contract stays the authority and memory is a downstream, auditable projection.

## 13. Skill/Agent registry → Capability packs

- **Role:** installable skills (today Claude plugin dirs) and agent definitions (prompt + model presets).
- **Seam:** a "skill" is *one packaging* of a general **capability**. A Claude plugin dir
  (`.claude-plugin/plugin.json` + `skills/<slug>/SKILL.md`, mounted via `--plugin-dir`, invoked as `/slug`) is
  the Claude adapter's format. Agents are already provider-neutral except default model ids (use logical ids,
  [01](./01-ports.md#logical-model-ids)).
- **Genericize:**

  ```ts
  interface CapabilityPack {
    id: string;
    provider: AgentProvider['id'];
    mount(spec: RunSpec): void;   // Claude: add plugin dir; other: inject system prompt / native config
  }
  ```

  The registry stores the pack; the adapter knows how to mount it. Installing "from a GitHub URL" becomes a
  provider-tagged operation; the same logical capability (`grill-me`, `code-review`) can have a pack per
  provider.
- **Composes with:** the provider ([03 §5](./03-execution-substrate.md#5-agentprovider-abstraction)) receives
  packs in `RunSpec.capabilities`; the flow editor references them by id; validation checks the pack's provider
  matches the step's provider.
- **Idea:** seed skills as real local plugin dirs so the question loop and flow engine are testable without
  GitHub access (`grill-me` uses `ask_user_batch` and honours `no_answer_yet`; `code-review` calls
  `set_outcome`). These double as the reference implementation for a second provider's pack format.

## 14. Ingestion → TaskSource port

- **Role:** markdown backlog → tasks, idempotent on `(project_id, import_key)` (PRD §15–16).
- **Seam:** the backlog's whole pain (import rewritten three times, duplicates on re-import) reduces to a
  **contract problem** with two rules:
  1. **One parser contract.** A deterministic parser handles both shapes — `##` heading = task, and
     heading-as-category with `- **Title** …` bullets = tasks. The agent path exists for genuinely messy files
     only, and its output is normalized through the *same* function.
  2. **Server-derived `import_key`.** `frontmatter/inline id` → else `slugify(title)`. **Never trust the
     agent's key** — it drifted between runs (`filter-list-by-status` vs `filter-the-list-by-status`) and that
     is what duplicated tasks.
- **Genericize:** [TaskSource](./01-ports.md#tasksource) adapters — **markdown** (now) → **GitHub Issues,
  Linear, Jira, webhook**. The `backlog-importer` agent is simply the "messy file" adapter. `POST
  /api/import/backlog` accepts `path` (server file) or `content` (browser → temp file → `import_backlog` job →
  worker deletes it), returns `{queued}`, and reports which path ran (deterministic vs agent).
- **Composes with:** upserts into the domain model
  ([02 §1](./02-core-and-engine.md#1-domain-model--migrations)); the board's Import button shows job progress
  (queued → running → "6 created") so the user isn't guessing.
- **Idea:** re-import twice = 0 created, N updated is the *acceptance test* for the whole port — make it a
  scripted check over both file shapes, since this is the feature that broke repeatedly.
