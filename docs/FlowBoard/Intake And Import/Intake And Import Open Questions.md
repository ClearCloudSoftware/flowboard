---
tags: [flowboard, intake-and-import, open-questions]
module: Intake And Import
---

# Intake And Import Open Questions

Every place the sources disagree or leave a gap. Proposals are marked; none is in a source. Rows marked *observed* were found by running the reference code (`markdown-source.ts`, Node 24.11), not stated in a source. Some questions are shared with [[Execution Open Questions]], [[Flow Design Open Questions]], [[Monitor Open Questions]] and [[Task Detail Open Questions]].

| Theme | Questions |
|---|---|
| The key | #1, #4, #10 |
| Parsing | #2, #3, #21, #26 |
| The write | #5, #6, #7, #13 |
| The job and the route | #8, #9, #11, #12 |
| Promote and Start | #14, #15, #16, #17, #23 |
| Creating and editing | #18 |
| Seeds | #19, #20 |
| The port and future sources | #22, #25 |
| Screens | #24 |

### 1. Where is the explicit id written?

PRD §15: *"front-matter `id`"*. Backlog 7.3: *"front‑matter/inline `id`"*. `05` §14: *"`frontmatter/inline id`"*. `01-ports.md`: *"`frontmatter.id`"*. `markdown-source.ts`: *"explicit `{#slug}`"* at the end of the title, and no front-matter reader (*observed*: an `id:` in front matter is ignored). Front matter belongs to the whole file, so a front-matter `id` can key only one task in a multi-task file. **Proposal:** `{#slug}` per task; front matter only for one-task files. See [[Import Key]].

### 2. Who extracts acceptance criteria and non-goals?

PRD §15's agent returns `acceptance_criteria?` and `non_goals?` *"from "Acceptance criteria" / "Non-goals" sub-sections"*. The drawio *Harness architecture* card lists them too. `ParsedTask` (`task-source.ts`) and the `01-ports.md` sketch have neither. The reference parser turns a `### Acceptance criteria` heading into a separate task (*observed*). No source shows the sub-section syntax. **Proposal:** add both fields to `ParsedTask`; treat a `###`/`####` heading named *Acceptance criteria* or *Non-goals* under a task as that field. See [[Backlog File Shapes]].

### 3. Which path runs by default, and what is "messy"?

D6 and `05` §14: deterministic first, *"agent optional"*, *"for genuinely messy files only"*. PRD §15: *"The import endpoint also uses an internal `backlog-importer` agent"*. Drawio *Harness architecture*: only the agent path. Backlog 7.3: *"fall back to the parser on any failure"*, which reads as agent first. Nothing defines *messy* or says who chooses (the user, or a rule such as "the parser found zero tasks"). See [[Backlog Importer Agent]].

### 4. Do title edits "get picked up"?

PRD §16 asks that re-import *"picks up edits"*. With `slugify(title)` as the key, a renamed task gets a new key, so re-import creates a new task and leaves the old one. Only body edits, or tasks with an explicit id, are picked up. See [[Import Key]].

### 5. What happens to tasks removed from the file?

No source says. Re-import neither deletes, archives nor flags them. See [[Idempotent Upsert]].

### 6. What status does a new task get, and may re-import rewrite a moving task?

No source states the initial `tasks.status`. `backlog` is inferred from PRD §1 (*"A task enters the Backlog"*) and `flow_id` *"null while in backlog"*. The `07` upsert overwrites `title` and `body` whatever the status, and prompt part 1 reads them on every run (PRD §7). **Proposal:** insert as `backlog`; update only tasks still in `backlog`, and report the rest as skipped. See [[Idempotent Upsert]].

### 7. Which columns does an update overwrite?

`07`: `set: { title: t.title, body: t.body }`. PRD §15's output also has `acceptance_criteria` and `non_goals`. See [[Idempotent Upsert]].

### 8. How does the import route know the project, and which paths may it read?

`POST /api/import/backlog` has no project in its path (PRD §12) and no body field for it in any source. `path` is *"server file"* (backlog 7.3) with no limit on where. **Proposal:** body `{ projectId, path?, content? }`; restrict `path` to the project's repo or an explicit allowlist. See [[Intake API And Routes]], [[Import Trust And Isolation]].

### 9. Where do progress and the result live?

Feature map §17, backlog 7.3 and `05` §14 all want *queued → running → "6 created"* and *which path ran*. `jobs` has `state` and `last_error` only (PRD §5). No source says whether the board polls the job, reads an SSE stream, or gets the counts in a toast. **Proposal:** a `result` JSON on the job, `{ created, updated, path }`, read by polling `GET` on the job until `done`. See [[Import Job Lifecycle]].

### 10. Repeated titles in one file

*Observed:* the second `Same` gets `same-2`; reordering the two swaps which existing task each updates. Two different titles with the same `{#k}` give `k` and `b-2`, not an error. **Proposal:** reject a file with a duplicate explicit id, and warn on duplicate titles. See [[Parser Edge Cases]].

### 11. Temp files and job retries

