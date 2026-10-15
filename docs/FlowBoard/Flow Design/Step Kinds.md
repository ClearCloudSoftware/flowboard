---
tags: [flowboard, flow-design, concept, steps]
module: Flow Design
---

# Step Kinds

`step_defs.kind` decides what executes a step: `'skill' | 'agent' | 'shell' | 'manual'` (PRD §5).

| Kind | What runs | References | Verdict comes from | Source |
|---|---|---|---|---|
| `skill` | A headless agent session that invokes a packaged instruction as `/slug` | `skill_id` | The run's outcome (`set_outcome` or `{"outcome":…}` in a produced JSON) | PRD §5, §7 |
| `agent` | A headless agent session with the agent's system prompt appended | `agent_id` | Same as skill | PRD §5, §7 |
| `shell` | A plain command, no model | `command`, or the project's `check_command` | **The exit code** | PRD §7 *Shell steps*; see [[Check Steps]] |
| `manual` | A human task | — | Not specified | PRD §5 only |

The feature map's wording: *"A step can run a saved **skill** (a packaged instruction, like a slash-command) or a defined **agent** (a role with its own personality and instructions)."* and *"A step can also run a plain command, like your linter and test suite, with no AI involved."* (§2)

## Skill and agent steps

When adding a step: *"choose Skill or Agent, pick from installed skills or defined agents, then set model, effort, advance mode, requires, produces, and limits"* (PRD §13; drawio card *Add step form*). The pickers list what the [[Capability Library Index|Capability Library]] has installed, and a new install *"becomes selectable in the step editor straight away"* (capability-library mockup). Details of how a step references a capability: [[Capabilities In Flows]].

> [!warning] The mockups don't fit one kind per step
> The flow-designer inspector shows only a free-text **Agent** field. The capability-library mockup has steps that use a skill **and** an agent at once (`plan`: skill `plan-implementation` + agent `architect`). See [[Flow Design Open Questions]] #10.

## `manual`

Listed in the schema and nowhere else in the PRD. The feature map idea *"Assign a step to a person or role — a manual or approval step can name who does it"* (§2 ideas) and the parking-lot item *"A step could also … be a simple human checklist"* point at it.

## The StepExecutor idea

`02-core-and-engine.md` §3 proposes generalising `kind` into an interface:

```ts
interface StepExecutor {
  kind: 'agent' | 'skill' | 'shell' | 'http' | 'transform' | 'manual';
  run(step: StepDef, ctx: RunContext): Promise<RunResult>;  // RunResult identical across executors
}
// The 'agent'/'skill' executor delegates to an AgentProvider (01); others don't touch it at all.
```

*"This turns FlowBoard into a general workflow engine that *ships* AI executors rather than *being* one. Nearly free given the DAG already exists; widens the engine's core interface, so decide before hardening."* (`02` §3)

Status: *"Decided for `shell`, open for the rest"*. The drawio card *StepExecutor generalization — A step could be shell, HTTP, pure transform or a human task, not only an agent* is amber (page *FlowBoard ideation*), with an association line to the editor card *Vertical step list + connections panel*. The parking lot: *"More steps that aren't AI — plain commands are now in scope … A step could also call a service or be a simple human checklist."* See [[Flow Design Open Questions]] #21.

## Related

- [[Step Definitions]]
- [[Check Steps]]
- [[Capabilities In Flows]]
- [[Capability Kinds]]
