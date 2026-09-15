# The coding agents we already run are unmeasured, unsupervised, and unsafe

**Prepared by:** [you]
**Date:** 2026-09-15
**For:** Engineering leadership (calibration notes for product & exec in the appendix)

> Written with the [`system-pitch`](https://github.com/murphytrueman/design-system-ops/blob/main/skills/system-pitch/SKILL.md)
> framework: lead with the problem, be honest about the ROI, name the objections. **Every number below is an
> illustrative placeholder** — replace the bracketed values with your real spend and headcount before sending.

---

## The cost of the current state

We are already running AI coding agents. Every engineer who reaches for one runs it the same way: one terminal,
one session, watched by a human, on their own laptop, with full permissions. That approach is quietly expensive
in three ways.

**1. We can't see the bill, and a chunk of it is waste.** Agent spend lands as one opaque line on a vendor
invoice — roughly **[$8k/month → ~$96k/year]** today — with no attribution to a task, a person, or a stage of
work. Nobody can answer "what did that feature cost in agent time?" And a real fraction of it is *rework waste*:
an agent takes a wrong turn, gets re-run from scratch, loops on a review it keeps failing. We estimate
**[~25%, ~$24k/year]** evaporates on runs that get thrown away — and we only estimate it because nothing
measures it.

**2. Autonomous agents run on the host with nothing between them and everything.** To avoid babysitting every
prompt, engineers run agents with permissions bypassed, directly on their machines, over repositories that
contain untrusted content (dependency code, issue text, web pages the agent fetches). A single prompt injection
in any of that can exfiltrate a credential or corrupt a repo, and there is **no network boundary, no audit
trail, and no sandbox** to contain it. This is one bad afternoon away from an incident.

**3. Work runs one step at a time, with a person tethered to it.** Research, then planning, then implementation,
then review is a pipeline — but today it runs serially in a single session that an engineer has to sit and
watch, answering the occasional question and approving the occasional step by hand. The parallelism is left on
the table, and so is the engineer's attention.

We know this shape of problem is real because we already tried to solve it once, and the first attempt failed in
instructive ways (see the [rebuild post-mortem](./REBUILD-BACKLOG.md)) — that history is addressed head-on
below, not hidden.

---

## What the investment delivers

*(one paragraph, no jargon)*

**FlowBoard turns running coding agents from babysitting one terminal into a board where a task flows through
automated stages — research, plan, build, review — each stage an agent with its own budget and guardrails, some
stages pausing for a quick human yes/no.** It runs the independent stages in parallel, isolates each one in a
sandbox, and shows exactly what every stage and every task costs. The point is not the board or the models; it
is that agent work becomes *visible, controllable, and safe to leave running* instead of invisible, unbounded,
and hand-held.

---

## The investment

This is a **rebuild of an existing internal tool** (v1 shipped, then stalled), not a greenfield bet. We are
asking for:

- **~[10–12] focused engineering-weeks** (≈ **[0.25 FTE for one quarter]**) to reach a daily-usable v3 across
  its eight build milestones — schema, board, the agent runner, the human-question loop, the flow engine,
  escalation, import, and the cost/sandbox views.
- **~[0.1 FTE] ongoing** thereafter for maintenance and for adding flows, agents, and skills as the team needs
  them.

The arithmetic is meant to be visible: we are spending on the order of **[$96k/year]** running agents today with
**[~$24k]** of it demonstrably wasted and none of it governed. The build costs roughly **[one quarter of one
engineer]**. If it only recovers the waste and prevents one security incident, it has paid for itself.

---

## What success looks like

Within **[one quarter]** of v3 being usable:

- **≥ [70%] of agent work runs through a governed flow** rather than an ad-hoc terminal session.
- **Wasted spend is a number on a dashboard**, and it trends down as flows are tuned (baseline it in week 1).
- **Every task carries a cost** — cost-per-task by flow version — so "what did that feature cost?" has an answer.
- **Zero autonomous runs happen unsandboxed**: bypassed permissions are only allowed inside a container with
  restricted network egress.
- **Time an engineer spends tethered to a running agent drops**, because independent stages run in parallel and
  only real decisions surface (in one inbox, answered in seconds).

**What this will not solve — stated plainly so it isn't mistaken for a promise:**
- It will not make a bad prompt or a bad flow good; it makes their cost *visible*, not zero.
- It does not remove the human from the loop — approval gates and questions are the design, not a bug.
- It is a **single-user, local-first tool today**. It is not multi-tenant SaaS, and this pitch does not claim it
  is. The architecture leaves a clean path to a shared/remote tier, but that is a later, separate decision.

---

## The ask

**Fund ~[10–12] engineering-weeks this quarter to rebuild FlowBoard to daily-usable, then ~[0.1 FTE] to keep it
alive.** Concretely, three things:

1. Approve the quarter of build time.
2. Baseline today's agent spend and wasted-spend now, so we can measure the delta.
3. Name one team to run the first real flows through it and report back.

---

## ROI (conservative)

**Formula:** (annual benefit − annual cost) / annual cost.
**Benefit counted:** only the hard, defensible items — wasted spend eliminated and a modest slice of reclaimed
engineer time. Security-incident avoidance and throughput gains are treated as upside, not booked.

| | Illustrative (replace) |
|---|---|
| Annual agent spend today | **[$96,000]** |
| — of which wasted on rework | **[$24,000]** |
| Wasted spend recoverable (conservative, ~50%) | **[$12,000/yr]** |
| Engineer time reclaimed (conservative: [10 eng × 1.5 hr/wk × $100]) | **[~$70,000/yr]** |
| **Annual benefit (hard, counted)** | **[~$82,000]** |
| Build (year 1, one-time) | **[~$40,000]** |
| Ongoing (year 2+) | **[~$15,000/yr]** |
| **Payback** | **~[6–8] months** |
| **Year-2 ROI** | **([82k − 15k]/15k) ≈ [4×]** — see note |

**Make the assumptions visible:** this assumes the team actually routes work through flows (adoption is the
whole risk) and that today's spend and waste are near the illustrative figures. If adoption is slow, payback
extends; if agent spend is higher than assumed (it usually grows), the waste and the benefit both grow with it.
**Upside not counted:** avoided security incidents, faster time-to-review from parallel stages, and less
decision fatigue.

---

## The objections, named

**1. "We tried this before and it didn't stick."** Correct — and we know exactly why. v1 was verified with
`curl` and SQLite only; no browser was ever driven, so a row of UI bugs shipped. Backlog import was rewritten
three times mid-session because two parsers disagreed and the import key wasn't stable. A worker restart killed
live runs. (All documented in the [post-mortem](./REBUILD-BACKLOG.md).) v3 differs in specific, checkable ways:
a ports-and-adapters architecture with a replayable fake-agent for tests, a real browser E2E lane, one
deterministic import contract, worker restart-recovery, and a written debt ledger. This is not "the same thing
again" — it is the same idea with the first attempt's failure modes turned into acceptance tests.

**2. "Autonomous agents are too risky to run unattended."** That risk is real, and it is the strongest reason to
*build this*, not to avoid it. FlowBoard makes the safe path the default: each step runs in a **sandbox** with
default-deny network egress (an allowlist the agent cannot talk its way around, even under prompt injection),
non-root, dropped capabilities, and resource limits — and **bypassed permissions are refused unless the step is
sandboxed.** It adds approval gates for the steps that need a human and an audit trail for every run. Today's
"engineer watches the terminal" is *less* safe than this, not more. (Design + sources:
[sandboxing](./architecture/08-sandboxing.md).)

**3. "Why build this? Just use the vendor's own tool / the CLI directly."** FlowBoard doesn't compete with the
model or replace the CLI — **every model call goes through the `claude` CLI**; it is the thin harness *around*
it that a single terminal can't be: cost attribution, human-in-the-loop gating, parallel stages, and an audit
trail. It is also **provider-agnostic by design** (Claude *and* Codex behind one seam), so we are not betting the
workflow on one vendor.

**4. "This will just help us spend more on agents."** The opposite is the design. Every step has a budget and a
turn cap; a global **draft mode** forces the cheapest models while iterating; the sandbox enforces *physical*
limits; and the cost views surface **wasted spend** specifically so we can cut it. It is the spend-*control*
layer we don't have.

**5. "It's a single-user local tool — it won't scale to the team."** True today, and we won't pretend otherwise.
It is local-first on purpose (your repos, your machine, no new service to run). The workspace and provider
seams are the honest path to a shared or remote tier later without a rewrite — but we are asking you to fund the
tool that works now, not a platform vision.

**6. "How will we know it's working?"** Because it measures itself. Baseline agent spend, wasted spend, and
time-to-review *this week*; in one quarter, compare. If wasted spend isn't falling and flows aren't being used,
the tool isn't earning its keep and we stop — the dashboards will tell us before your budget does.

---

## Appendix

### Cost of inaction (18-month view)

Do nothing and the three costs compound: unattributed spend keeps growing as agent use grows (and it will), with
the wasted fraction growing alongside it; the security exposure persists every day an autonomous agent runs
unsandboxed on someone's laptop — a single incident dwarfs the entire build cost; and every new engineer relearns
"how we run agents here" from scratch. The build is roughly **[one quarter of one engineer]**. The 18-month cost
of the status quo — waste plus the expected value of one avoided incident plus relearned onboarding — is
**[materially larger]**.

### Audience calibration

- **Engineering leadership (primary):** lead with waste and safety — unattributed spend, unsandboxed autonomy,
  restart-safe infrastructure. Frame it as *platform plumbing for how we run agents*, not a side project.
- **Product leadership:** lead with throughput and predictability — parallel stages ship features faster, and
  cost-per-task makes agent work forecastable.
- **Executive:** lead with risk and return — "we spend [$96k/yr] on agents with no visibility or containment;
  [one quarter] of build makes it measurable, controllable, and safe, and pays back in [months]."

### Investment model

FlowBoard is a **single-owner internal tool with the team as contributors**: one maintainer owns the engine and
the roadmap; engineers contribute *flows, agents, and skills* (the seeded library shows the shape). This keeps
governance light and ownership clear at our size. If adoption grows past a handful of teams, revisit whether the
maintainer role needs to become a formal 0.5–1 FTE — a decision to make on evidence of use, not up front.

### Assumptions to replace before sending

`[agent spend/mo]` · `[% wasted]` · `[engineers using agents]` · `[hours/wk reclaimed]` · `[loaded hourly rate]`
· `[build weeks]` · `[incident cost estimate]`. Swap in real figures and the ROI recomputes; the argument does
not depend on any single number being exact, only on the direction being right.
