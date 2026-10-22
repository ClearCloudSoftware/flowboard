---
tags: [flowboard, human-in-the-loop, storage]
module: Human In The Loop
---

# Human In The Loop Storage

## In SQLite

`data/flowboard.db` (WAL, `busy_timeout = 5000`, PRD §3) holds the `questions` rows. The index `questions_pending ON questions(state, created_at)` (PRD §5) presumably serves the pending feed in creation order (inferred from its columns). The broker inserts questions (*"the only writer of the `questions` table"*, PRD §9). Answers arrive through `apps/web` endpoints (§12), so either web writes the answer columns or it hands them to the broker; the PRD doesn't say which ([[Human In The Loop Open Questions]] #36, same as [[Escalation And Notifications Open Questions]] #16). Approvals and rejections go to `step_instances` through `apps/web`. The drawio's DB card: *"the only shared state: opened by apps/web and apps/worker only, never from a sandbox"*.

| Data | Where |
|---|---|
| Questions, answers, channel, escalation refs | `questions` |
| Gate state, outcome, reason | `step_instances` (`state`, `outcome`, `reason`) |
| Parked run and its session id | `runs` (`state='parked'`, `claude_session_id`) |
| Escalation timers | `jobs` (`kind='escalate_question'`, `run_after`) |
| Threshold | `settings` (`escalation_threshold_ms`) |
| Slack secrets | `.env.local`: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID` (PRD §10) |

## On disk

Artifacts live in the task's worktree, `<worktree>/.vibe/task-<task-id>/`. The PRD's example (excerpt) includes the question exchange:

```
01-research_brief.md
02-questions.json
02-answers.json
03-plan.md
…
```

`questions` and `answers` are seeded artifact types (PRD §6). The seeded `grill` step produces both (PRD §15). The artifact-file fallback watches *"the `produces:questions` path"* (`04` §9).

> [!warning] Who writes `answers.json`?
> No source says whether the agent, the broker or the runner writes `questions.json` and `answers.json` when the MCP path is used, or whether the files only exist on the fallback path. See [[Human In The Loop Open Questions]] #8.

## The socket

*"For each run it opens a unix socket, `data/sock/<run_id>.sock`, which is bind-mounted into a sandbox as `/run/fb/ask.sock`."* (PRD §9). The sandbox mounts are the task worktree (rw), skills (ro) and this socket. Never mounted: `~/.ssh`, cloud credentials, `flowboard.db`, `docker.sock` (drawio *Mounts*; PRD §11.1).

> [!warning] The shipped code differs
> As built (2026-10-18), the only broker is `run-agent`'s. It listens on `ask.sock` in a fresh `/tmp/fb-*` folder, since a Unix socket path is limited to about 104 characters, and deletes the folder when the run ends. The shim finds the socket through `FLOWBOARD_ASK_SOCKET`. Nothing is bind-mounted: no sandbox tier is built. See [[Ask User MCP Server]].

## In chat

A posted message is identified by `slack_channel` + `slack_ts` (PRD §5), generalised as `PostedRef { channel, ref }`, where `ref` is *"Slack's `ts`, a Discord message id, an email thread id"* (`notifier.ts`). The message holds only the task title and question text (PRD §10).

## Run snapshots

The drawio harness: *"Run records / data/runs/<id>/spec.json + raw stream, replayable at $0"*. The PRD snapshots args to `data/runs/<id>/args.json` (§7). A run that asked a question has that call in its raw stream.

> [!warning] The shipped code differs
> Neither file is written: the runner that would write them is not built. `run-agent` appends one JSON line per record to `runs/<stamp>-<adapter>.jsonl`: the launched `RunSpec` as `start`, each normalized event with its native message as `raw`, each question batch as `question`, then its `answer` or `withdrawn` under the same `batch` number, and the `result` (2026-10-18; batch numbers since 2026-10-22). See [[Agent Providers Storage]].

## Related

- [[Human In The Loop Data Model]]
- [[Ask User MCP Server]]
- [[Flow Storage]]
- [[Escalation Storage]]
- [[Execution Storage]]
