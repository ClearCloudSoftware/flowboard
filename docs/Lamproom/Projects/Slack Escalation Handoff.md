---
tags: [lamproom, projects, escalation, slack, handoff]
module: Projects
---

# Slack Escalation Handoff

A project's **Escalation** setting (a Slack channel, and the minutes a question waits before it goes there) is now acted on. A question a run asks the page, left unanswered that long, is posted to the project's channel; you can answer it there, through an **Answer** button and a modal, as well as in Lamproom. The first answer wins wherever it came from, and the Slack message is repainted when the question is answered anywhere or stops waiting. The project's budget alert and cap are posted to the same channel, once each a month. Alex's decision: *"Answer in Slack too"*, over Socket Mode, since Lamproom has no public URL. Before this branch, the setting was stored and the page said *"Lamproom does not act on it yet"*.

This note is the state of branch `feature/slack-escalation` on 2026-11-15: cut from `feature/knowledge-assets` at `87f0f70` (Alex chose stacking), with phase 5's review fixes merged in, not merged or pushed. Merging it into `dev` brings `feature/knowledge-assets` and `feature/analysis-agent` in too. It records:

- [[#How it works]], in brief.
- [[#Setting up Slack]]: the app manifest, and where the tokens go.
- [[#Decisions open to your review]]: the choices that shape the feature.
- [[#Rulings made on your behalf]]: the smaller decisions taken while building, with what each costs if wrong.
- [[#Left for later]]: what is left unfixed.
- [[#Review]]: what the whole-branch review found, what was fixed, and what it left to judgement.

The plan is `docs/superpowers/plans/2026-11-15-slack-escalation.md`.

## How it works

- **The Next server runs it.** `instrumentation.ts` calls `startEscalation` (`packages/cli/src/escalation.ts`) beside phase 5's knowledge scheduler, once per server process (a `globalThis` guard). It keeps a Socket Mode connection to Slack open while both tokens are saved, and runs `escalationTick` every 15 seconds. lr-run-flow is unchanged. No server, no escalation.
- **What escalates:** an open ask (`<runDir>/asks/<id>.json`, written by a run started with `--page`, as the runs page starts them) of a run whose status is `waiting`, once it is older than the project's resolved `nudgeMin`. The project is the one owning the run's folder (none: the app's settings). The minutes and the channel are resolved at every check, so a change applies to questions already waiting. Gates (*verdict*, *escalation*, *run failed*) escalate too: they reach the page through the same asks files. A paused run has no live host, so it is not `waiting` and never escalates.
- **The message** (`slack-blocks.ts`): *Lamproom: a question is waiting*, then `<project> · run <run> · <step>`, each question with its options, and two buttons: **Answer** and **Open in Lamproom** (a link to `<Lamproom address>/runs?run=<run>`). Every bit of a question's text goes in as `plain_text`, which Slack never parses for mentions or links, cut to Block Kit's limits; options travel as their index, never their value. Only the notification's fallback `text` is mrkdwn, escaped. Links don't unfurl. No artifact bodies or file contents (PRD §10).
- **Answering in Slack:** **Answer** opens a modal (`views.open` with the click's `trigger_id`) holding the whole batch: radio buttons for yes/no and up to 10 options, a select past that, a multi-select, a text box (a number is checked: *a number, like 3 or 2.5*). On **Send** the answer is written by `answerAsk`, the page's own path, and the message is repainted *Answered in Slack by <user>* with each answer. Every envelope is acked; one whose `api_app_id` isn't the connected app's (from Socket Mode's `hello`) or whose team isn't the bot's (`auth.test`) is acked and dropped.
- **First write wins:** `answerAsk` now writes the answer file exclusively (`wx`), so between the host's polls a second answer, from the page or Slack, is refused (*already answered*). A modal sent after the fact turns into *Already answered in Lamproom.* (or Slack, or the terminal), or *No longer waiting.*
- **Repainting:** the page's answer route tells the module, which repaints at once (*Answered in Lamproom*, with the answers). A question that disappears otherwise is repainted on the next check: *Answered in the terminal* while the run lives, *No longer waiting: the run ended* once it doesn't. The buttons go.
- **Where it is recorded:** `<data>/escalations.json`, never a run folder or a repo: per ask the Slack channel id and `ts`, a copy of the question, and how it closed; per project and month which budget lines were posted; per channel Slack's last refusal. Closed questions are forgotten after a week.
- **Budget:** each check, a project with a cap whose spend this month (`projectSpendUsd`) crossed `alertAt` gets *Scratch has spent 85% of its $10.00 for November 2026.*; at the cap, *… new runs are paused until December 2026.* or, for *ask me first*, *… new runs ask first, and Start anyway is on the runs page: <address>/runs*. Once each a month.
- **Without Slack:** each question is logged to the server's console once (*-- escalation: Scratch: <run> asks "…"; Slack is not connected, so it waits in Lamproom*), and posted later if a bot token is saved while it still waits (PRD §10: Slack is optional). Budget lines are logged the same way.
- **Problems:** `not_in_channel`, `channel_not_found`, `is_archived` or any other refusal of a post is kept against the channel and shown on the project (its problems list) and on the Connections page, until a post to that channel goes through. A refused post is retried a minute later; nothing throws into the server.
- **The pages:** Settings → Connections → **Escalation channels** makes Slack real: paste the bot token and the app-level token (each shows only *set* or *not set*, never the token), **Save**, **Test** (`auth.test`: the workspace and the bot's name), **Remove**, the connection's state (*Connected to <workspace>*, *Connecting…*, *Not connected: <why>*), the refused channels, and the **Lamproom address** links point at (an app setting, `http://localhost:3000` by default). The other channels stay *coming soon*. A project's *Escalation* page now says *Slack is connected…* or *Slack is not connected…: waiting questions are only logged.*
- **The tokens** live in `<data>/secrets.json` (owner-only) as `slackBot` and `slackApp`, beside `openrouter`. Saving or removing one credential no longer wipes the others (`secrets.ts`; before, saving the OpenRouter key rewrote the whole file).

## Setting up Slack

The same steps are in the app: the round **?** beside Slack on Settings → Connections → Escalation channels opens them in a modal, with a **Copy** button for the manifest (`app/settings/slack.tsx`, `MANIFEST`). Change both together.

1. On [api.slack.com/apps](https://api.slack.com/apps), **Create New App** → **From a manifest**, pick the workspace, and paste:

   ```yaml
   display_information:
     name: Lamproom
     description: Questions from Lamproom runs that waited too long, answered in place.
   features:
     bot_user:
       display_name: Lamproom
       always_online: false
   oauth_config:
     scopes:
       bot:
         - chat:write
   settings:
     interactivity:
       is_enabled: true
     org_deploy_enabled: false
     socket_mode_enabled: true
     token_rotation_enabled: false
   ```

   `chat:write` posts and repaints; opening a modal needs no scope. Socket Mode means Slack needs no address of this machine, so there is no request URL and no signing secret.
2. **Install to Workspace**, then copy the **Bot User OAuth Token** (`xoxb-…`) from *OAuth & Permissions*.
3. In *Basic Information* → **App-Level Tokens**, **Generate Token and Scopes** with the scope `connections:write`, and copy it (`xapp-…`).
4. In Lamproom, Settings → Connections → Escalation channels: paste both, **Save**, then **Test**. The state should read *Connected to <workspace>* within a few seconds.
5. In Slack, invite the bot to each channel a project escalates to (`/invite @Lamproom`); the default is `#lamproom`. A channel the bot isn't in shows as a problem on the project.
6. If you open Lamproom on another address than `http://localhost:3000`, set **Lamproom address** on the same page, so the links in Slack work.

## What was checked

All against a **fake Slack**; Alex has no tokens yet, so nothing has run against a real workspace.

- **Tests** (`packages/cli/test/slack.test.ts`, `slack-blocks.test.ts`, `escalation.test.ts`, plus `flow-logs`, `settings`): the fake (`test/fake-slack.ts`) answers the Web API on `node:http` and speaks enough RFC 6455 for Node's own `WebSocket`, so the Socket Mode tests go through a real socket: acks with the modal's response, foreign envelopes dropped, `disconnect` and a dropped socket reconnecting, a refused token retried; posting after `nudgeMin` and once only, a changed `nudgeMin` applying, the log-once without a token, a paused run left alone, `not_in_channel` recorded and retried, the modal's answers written and repainted, a second submission refused, a bad number, the page's answer repainting, the terminal and run-ended repaints, the budget lines, and `startEscalation` taking a submission through its socket end to end.
- **Through the app:** a dev server on a spare port with scratch data and runs folders and `SLACK_API_URL` at a standalone fake. On Connections → Escalation channels: *not connected* → both tokens pasted → *set*, *set*, *Connected to Acme*; **Test** showed the workspace and bot; the tokens never appeared in the page. A hand-made run of the seeded *Scratch* project waiting on a gate for six minutes was logged once while no token was saved, then posted to `#lamproom` (`unfurl_links: false`, all `plain_text`, `<!channel>` in the prompt left inert); the fake clicked **Answer** (a modal of radio buttons and a text box opened) and sent the modal through the socket; the answer file read `{"decision":"approve","note":"from slack"}` and the message was repainted *Answered in Slack by alex*. Settings → Defaults → Escalation said *Slack is connected*; **Remove** went back to *not connected*; `/api/projects` carried a refused channel's problem line. No page errors.

## Decisions open to your review

| # | Decision | Why | What changing it takes |
|---|---|---|---|
| 1 | Anyone in the channel who can click may answer | A single-user app, and Socket Mode only receives the app's own workspace | Keep a list of Slack user ids and check `payload.user.id` |
| 2 | Gates (verdict, escalation, run failed) escalate like agents' questions | They reach the page through the same asks files, and a gate blocks a run as long as a question does | Skip asks with an empty heading |
| 3 | The server checks every 15 seconds: a question escalates, and a terminal answer is repainted, up to 15 seconds late | There is no queue, only files | A file watcher on the runs folder |
| 4 | An answer typed in the terminal is repainted *Answered in the terminal*, with no answers | The host deletes the ask and answer files and records nothing Lamproom can read | lr-run-flow writes each answer to the run's log |
| 5 | A refused post is retried each minute while the question waits | A missing invite is fixed by hand, then it just works | Back off longer, or stop after a few |
| 6 | Budget lines go to the project's escalation channel | One channel setting per project | A budget channel setting |
| 7 | No Notifier port: Slack is one module | One channel; the port would have one adapter | Extract the port when a second channel is built |
| 8 | The channel is posted to by name and the bot must be invited | `chat:write` only; `chat:write.public` would let it post to any public channel uninvited | Add the scope to the manifest |

## Rulings made on your behalf

| # | Ruling | Why | Cost if wrong |
|---|---|---|---|
| 1 | Tokens in `secrets.json` (`slackBot`, `slackApp`), not `.env.local` as PRD §10 has it | The OpenRouter key already lives there, owner-only, and the pages can set it | None |
| 2 | Socket Mode, so no signing secret and no `/api/slack/interactions` | No public URL (Open Questions #6); the drawio's harness page draws it so | None |
| 3 | An escalated question keeps a copy of its text in `escalations.json` | The repaint needs the prompts after lr-run-flow deletes the ask file | The data folder holds question text for a week after it closes |
| 4 | A Slack refusal of `chat.update` (the message deleted) counts as repainted; only a network failure is retried | Otherwise a deleted message is retried forever | A repaint lost to a passing Slack-side error |
| 5 | A budget line Slack refused is retried a minute later; only a sent one is recorded | The bot may be invited later | Up to one call a minute per refused project |
| 6 | A question that vanishes from a live run reads *Answered in the terminal*, a gate asked again in the same run too | lr-run-flow leaves no record of terminal answers | A misleading repaint for a re-asked gate. **The review did not accept this one as it stands:** an answer from the page or Slack that lands while the post is still awaiting Slack is overwritten and credited to the terminal (minor m2 below) |
| 7 | The **Answer** click is acked before `views.open` returns | Slack wants the ack within 3 seconds and the `trigger_id` lasts 3 | A failed modal is only logged on the server |
| 8 | When the cap is crossed between two checks, only the cap is posted, and the alert counts as sent | One line says it all | None |
| 9 | Options travel as their index; a select shows the first 100 options and a modal the first 99 questions | Block Kit caps an option value at 150 characters, a select at 100 options, a view at 100 blocks | An agent's 101st option cannot be picked in Slack; the page still can |
| 10 | The escalation channels page moved to `app/settings/slack.tsx` | `settings.tsx` would otherwise grow by the Slack row | None |
| 11 | The Lamproom address is stored without a trailing slash | Links are built as `<address>/runs` | None |
| 12 | `answerAsk` refuses a second answer (*already answered*) for the page too | First write wins is one rule, wherever the answer comes from | A double-click on the page now gets a 409 for the second click |
| 13 | A run's first 10 asks escalate, and a pass posts at most 20 | A run writes a handful of asks at once; a flood written by an agent outside a box must not flood Slack or block the server with whole-file writes | A run with more than 10 open questions has the rest only in Lamproom; a burst of more than 20 due questions takes several passes (15 s each) |
| 14 | An ask file must pass a shape check (string ids, heading, prompt, help and option labels; known kinds; selects with options; ids once) to be shown or escalated; a missing `at` reads as `''` and never escalates; an empty batch still counts | An agent on this machine can write its run folder; phase 5's stuck-gate check reads asks without `at` | A malformed ask is invisible on the page too, and its run reads *running*, not *waiting* |
| 15 | The Socket Mode watchdog looks every 10 s, takes a gap over 60 s as a sleep, and replaces a socket once it is an hour old | Node's `WebSocket` sends no pings, and Lamproom only writes acks, so a dead socket raises no event | A reconnect each hour; a click in the second it takes is redelivered by Slack |

## Left for later

What this work left unfixed or open is in [[Deferred Work#Slack escalation]], the one list of deferred work.

## Review

A fresh reviewer read the branch (`a9fd234..38e972a`): no critical findings, two important ones, both fixed test-first, and the seven minors above.

- **I1, a silently dead socket never reconnected** (fixed in `c6ada49`): after a sleep or a network change the TCP connection can die with no `close` or `error`, so the page kept saying *Connected* and every **Answer** click failed in Slack. A watchdog now replaces the socket when a tick comes over 60 s after the last, and once it is an hour old (ruling 15). Test: *a socket that went quiet through a sleep, or is an hour old, is recycled* (`slack.test.ts`, an injected clock against the fake socket server).
- **I2, one malformed ask stopped all escalation** (fixed in `c273cf3`, `93e0bbc`): an ask file whose `questions` or a `prompt` had the wrong type threw inside the pass, so no later run was escalated or repainted and budget lines stopped; a flood of forged asks would each have been posted. Ask files are now checked by shape (ruling 14), each ask, repaint and the budget fail on their own, and the pass is capped (ruling 13). Tests: *a malformed ask neither stops the pass nor the asks behind it*, *a flood of asks is posted at most 10 per run and 20 per pass*, *a pass that throws on one ask still repaints and posts the budget* (`escalation.test.ts`), and the shape check in `flow-logs.test.ts`.
- **The reviewer accepted the rulings except ruling 6** (see m2).
- **Left to judgement by the reviewer:** whether real Slack accepts these payloads, total message size included; Slack turning bare URLs in `plain_text` into links; `clip` splitting a surrogate pair (an emoji cut in half); stale asks left by a crashed run; what Next does with an unhandled rejection; agents outside a box reading `secrets.json` (the isolation layer's job, not this one's); two servers on one data folder both posting.

## Related

- [[Project Settings]]: the *Escalation* and *Budget* rows
- [[Project Budget Handoff]]: the cap whose alert and limit are now posted
- [[Knowledge Assets Handoff]]: the scheduler this shares `instrumentation.ts` with
- [[Escalation And Notifications Index]]: the component's design notes; [[Slack Adapter]], [[Escalation To Chat]]
- [[Projects Index]]