The worker *"deletes the temp file"* (backlog 7.3). `jobs.attempts` implies retries (PRD §5), but nothing says whether the file is deleted only on success. If it goes on the first failure, a retry has nothing to read. Location of temp files is not given either.

### 12. Where does the importer agent run, and where does its cost go?

Not stated: host or sandbox, via the AgentProvider port or a direct `claude` call. Backlog 7.3 gives `haiku`, `--tools ""`, and *"Isolate the importer from global hooks"*. Its spend has nowhere to land: `runs.step_instance_id` is `NOT NULL` (PRD §5), and an import has no step instance. See [[Backlog Importer Agent]], [[Cost And Control Index]].

### 13. Hand-made task, then the same item imported

A hand-made task has no `import_key`, so an import of the same item makes a second task. No source covers it. See [[Idempotent Upsert]].

### 14. Promote, or promote and start?

D1 recommends *"Explicit Start button on card + sheet; promote stays cheap"* (backlog). The monitor and task-detail guides draw promote as the start (*"research queued"*; backlog → running). Whether the flow is pinned at promote (PRD §5, §12, backlog 2.1) or start (PRD §4) follows from this. Same as [[Execution Open Questions]] #2, [[Flow Design Open Questions]] #7, [[Monitor Open Questions]] #24. Errors for a bad promote are not listed. See [[Promoting A Task]].

### 15. Which worktree layout, and which process makes it?

PRD §11: `<repo_path>/.vibe-worktrees/task-<id>`, branch `vibe/task-<id>`. Drawio *Harness architecture*: `<repo>/.flowboard/worktrees/task-<id>`, branch `fb/task-<id>`. The promote route is in `apps/web`; the drawio's *Workspace manager* (*"git worktree add"*) is in `apps/worker`. See [[Task Workspace]], [[Intake Runtime]].

### 16. Demote versus *Send to backlog*

Backlog 2.1: *"Demote (todo → backlog) keeps worktree; re‑promote reuses it."* Task-detail mockup: *Send to backlog* from a running task, *"keeping its workspace and everything it produced"*, from *"anywhere"*. Feature map §3: *"Send a task back to the backlog (keeping its workspace)"*. PRD §12 has no route for either. Is *Send to backlog* demote, and does a re-promote keep the pinned flow version? See [[Task Actions]].

### 17. The unlisted Start route

Backlog preamble item 3: *"the code added `POST /api/tasks/:id/start` with no button"*. PRD §12 does not list it. See [[Intake API And Routes]].

### 18. Editing a task

Drawio: *"Create / edit task"*. No edit route in PRD §12, no form in any source, no rule on which fields stay editable after promotion, and none on whether a re-import overwrites a hand edit. See [[Creating A Task]].

### 19. Are there sample tasks?

Drawio, both pages: *"default flow + sample tasks"*, *"sample tasks, so the app is alive on first run"*. PRD §15 and backlog 1.2 seed no tasks. See [[Seed Project]].

### 20. The scratch repo

Backlog 1.2: *"auto‑`git init`ed"*. No path, no contents, and no `check_command` beyond *"something that exists in the scratch repo"* (PRD §15). M5's proof needs *"a deliberately failing test"* in it (PRD §14), so it must hold at least one test.

### 21. Which markdown counts?

*Observed:* only `##` and `###` open a task; `#` and `####` do not; text before the first heading is dropped; plain bullets are body, not tasks; lines under a bold bullet are dropped; non-ASCII letters vanish from keys (`日本語` → `""`). Feature map §17 says *"understanding both headings and bulleted lists"*, which reads wider than bold bullets only. See [[Parser Edge Cases]].

### 22. Which port shape?

`01-ports.md`: `id: 'markdown' | 'github' | 'linear' | 'webhook'` (no Jira, though the README and `05` §14 name Jira). `task-source.ts`: `id: string`. Neither carries the PRD's extra fields (#2). See [[TaskSource Port]].

### 23. Drag wording and the keyboard

PRD §13: *"between Backlog and Todo"*. Backlog 2.2: *"Backlog ↔ Todo"*. Old brief: *"Only Backlog → Todo is draggable"*. Old handoff: *"Only Backlog → Todo (either direction)"*. Backlog 9.4 wants *"keyboard equivalent for promote/demote"* without naming keys. See [[Intake In The UI]].

### 24. Where does the Import button live?

Backlog 2.2 and `05` §14 put it on the board `/p/[slug]`. The monitor mockup has no board columns, no Import, no promote ([[Monitor Open Questions]] #24). If the monitor replaces the board, intake has no screen. See [[Intake In The UI]].

### 25. Future sources

Push (webhook) versus `fetch()` pull; whether a tracker's issue number counts as an untrusted upstream key; two-way sync; credentials and egress. See [[Future Task Sources]].

### 26. The `07` example comment

`07-ports-in-practice.md` shows `body: undefined` for `- **Filter list by status** — add a dropdown`. The reference returns `body: 'add a dropdown'` (*observed*). The comment is out of date. See [[Markdown Task Source]].

## Related

- [[Intake And Import Index]]
- [[Intake And Import Sources]]
- [[Intake And Import Roadmap]]
- [[Execution Open Questions]]
