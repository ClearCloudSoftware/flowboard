---
tags: [flowboard, agent-providers, concept, models]
module: Agent Providers
---

# Logical Model Ids

> *"Step defs reference logical ids (`reasoning-high`, `fast-cheap`, `default`) resolved per provider via `resolveModel`. A flow authored for Claude runs on Codex unchanged; only the resolution table differs."* — `01-ports.md`, *Logical model ids*

```ts
/** Map a logical model id to this provider's native id, e.g. 'reasoning-high' -> 'opus' | 'o3'. */
resolveModel(logical: string): string;
```

(`agent-provider.ts`, the reference port). `RunSpec.model` is *"Logical model id (e.g. 'reasoning-high'); the adapter resolves it via resolveModel()."* The shipped port (`core/src/ports/agent-provider.ts`) keeps the `resolveModel` comment and adds how the built adapters resolve: *"(Claude: an alias, as is; OpenCode: its table, or "provider/model" as is)"*.

## Two vocabularies

| Source | Logical ids it uses |
|---|---|
| `01-ports.md`, `agent-provider.ts` | `reasoning-high`, `fast-cheap`, `default` |
| `06` §15 (draft mode) | `fast-cheap` |
| `07`, the reference `replay-provider.ts` self-check, the shipped `adapters/test/replay.test.ts` | `default` |
| PRD §5 `step_defs.model` | `'sonnet'` default, *"passed to --model"* |
| PRD §5 `agents.default_model` | `'sonnet'`, *"a Claude alias, used as the logical model id"* |
| PRD §15 seed flow, the flow-designer, task-detail and capability-library mockups | `haiku`, `sonnet`, `opus` |
| PRD §13, §16, drawio (draft mode) | `haiku` |

`05` §13: agents *"are already provider-neutral except default model ids (use logical ids"*. The capability-library guide: *"Provider-neutral apart from the model id, which is logical and mapped by the adapter."*

> [!check] v1 decision
> [[Capability Library Decisions]] D20: *"`default_model` stores Claude aliases (`opus` / `sonnet` / `haiku`) and treats them as the logical ids; `resolveModel` passes them through for Claude. The mapping arrives with the second provider."*

So in v1 the logical id *is* the Claude alias. In code, the Claude adapter's `resolveModel` is the identity (`adapters/src/agent/claude/provider.ts`): any id reaches the SDK's `model` as written. The abstract names (`reasoning-high` …) belong to the multi-provider design. The mapping D20 expected with the second provider did not arrive as a shared vocabulary: OpenCode, the second provider built, has its own table, and `run-agent` leaves it empty (below). [[Agent Providers Open Questions]] #11; the same split is [[Flow Design Open Questions]] #15.

The alias is not the native id either: the stream sample's CLI reports `claude-fable-5-1` for its default model. PRD §5 calls `sonnet` *"a Claude alias"*, so `haiku` / `sonnet` / `opus` are aliases the CLI resolves, not native ids.

## The resolution table

No source writes one out. The only mapping given is the doc-comment example `'reasoning-high' -> 'opus' | 'o3'`. The ReplayProvider *"ignores the model; it echoes the logical id back"* (`replay-provider.ts`).

| Logical (from `01-ports.md`) | Claude Code | Codex |
|---|---|---|
| `reasoning-high` | `opus` (example) | `o3` (example) |
| `fast-cheap` | not given | not given |
| `default` | not given | not given |

As built, each provider resolves on its own, and no shared table exists:

| Provider | `resolveModel` | An id it has no entry for |
|---|---|---|
| Claude Code | the identity | passed through as written |
| OpenCode | the `models` table given to the constructor | an id containing `/` passes through as `providerID/modelID`; an id without `/` throws `no OpenCode model for logical id '<id>'`, and the run fails with that error |
| ReplayProvider | the identity; the model is ignored | — |

`run-agent` builds the OpenCode provider with `models: {}`, so on OpenCode its `model` must be a `providerID/modelID` id, and the loader refuses one without a `/` ([[Run Config Reference]]). The id is split on the first `/`, because OpenRouter model ids contain slashes.

[[Agent Providers Open Questions]] #12 asks where the table lives and what an unknown id does. For the built providers the code answers both, as above. What gets recorded is still open.

## What gets recorded

- Draft mode *"records the *resolved* model/effort on the run so cost stays honest"* (`06` §15); backlog Story 3.2: *"record actual model/effort on the run"*.
- Rollups read *"per model×effort"* (`06` §12) from `runs.model` / `runs.effort` (backlog Story 8.1).
- The stream sample's `system/init` reports the native model as `claude-fable-5-1`, and `result.modelUsage` keys on it. Neither alias nor logical id appears there.
- As built, no `NormalizedEvent` or `RunResult` field carries a model id. On Claude the native id survives only inside `raw` (the `system/init` and `result` messages). `run-agent`'s log records the spec on its `start` line, so the id as the YAML wrote it.

Whether `runs.model` holds the logical id, the resolved native id or the id the stream reports is not decided: [[Agent Providers Open Questions]] #12.

## Effort

`Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'` (`agent-provider.ts`; PRD §5). No provider has an effort table. Both built providers declare the `effort` capability, and handle it differently:

- **Claude Code** passes it as given, as the SDK's `effort` (the CLI's `--effort`).
- **OpenCode** sends it as the prompt's `variant` only when the model has a variant of exactly that name, as the server lists the model's variants. Otherwise it is dropped, with no warning (`pickVariant` in `adapters/src/agent/opencode/options.ts`). So `xhigh` reaches a model only if it has a variant named `xhigh`.

[[Provider SDK Fit Analysis]] proposed a per-model variant mapping for OpenCode; the shipped code matches names only. How effort maps to Codex is not stated ([[Agent Providers Open Questions]] #29). Field-level detail is in [[Models And Effort]].

## Ideas

- *"Auto-pick the AI per step — let FlowBoard choose the best or cheapest model for each step instead of you setting it by hand."* (feature map, parking lot)
- `06` §15's transform chain: *"force-local-model, cap-budget-globally, pin-a-model for an incident"*.

## Related

- [[Models And Effort]]
- [[Draft Mode And Spec Transforms]]
- [[Agent Capabilities]]
- [[Run Spec]]
- [[Pricing Service]]
- [[OpenCode Adapter]]
- [[Provider SDK Fit Analysis]]
