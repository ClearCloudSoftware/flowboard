---
tags: [flowboard, flow-design, validation, rule]
module: Flow Design
---

# Flow Validation

The flow-designer guide's lede: *"the screen refuses to save a recipe that can't actually run."*

## The checks

| Check | Rule (source wording) | Severity | Source | In mockup? |
|---|---|---|---|---|
| **Inputs are produced upstream** | *"every `requires` entry is produced by some ancestor step in the DAG. Reject the save with a clear error if not."* | Blocks save | PRD §6; `02` §2; backlog 5.1 | ✓ |
| **Every step is reachable** | *"A step with nothing leading into it would never run, so it is flagged rather than silently ignored."* | Blocks save (mockup) | flow-designer guide | ✓ |
| **Exactly one producer** | *"exactly one producer"* | Blocks save | `02` §2 | — |
| **Exactly one entry** | *"exactly one entry"* (one entry step, or one producer per `requires` entry: [[Flow Design Open Questions]] #23) | Blocks save | backlog Story 5.1 | — (entry inferred) |
| **Known types** | *"known types"* | Blocks save | `02` §2; backlog 5.1 | — |
| **Capability contract** | *"every knob a step uses is supported by its target provider"* | *"a design-time warning"* (`01-ports.md`) | `02` §2; `01-ports.md` | — |
| **Provider match** | *"validation checks the pack's provider matches the step's provider"* | None given (`05`); *"the recipe will not save"* (capability-library guide). **Moot in v1**, which is Claude-only ([[Capability Library Decisions\|D1]]); the build overtook D1 with OpenCode on 2026-10-18 ([[Agent Providers Open Questions]] #38) | `05` §13 | — |
| **Tool intersection** | The agent ∩ skill tool set drops a tool the skill declares | Warning ([[Capability Library Decisions\|D28]]) | — | — |
| **Agent or skill** | An `ai` step *"sets skill_id, agent_id or both"* (PRD §5, D27) | Blocks save (inferred; no source says how the rule is enforced) | PRD §5 | — |
| **Check command resolves** | A shell step with no `command` runs the project's `check_command`, which may itself be null | None given. [[Projects Open Questions]] #6 proposes a design-time error | PRD §5 | — |
| **Hooks missing** | *"a provider without them relies on the sandbox alone, and the flow editor says so"* | Notice | PRD §7 (`tool_hooks`) | — |
| **Unattended and unsandboxed** | No gate and sandbox `none` | Flag only | flow-designer mockup | ✓ (inspector only) |

As built in run-flow (2026-10-23), `pnpm run-flow --check <flow.yaml>` runs the checks below on a flow file, a recipe checked on its own; given `--folder <dir> --task <file>` too, it also checks the run's inputs, as every start does. Errors print as `<yaml path>: <field>: <message>` and exit 2; warnings print as `-- warning: <field>: <message>` and stop nothing. A flow that passes prints `-- flow ok: 9 steps, starting at research`.

| Check | run-flow message | Severity |
|---|---|---|
| A recipe, not a run | `folder: not in a flow file: a flow is a reusable recipe, and each run gives its folder with --folder`, and the same for `task` | Error |
| A budget for the whole flow | `budget_usd: required: the most the whole flow may spend, in dollars; 0 for no ceiling`; `budget_usd: must be 0 or more; 0 means no ceiling` | Error |
| The run's inputs (with `--folder` and `--task`) | `--folder: not a directory: <path>`; `--task: not a file: <path>`; `--task: file is empty` | Error |
| Inputs are produced upstream | `steps.plan: requires "brief", and no step before it produces that`. *Before* means along forward routes | Error |
| One producer per type | `steps.b: produces "plan", which "a" also produces` | Error |
| Exactly one entry | `steps: no entry step: every step has a route into it; name the first one with entry:`. Several steps with no route in get one line each: `steps.a: no route leads here, nor to "b"; a flow starts at one step, so route the others in`. A bad name: `entry: unknown step "x"` | Error |
| Every step is reachable | `steps.notes: no route leads here from the entry step "impl"`, followed along every route from the entry. A stray step beside a loop back to the first step is the only step with no route in, so it becomes the entry and the loop's steps are reported instead, until `entry:` names the first step | Error |
| Forward routes don't loop | `steps: routes loop without an on_fail route back: build, check, report` | Error |
| One rework per failure | `steps.check: on a failure it would rework "impl" and also take the on_fail route to "notify"; a rework route must be its step's only on_fail route` | Error |
| `max_attempts` is read | `steps.review.max_attempts: no rework route leads back to review, so nothing reads it` | Error |
| Edges | `edges.2: unknown step "x"`; `edges.3: repeats the edge a → b; keep one and set its condition` | Error |
| Names | `steps.Plan: name may only use lowercase letters, digits, - and _`; `steps.007: YAML reads this name as a number; quote it: "007"` | Error |
| Agent step | `steps.a: an ai step needs prompt, skill or system_prompt`, then the step's `run-agent` checks (`steps.a.model: required`) | Error |
| Write roots | `steps.a.write_roots.0: must be a path inside the folder, relative to it` | Error |
| Join behind a conditional route | `steps.d: waits for "a", whose route here is conditional; if it does not fire, d runs without it`; further up, `steps.d: waits for "c", which runs only if the conditional route a → b fires; if it does not, d runs without it` | Warning |
| Rework with nothing to read | `steps.check: reworks "impl" on a failure but produces nothing, so impl runs again without seeing why` | Warning |
| No turn or budget cap | `steps.a: no limits.max_turns or limits.budget_usd, and the flow has no budget; nothing stops a looping agent`, only when `budget_usd` is `0` | Warning |
| Placeholders | `--task: {{…}} is not filled in; the agent reads it as written` (with `--task`), or the same on `steps.x.prompt` | Warning |
| Unrestricted shell | `steps.a: unrestricted shell: commands can write outside <folder>`, or `outside the folder` for a recipe checked on its own | Warning |

There is no known-types check: artifact types are an open set, so a typo in `requires` fails as *no step before it produces that* (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]). Some rules have no design source: *Forward routes don't loop* is the run-flow plan's (*"forward routes must not loop"*, Execution #9), and *One rework per failure* and *`max_attempts` is read*, like `entry:`, are Claude's calls of the same date. *A recipe, not a run* and *A budget for the whole flow* are Alex's calls of 2026-10-23 ([[Flow Design Open Questions]] #1 and #12); the budget key's name, that it is required, and *Write roots*, which follows from the recipe, are Claude's calls. *Agent or skill* is looser: an agent step needs a `prompt`, `skill` or `system_prompt`, not an agent or a skill, so a prompt-only step is valid, and it names capabilities by path (`skill: /plugin:name`, `plugins:` folders), not by library id. Capability, provider-match and tool checks are not built.

Open questions: entry vs producer #23, capability severity #26, back-edges #22, required budget and turn caps #37, steps the host tier refuses #38 in [[Flow Design Open Questions]].

> [!check] Answered by run-flow, 2026-10-23
> #22: no, ancestry follows forward routes only. #23: one entry step, the one `entry:` names or else the one no route points to (`entry:` is Claude's call, open to Alex's review), and one producer per type. #37: both caps are optional, and in a flow with no ceiling (`budget_usd: 0`) `--check` warns about an agent step with neither. See [[Run Flow Reference#Rules this command settles]].

## How the mockup validates

```js
function validate(f){
  const out = [];
  const byId = Object.fromEntries(f.steps.map(s => [s.id, s]));
  const entry = f.steps.find(s => !f.edges.some(([,b]) => b === s.id));
  for (const s of f.steps) {
    const anc = [...ancestors(f, s.id)].map(i => byId[i]).filter(Boolean);
    for (const need of s.needs) {
      if (!anc.some(a => a.produces.includes(need)))
        out.push({ step:s.id, msg:`needs <b>${esc(need)}</b>, and no step before it produces that file.` });
    }
    if (entry && s.id !== entry.id && !f.edges.some(([,b]) => b === s.id))
      out.push({ step:s.id, msg:'has nothing leading into it, so it would never run.' });
  }
  return out;
}
```

From `docs/mockups/flow-designer.html`. Notes:

- `ancestors()` walks **every** incoming edge, `fail` back-edges included. A step inside a loop is its own ancestor (`build` → `review` → `build`), so it would satisfy a need for its own output.
- The entry is the *first* step with no incoming edge; every other such step is a problem.
- "Reachable" is really an incoming-edge check, not reachability from the entry. A disconnected cycle, or a step fed only by an edge from a deleted step (see **+ Step**, [[Flow Design Open Questions]] #18), passes.
- It runs on every render except in preview (`live = !preview`), so the strip *"re-checks on every change, so the answer arrives as you type"* (guide). Backlog Story 8.2 asks for a *"Live validation banner (debounced)"*.

As built in run-flow (2026-10-23), `validateFlow` (`core/src/flow/flow.ts`) differs on the first three points. Ancestors follow forward routes only, so a step in a loop cannot satisfy its own need. The entry is the step `entry:` names, or the one step with no route in; when several steps have no route in, each is reported as a competing start, not as a step that would never run. Reachability is followed from the entry, so a disconnected loop is caught.

## Error messages

| Problem | Message |
|---|---|
| Unsatisfied need | `<step>` *needs **design.md**, and no step before it produces that file.* |
| Unreachable | `<step>` *has nothing leading into it, so it would never run.* |
| Strip header | *won't save — 1 problem* · *a step asks for a file nothing upstream writes* |
| All clear | *This recipe holds together — every step's inputs are written by a step before it.* |

The PRD's acceptance checklist: *"Saving a flow whose step requires an artifact nobody produces is rejected with a readable error"* (§16).

## How to fix (guide)

| Rule | Fix |
|---|---|
| Inputs are produced upstream | *"Either drop the requirement in the inspector, or wire in a step that produces that file before it."* |
| Every step is reachable | *"Draw a route into it, or delete it."* |

Each problem row is a button: *"clicking it selects the offending step so you can fix it without hunting the canvas."*

## Where validation runs

- **Live in the editor** — the strip (mockup) or banner (PRD §13: *"Show a live validation banner when the artifact contract is unsatisfied"*).
- **On save** — drawio *Flow validation on save* in `apps/web`: *"every requires is produced by an ancestor · edits create a new flow version; running tasks keep theirs"*.
- **On demand** — `POST /api/flows/:id/validate -- artifact contract check` (PRD §12), returning *"readable errors"* (backlog 5.1).
- **As pure functions** — *"pure functions over graph JSON — no I/O, no provider"* (`02` §2). See [[Flow Definition Internals]].
- **In run-flow** (2026-10-23) — `pnpm run-flow --check`, `--mermaid` and every start load the flow file and run the checks above; nothing launches until they pass.

## Related

- [[Artifact Contract]]
- [[Editing And Saving A Flow]]
- [[Provider Coverage And Portability]]
- [[Capabilities In Flows]]
