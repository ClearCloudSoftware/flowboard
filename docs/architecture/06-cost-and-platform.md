# 06 — Cost ledger & platform concerns

The money view (a primary product surface, not an afterthought) and the thin platform layer around everything
— settings, draft mode, API handlers.

← back to [README](./README.md) · ports: [01](./01-ports.md)

---

## 12. Cost & usage ledger + PricingService

- **Role:** rollups (PRD §13) — spend per project over time, per step definition (what does `/grill-me`
  actually cost), per model×effort, **wasted spend** (`cost_usd` where `wasted=1`, money burnt by rework
  loops), and cost per completed task trended by flow version.
- **Seam:** the ledger consumes `Usage` from the provider port
  ([01](./01-ports.md#the-normalized-event-envelope)) and reads the append-only `runs` journal
  ([02 §1](./02-core-and-engine.md#1-domain-model--migrations)). A single new service closes the provider gap:

  ```ts
  interface PricingService {
    price(provider: string, model: string, usage: Usage): number;  // -> costUsd
  }
  ```

- **Genericize — the elegant part:** Claude reports `total_cost_usd`, so its price table is a **passthrough**
  (`usage.costUsd` already set). Codex reports tokens only, so the same service prices it from a
  `(provider, model) → rates` table. **One code path costs every provider uniformly**; native cost is just the
  degenerate case where the table isn't consulted. Every downstream rollup is provider-blind.
- **Composes with:** the board's live card cost (4) and the viewer's running estimate (8) both read the same
  `Usage`; draft mode (15) overrides model/effort *and records the actual ones used* so `runs.model` /
  `runs.effort` keep the rollups honest.
- **Idea:** keep the price table **versioned and dated**. When rates change, historical cost stays reproducible
  because each run prices against the table in effect at its `started_at`. Pairs with the append-only journal:
  cost is never rewritten, only re-derivable.

## 15. Settings, draft mode, API

- **Role:** global overrides and the thin presentation layer.
- **Seam:**
  - **Settings** (`settings` table): draft mode, escalation threshold (minutes), theme (light/dark/system).
  - **API:** REST route handlers under `src/app/api/` are *thin* — validate with zod, call a function in
    `src/lib/`, return JSON. Every port is called from `src/lib/`, **never from a route**, so the whole system
    stays testable headless.
- **Genericize — draft mode as a `RunSpec` transformer:** don't special-case it in the runner. Model it as a
  pure function applied before `launch()`:

  ```ts
  type SpecTransform = (spec: RunSpec) => RunSpec;
  const draftMode: SpecTransform = s => ({ ...s, model: 'fast-cheap', effort: 'low' });
  ```

  Provider-neutral, composable with any future override (force-local-model, cap-budget-globally, pin-a-model
  for an incident), and it records the *resolved* model/effort on the run so cost stays honest (12).
- **Composes with:** the runner ([03 §6](./03-execution-substrate.md#6-runner--execution-host)) applies the
  transform chain; the flow editor and board read settings for display toggles.
- **Idea:** the API surface (PRD §12) is already a clean provider-neutral boundary — keep every handler a
  three-liner (validate → lib → JSON) and the ports stay the only place provider knowledge exists. If a route
  ever needs to know whether it's Claude or Codex, something leaked upward.

---

## Where a new provider actually touches the codebase

The acceptance test for the whole genericization program. Adding **Codex** should require only:

1. `adapters/agent/codex/` — implement `AgentProvider`: flag mapping, stream parser → `NormalizedEvent`,
   session/resume, `capabilities` set (likely without `native_cost`, maybe without `plugins`).
2. A `(codex, model) → rates` row in the price table (12), because `native_cost` is absent.
3. Codex-format `CapabilityPack`s for any skills used by flows targeting it (13).
4. Zero changes to: engine, board projection, HITL protocol, notifier, cost rollups, viewer, API.

If step 4 isn't true, the abstraction leaked — trace it back to a port and push the provider knowledge down.
