---
tags: [flowboard, flow-design, concept, steps]
module: Flow Design
---

# Step Kinds

`step_defs.kind` decides what executes a step: `'ai' | 'shell' | 'manual'` (PRD §5). An `ai` step names an agent, a skill, or both ([[Capability Library Decisions|D27]], decided 2026-10-15). The PRD first had `'skill' | 'agent' | 'shell' | 'manual'`, one capability per step.

| Kind | What runs | References | Verdict comes from | Source |
|---|---|---|---|---|
| `ai` | A headless agent session. With an agent, its system prompt is appended (*who*); with a skill, the prompt invokes `/<plugin>:<slug>` (*how*); with both, both | `agent_id`, `skill_id` — at least one | The run's outcome (`set_outcome` or `{"outcome":…}` in a produced JSON) | PRD §5, §7; outcome rule §8 |
| `shell` | A plain command, no model | `command`, or the project's `check_command` | **The exit code** | PRD §7 *Shell steps*; see [[Check Steps]] |
| `manual` | A human task | — | Not specified | PRD §5; offered in PRD §13 and backlog Story 8.2 |

The feature map's wording: *"A step can run a saved **skill** (a packaged instruction, like a slash-command) or a defined **agent** (a role with its own personality and instructions)."* and *"A step can also run a plain command, like your linter and test suite, with no AI involved."* (§2)

As built in run-flow (2026-10-23), there is no `kind` key: a step with `shell:` is a shell step, and any other is an agent step. An agent step needs a `prompt`, a `skill` or a `system_prompt`, not an agent or a skill, so a prompt-only step is valid (`steps.a: an ai step needs prompt, skill or system_prompt` otherwise). Its agent is inline `system_prompt` text and its capabilities are paths (`skill: /plugin:name`, `plugins:` folders), with no library ids or pins (the run-flow plan; an `agent:` file key is on its Left out list).

## Skill and agent steps

When adding a step: *"choose an AI, shell or manual step; for an AI step pick an agent, a skill or both (from defined agents and installed skills), then set model, effort, advance mode, requires, produces, and limits"* (PRD §13). The drawio card *Add step form* still reads *"Skill or Agent"*. The pickers list what the [[Capability Library Index|Capability Library]] has installed, and a new install *"becomes selectable in the step editor straight away"* (capability-library mockup). Details of how a step references a capability: [[Capabilities In Flows]].

> [!check] One step, agent and skill (D27)
> The capability-library mockup already had steps that use a skill **and** an agent at once (`plan`: `architect` + `/plan-implementation`; `review`: `reviewer` + `/code-review`), and the schema already had both columns, so the `kind` exclusivity was dropped. With both, the step's tools are the agent's ∩ the skill's, narrowed by the step's own `allowed_tools`; the editor warns when that drops a tool the skill declares (D28). The flow-designer inspector still shows only a free-text **Agent** field and needs agent and skill pickers — [[Flow Design Open Questions]] #10.

## `manual`

Listed in the schema, and offered when adding a step (*"choose an AI, shell or manual step"*, PRD §13; backlog Story 8.2 inspector *"kind (`ai`/`shell`/`manual`)"*). No source says what a manual step does when it runs, how it finishes or what outcome it sets. The feature map idea *"Assign a step to a person or role — a manual or approval step can name who does it"* (§2 ideas) and the parking-lot item *"A step could also … be a simple human checklist"* point at it.

As built in run-flow (2026-10-23), there are no manual steps (`steps.a.kind: unknown key`): they wait on [[Flow Design Open Questions]] #39 (Claude's call, 2026-10-23, open to Alex's review; see [[Run Flow Reference#Rules this command settles]]). The stand-in for a person's sign-off is a no-op shell step with a gate, `shell: "true"` and `gate: approval`. The gate reads `approval needed; it reported pass`, and the person's Approve or Reject is the step's outcome. See [[Role Starter Flows]].

## The StepExecutor idea

`02-core-and-engine.md` §3 proposes generalising `kind` into an interface (its `'agent' | 'skill'` predates D27's single `ai` kind):

```ts
interface StepExecutor {
  kind: 'agent' | 'skill' | 'shell' | 'http' | 'transform' | 'manual';
  run(step: StepDef, ctx: RunContext): Promise<RunResult>;  // RunResult identical across executors
}
// The 'agent'/'skill' executor delegates to an AgentProvider (01); others don't touch it at all.
```

*"This turns FlowBoard into a general workflow engine that *ships* AI executors rather than *being* one. Nearly free given the DAG already exists; widens the engine's core interface, so decide before hardening."* (`02` §3)

Status: *"Decided for `shell`, open for the rest"*. The drawio card *StepExecutor generalization — A step could be shell, HTTP, pure transform or a human task, not only an agent* is amber (page *FlowBoard ideation*), with an association line to the editor card *Vertical step list + connections panel*. The parking lot: *"More steps that aren't AI — plain commands are now in scope … A step could also call a service or be a simple human checklist."* See [[Flow Design Open Questions]] #21.

As built in run-flow (2026-10-23), the host has the two kinds, `AiStep` and `ShellStep` (`cli/src/flow-config.ts`), and core's `StepDef` has none: the step rules stay in the CLI loader until a second reader needs them ([[Flow Definition Internals]]).

## Related

- [[Step Definitions]]
- [[Check Steps]]
- [[Capabilities In Flows]]
- [[Capability Kinds]]
