---
tags: [flowboard, memory, behaviour, lifecycle]
module: Memory
---

# Memory Lifecycle

*"The lifecycle — recall then commit, both host-side"* (`09-memory.md`). The runner brackets `launch()` with the two calls: *"Neither happens *inside* the agent process — the **runner brokers both**."*

## One run

```mermaid
sequenceDiagram
  participant Wk as Runner (host)
  participant MS as MemoryStore
  participant DB as run_memories
  participant Ag as Agent (sandbox)
  Wk->>MS: recall({ scopes: user + project + agent + task, query })
  MS-->>Wk: MemoryHit[] (ranked)
  Wk->>Wk: cap at max_recall_chars → prompt part 7
  Wk->>DB: record which memories were recalled (optional)
  Wk->>Ag: launch(RunSpec)
  Ag-->>Wk: exit, artifacts, answers, outcome
  alt run succeeded
    Wk->>MS: write({ scope, content: declared artifacts + answers, metadata })
    MS-->>Wk: { added, updated }
  else run failed
    Wk->>Wk: no write
  end
```

Where the `run_memories` record falls relative to launch is drawn for illustration; no source fixes it.

The drawio *Life of one step*, letter **D**: *"If memory is on, the runner recalls (capped) before launch and writes after success. Host side only."* The Execution set places these as steps 2 and 10 of the [[Runner Pipeline]].

## One memory, across tasks

```mermaid
flowchart LR
  A["Task A, run of 'grill'"] -- "you answer: 'use pnpm'" --> C1[commit after success]
  C1 --> S[(store: user scope)]
  S --> R1[recall before task B's runs]
  R1 --> P["part 7: 'uses pnpm'"]
  P --> B["Task B doesn't ask again"]
  S -. "later: 'now uses bun'" .-> X{adapter}
  X -- local --> K[both kept, newest ranks first]
  X -- Mem0 --> U[old fact superseded]
```

The example answer is illustrative, built from `09`'s *"uses pnpm"* and *"now uses vitest, not jest"*.

## States of a memory

The sources give memories no states. A memory is written, recalled, and (under Mem0) superseded. There is no expiry, edit, delete, or review step, and no UI to see them. See [[Contradictions And Freshness]] and [[Memory Open Questions]] #18, #19.

## Edge cases the sources settle

| Case | Rule | Source |
|---|---|---|
| Memory off | *"With the `none` adapter this is a no-op and nothing else changes"* | `03` §6 |
| Run fails | No commit: commit is *"after a run succeeds"* | PRD §7, §11.2 |
| Recall returns too much | Ranked, *"the tail is dropped to fit"* | PRD §7 |
| Sandboxed run | The agent never reaches the store; no allowlist entry | PRD §11.2, `08` |

## Edge cases the sources leave open

| Case | Open question |
|---|---|
| A human rejection, not a run | [[Memory Open Questions]] #12 |
| An infrastructure failure worth remembering | #13 |
| Shell and manual steps | #14 |
| Commit before or after advancement | #15 |
| An answer undone after commit | #16 |
| A parked run that resumes | #10 |

## Related

- [[Memory Recall]]
- [[Memory Commit]]
- [[Life Of One Step]]
- [[Runner Pipeline]]
- [[Memory Index]]
