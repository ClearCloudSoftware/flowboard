---
tags: [flowboard, projects, open-questions]
module: Projects
---

# Projects Open Questions

Every place the sources disagree about projects or leave a gap. A **proposal** is a suggestion made in these notes, not a decision.

## What a project is

### 1. One repo or several per project?

The schema gives a project one `repo_path` (PRD §5). The tracker's scope says *"Projects, repos"*. The monitor mockup shows tasks from six repos (`flowboard/api`, `core`, `docs`, `providers`, `runner`, `web`) on one screen with one flow; the task-detail mockup shows *repo & branch*. Is each repo a project, or can a project span repos (a multi-repo product, a monorepo subfolder)? See [[Project Repository]], [[Monitor Open Questions]] #2.

### 2. What identifies a repo?

PRD: a local absolute path. Mockups: an `owner/name` label (`flowboard/api`). Drawio: *"project remote"* on GitHub. None of the three is stored alongside the others. **Proposal:** keep `repo_path` as the identity and derive a display label from the path's last segment, or from the `origin` remote when there is one.

### 3. What does the create form ask for, and in what order does registration run?

Feature map §1: *"name it and choose which recipe"*. Backlog Story 1.3: a flow-type select. The schema also needs `slug` and `repo_path`. No source puts the repo path, slug or check command on the form, or orders the steps (insert, flow v1, default flow, seed copy, exclude file). **Proposal** in [[Creating A Project]].

### 4. How is the slug made, and can it change?

`slug TEXT NOT NULL UNIQUE` (PRD §5); pages use it, the API uses `id`. Derivation, collision handling and renames are not stated; nor is how a page resolves slug → id. **Proposal:** `slugify(name)`, suffix on collision, editable on create only; add `GET /api/projects/by-slug/:slug`. See [[Projects API And Routes]].

### 5. What makes a repo path valid?

Only *"absolute path to the git repo"* (PRD §5) and *"a folder on your machine that holds a git repository"* (feature map §1). Open: relative paths, a folder that is not a repo (only the seed is *"auto‑`git init`ed"*), a path inside another repo, two projects on the same repo (`repo_path` is not unique), and a repo that later moves (breaking `tasks.worktree_path` and plugin dirs). **Proposal:** resolve to absolute, require `git -C <path> rev-parse --show-toplevel`, store the top level, reject a duplicate. See [[Project Rules And Edge Cases]].

### 6. Where is the check command set, and what if there is none?

`check_command` is nullable and *"what a shell check step runs"* (PRD §5). No form, settings section or endpoint sets it, except the seed (PRD §15). A shell step with a null `command` and a project with a null `check_command`: fail at design time, fail at run time, or pass? **Proposal:** an optional field on create and edit, and a design-time validation error when a shell step would resolve to no command. See [[Project Check Command]].

### 7. Default, active and adopted flow

PRD §5 `default_flow_id`; PRD §13 *"the project's active flow"*; the flow-designer guide *"adopted"* and *"points your project at it"*. Are they one column? Does `PUT /api/flows/:id` move it (the PRD does not say; the guide does)? What does *Empty* create? What does promoting do with a null default? Which columns does the board draw for tasks pinned to an older version or another named flow? `default_flow_id` has no foreign key, so it can name another project's flow. See [[Project Default Flow]], [[Flow Design Open Questions]] #7.

### 8. What does registering copy in?

PRD §15 and Capability Library D6 copy seed **plugins** into the project's store on registration. `agents.project_id` is `NOT NULL`, so the six seed **agents** need rows per project too; D12 says seeded agents *"take the same path"*, but no source says they are inserted at registration. See [[Creating A Project]].

## Lifecycle

### 9. Deleting a project

No route or UI. `ON DELETE CASCADE` on `flows`, `tasks`, `plugins`, `agents` would erase `runs`, which `02` §1 wants to be an *"append-only usage journal"*. A database delete leaves worktrees, the plugin store and exclude lines on disk, and `memories` rows (no FK). Running tasks have no stated fate. **Proposal:** no delete in v1; later, refuse while a task is non-terminal and archive instead. See [[Project Lifecycle And Deletion]].

### 10. Editing and archiving

No `PATCH`, no rename, no archive flag (flows have `is_archived`; projects do not). **Proposal:** `PATCH /api/projects/:id { name?, checkCommand?, defaultFlowId? }`.

## The projects list

### 11. What is "this week"?

*"this week's spend"* (PRD §13); *"decide rolling 7 d vs calendar week"* (backlog Story 1.3 **DEC**). Shared with [[Cost And Control Open Questions]].

