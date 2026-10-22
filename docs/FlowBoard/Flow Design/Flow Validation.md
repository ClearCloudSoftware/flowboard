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

Open questions: entry vs producer #23, capability severity #26, back-edges #22, required budget and turn caps #37, steps the host tier refuses #38 in [[Flow Design Open Questions]].

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

## Related

- [[Artifact Contract]]
- [[Editing And Saving A Flow]]
- [[Provider Coverage And Portability]]
- [[Capabilities In Flows]]
