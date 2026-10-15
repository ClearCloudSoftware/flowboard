---
tags: [flowboard, capability-library, decisions]
module: Capability Library
---

# Capability Library Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building.

## 1. Where does the capability store live?

`./skills/<slug>` (PRD), `skills/_installed/` (`.gitignore`), `skills/<slug>/…` for seeds (backlog), `~/.flowboard/capabilities` (mockup). Per-repo or per-user? Seeds committed in the repo vs installs in the home directory is a reasonable split, but nothing says so. Note that PRD §13 and Story 7.1 install into `./skills/<slug>`, which the `skills/_installed/` ignore rule does not cover. See [[Capability Storage On Disk]].

## 2. One table or three?

The PRD has separate `skills` and `agents` tables and no packs. The architecture adds `provider` + `format` to `skills`. The mockup treats skill, agent and pack as kinds of one *capability*, each with several provider packs. Likely shape: a `capabilities` table (kind, author, source, commit) and a `capability_packs` table (capability, provider, version, mount). Undecided. See [[Capability Data Model]].

## 3. What is a pack's version?

The mockup shows per-provider versions (claude 2.1, codex 0.4) but one `commit` per capability. If the Codex pack lives in a different repository, it has its own commit. Which one drives *update available*?

## 4. Should flows pin capability versions?

Today: no — an update reaches every flow on its next run, and the UI warns instead. A lockfile-style pin per flow version would make updates safe but would need its own update flow. The current design chooses warning over pinning. Worth confirming deliberately.

## 5. Agents and provider packs

The mockup gives agents versionless packs, but unevenly: four agents have Claude and Codex packs, three are Claude-only. The architecture says agents are provider-neutral once their default model is a logical id (the PRD still stores a native one). Does an agent need a pack record at all, or only a model-resolution check?

## 6. How does the pack/step provider check reach the flow editor?

Validation is pure functions over graph JSON. It needs the registry's pack list as input. That couples validation to registry state — is that a snapshot passed in, or a port?

## 7. Bundle-pack removal semantics

"Removing it leaves behind anything a flow still draws on." Does removing the pack remove its flows? Its unused members? Is the pack's membership kept so a re-install is idempotent?

## 8. Update detection

What polls upstream? On demand, on screen open, or scheduled? Network access happens on the host; there is no stated schedule.

## 9. API surface

The PRD lists four endpoints. The mockup needs preview, confirm, update, delete and usage. See [[Capability Library API And Routes]].

## 10. Define agent UI

The mockup's **+ Define agent** button only selects `architect` and switches the kind filter to Agents — no form is designed. The PRD lists the fields; the screen design is missing.

## 11. Seed set

PRD seeds (`researcher`, `planner`, `ponytail`, `explain-simply`…), plus backlog Story 1.2's research agents, differ from the mockup's Delivery pack (`scout`, `architect`, `developer`, `scribe`…). Which is canonical? See [[Seeded Capabilities]].

## 12. Network tools list

The mockup treats `Bash` as network-capable alongside `WebFetch` and `WebSearch`. MCP tools that reach the network are not covered. Should the list be data-driven per provider?

## 13. Provider mismatch: block or warn?

The capability-library mockup and guide say the flow editor refuses to save a step whose provider has no pack for its capability. `01-ports.md` calls a capability-contract violation a design-time **warning**; only the artifact contract rejects the save. `05` gives the provider-match check no severity, and the flow-designer mockup does not implement it. See [[Provider Coverage And Portability]].

## 14. Data or behaviour: what is a `CapabilityPack`?

`05-environment-and-registry.md` §13 gives it a `mount(spec: RunSpec): void` method; `agent-provider.ts` gives it a data union (`plugin_dir` / `system_prompt` / `native`) that the adapter interprets. See [[Capability Data Model]].

## 15. Is the skills directory mounted into the sandbox?

The harness diagram mounts `ro skills/ → /skills`. `08-sandboxing.md` says *mount only the worktree (and the declared artifact dir)* and lists no skills mount. If the agent CLI runs inside the sandbox, it needs the plugin dirs. See [[Capability Runtime Mounting]].

## 16. Does ACP change how packs mount?

`01-ports.md`, the architecture README (open decision 2), feature map §6 and the drawio propose checking whether the `AgentProvider` port should *be* the Agent Client Protocol. If it does, pack mounting has to be re-checked against what ACP exposes rather than a per-vendor adapter.

## 17. Source documents drift from each other

- The drawio *Prompt builder* puts recalled memory after the headless instruction; PRD §7 and `09-memory.md` put it before.
- `01-ports.md` adds the `tool_hooks` flag; `agent-provider.ts` lacks it.

## Related

- [[Capability Library Index]]
- [[Capability Library Roadmap]]