### 12. What does a card show?

*"task counts by status"* — all seven `tasks.status` values, or a subset? No layout. **Proposal** in [[Projects List Page]], borrowing the handoff's board header.

### 13. Is `/` the home page?

PRD §13 and feature map §1 say the projects list is the first screen. The design handoff's nav reads *Inbox · Boards · Runs · Costs*; the design brief lists no projects list; the drawio front end lists none; the monitor mockup may be the home page ([[Monitor Open Questions]] #1).

## Git

### 14. The base branch and the repo's state

The hook denies *"`git checkout` of the base branch"* (PRD §7), but no column stores which branch that is. `git worktree add … -b vibe/task-<id>` (PRD §11) has no start point, so it branches from whatever the repo has checked out at promotion; that is git's default, not a stated design. A dirty working tree or a detached HEAD in the managed repo is not addressed. **Proposal:** `projects.base_branch`, defaulting to the current branch at registration, used as the worktree start point.

### 15. Who pushes, when, and where?

Drawio: *"host-side push / fetch"* to the *"project remote"*. PRD §11.1: *"the host does all git work"*. No source says when FlowBoard pushes a task branch, opens a PR, or fetches, and no column stores the remote. Related: [[Task Detail Open Questions]] #21 (who commits).

## Security

### 16. Per-project trust

`08` and backlog D8 choose stronger tiers *"per untrusted repo"* and allow *"an explicit trusted-repo opt-out"*. The sandbox profile is global in `settings` and per step (PRD §11.1, backlog Story 1.1); nothing is per project. **Proposal:** a nullable `projects.sandbox_profile` between the two. See [[Repository Trust And Sandboxing]].

### 17. Where do worktrees go?

Three schemes: PRD/backlog `<repo>/.vibe-worktrees/task-<id>` on `vibe/task-<id>`; drawio `<repo>/.flowboard/worktrees/task-<id>` on `fb/task-<id>`; task-detail mockup `~/.flowboard/ws/<task>` on `flowboard/<task>`. Only the first two live inside the project's repo. Shared with [[Task Detail Open Questions]] #20.

### 18. Visibility against a single-user tool

Feature map §1's idea needs identities that PRD §2 and §17 forbid. On one laptop the repo is readable regardless. See [[Project Visibility]].

## Seed and schema

### 19. The seed project

Drawio seeds *"sample tasks"*; PRD §15 and backlog Story 1.2 seed none and M2 says *"Create tasks manually"*. The scratch repo's location, the project's name and slug, and the seeded `check_command` value are not given. See [[Seed Project]].

### 20. 14 tables or 15?

`02` §1 and backlog Story 1.1 say 14; PRD §5 now defines 15 after `plugins` was split from `skills`. See [[Projects Data Model]].

## Scope boundaries

### 21. Library per project or global?

PRD §13 `/p/[slug]/library` against drawio `/skills /agents`. **Resolved** for v1 by Capability Library D5 (per project). See [[Capability Library Decisions]].

### 22. Flows per project or a shared library?

PRD `flows.project_id` against the flow-designer mockup's multi-author library that a project adopts from. See [[Flow Design Open Questions]] #1 and [[Flow Library]].

### 23. Which settings are per project?

The feature map calls projects *"the settings for how agents work on each one"* (§1), yet only `default_flow_id` and `check_command` live on the project. Draft mode, sandbox, escalation threshold and memory scopes are global (PRD §11.1, §11.2, §13). Should any of them be overridable per project (see #16)? Shared with the Settings And Plumbing notes.

### 24. Where project-bound work runs

The reference `worktreeWorkspace(repoPath)` binds one repo per adapter instance (`07`), and `TaskRef` is `{ id }` only (`workspace.ts`), so something must look up the project per task. Not stated who. Nor is it stated whether `git worktree add` at promotion and the seed copy at registration run in the web process or as worker jobs; PRD §2 bans only *long-lived* children from route handlers. See [[Projects Runtime]].

### 25. Which project does an import go to?

`POST /api/import/backlog` *"accepts `path` (server file) or `content` (browser)"* (backlog Story 7.3, `05` §14) and upserts on `(project_id, import_key)`, but no source puts a project in the request. The board's *Import .md* button (backlog Story 2.2) implies the current project. **Proposal:** `projectId` in the body.

## Related

- [[Projects Index]]
- [[Project Rules And Edge Cases]]
- [[Projects Roadmap]]
- [[Flow Design Open Questions]]
- [[Task Detail Open Questions]]
- [[Monitor Open Questions]]
- [[Settings And Plumbing Index]]
