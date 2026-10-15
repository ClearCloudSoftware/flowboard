---
tags: [flowboard, settings-and-plumbing, settings, memory]
module: Settings And Plumbing
---

# Memory Settings Block

Memory is the optional, additive layer that lets runs start warm (feature map §21, PRD §11.2, `09-memory.md`). This note covers only the settings that switch it on and tune it.

## The block

| Field | Values | Source |
|---|---|---|
| Adapter | PRD §13: `none` / `local` / self-hosted Mem0 / Mem0 cloud. `06` §15: `mem0`/`local`/`none`. Port: `'mem0' \| 'mem0-cloud' \| 'local' \| 'none'` | PRD §13, `06` §15, `01-ports.md`, `memory-store.ts` |
| Endpoint or key ref | *"endpoint (self-host URL / cloud key ref)"* | `09`, PRD §11.2 |
| Enabled scopes | `user` / `project` / `agent` / `task` | PRD §13, §11.2 |
| Recall limit | number of hits, no default given | PRD §11.2, `06` §15, `09` |
| `max_recall_chars` | default 6,000, *"roughly 1,500 tokens"* | PRD §7 |

PRD §13: *"Add a **memory** section in settings as well (§11.2): the adapter (`none` / `local` / self-hosted Mem0 / Mem0 cloud), its endpoint or key ref, which scopes are enabled (user / project / agent / task), and the recall limit. Default the adapter to `none` — memory is additive, and nothing else in the app depends on it being on."*

## Rules the setting carries

- **Off means exactly as before.** *"With memory off (`none`), the prompt is exactly the six parts above"* (PRD §7). Acceptance: *"With memory disabled (`none`), every flow behaves exactly as in M1–M8"* (PRD §16).
- **A hard cap on recall.** *"Part 7 has a hard size cap (`settings.memory.max_recall_chars`, default 6,000 …): hits are ranked by relevance and the tail is dropped to fit. It never grows the other six parts."* (PRD §7). Execution covers the prompt part in [[Prompt Assembly]].
- **A key ref, not a key.** The block holds an *"endpoint or key ref"*. No source says what a ref points at (an env var name is the obvious reading). See [[Settings And Plumbing Open Questions]] #9.
- **Host-side only.** The runner reads the block and calls the store on the host, so *"memory adds nothing to the sandbox egress allowlist"* (PRD §11.2).

## Recommended defaults

`09` recommendation: *"Adapter = `local` first …, default `none` until the first flow opts in"* and *"Recall the `user` scope into every run; `project`/`agent`/`task` per step."* Feature map §21 leaves the first scope open: *"❓ Which memory to switch on first — just *your* preferences (the cheapest win), or project memory too?"*

> [!warning] "Until the first flow opts in"
> `09` implies a per-flow opt-in. The settings block is global, and no source gives flows or steps a memory field. See [[Settings And Plumbing Open Questions]] #9.

Memory's own cost is tagged apart from run cost: see [[Memory Cost Accounting]].

## Related

- [[Settings Catalogue]]
- [[Settings Defaults]]
- [[Prompt Assembly]]
- [[Memory Cost Accounting]]
- [[Settings And Plumbing Open Questions]]
