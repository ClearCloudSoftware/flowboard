---
tags: [flowboard, capability-library, decisions]
module: Capability Library
---

# Capability Library Open Questions

Places where the sources disagree or leave a gap. All were worked through on 2026-10-15; each carries its outcome, and the decisions live in [[Capability Library Decisions]]. The original question text is kept below each outcome.

## 1. Where does the capability store live?

> [!check] **Resolved — D5, D6.** Per-project, gitignored store at `<project>/.flowboard/skills/<plugin>/<commit>/`; seeds copied in under FlowBoard's commit.

`./skills/<slug>` (PRD), `skills/_installed/` (`.gitignore`), `skills/<slug>/…` for seeds (backlog), `~/.flowboard/capabilities` (mockup). Per-repo or per-user? Seeds committed in the repo vs installs in the home directory is a reasonable split, but nothing says so. Note that PRD §13 and Story 7.1 install into `./skills/<slug>`, which the `skills/_installed/` ignore rule does not cover. See [[Capability Storage On Disk]].

## 2. One table or three?

> [!check] **Resolved — D4, D23.** A `plugins` table (the unit of install) with child `skills` rows, plus `agents` scoped by project. No `capability_packs` table in v1.

The PRD has separate `skills` and `agents` tables and no packs. The architecture adds `provider` + `format` to `skills`. The mockup treats skill, agent and pack as kinds of one *capability*, each with several provider packs. Likely shape: a `capabilities` table (kind, author, source, commit) and a `capability_packs` table (capability, provider, version, mount). Undecided. See [[Capability Data Model]].

## 3. What is a pack's version?

> [!check] **Resolved — D1, D4.** One provider and one commit per plugin; the plugin's commit drives *update available*.

The mockup shows per-provider versions (claude 2.1, codex 0.4) but one `commit` per capability. If the Codex pack lives in a different repository, it has its own commit. Which one drives *update available*?

## 4. Should flows pin capability versions?

> [!check] **Resolved — D10.** Flows stay unpinned, but tasks pin plugin commits and agent rows at start, so an update never reaches a running task.

Today: no — an update reaches every flow on its next run, and the UI warns instead. A lockfile-style pin per flow version would make updates safe but would need its own update flow. The current design chooses warning over pinning. Worth confirming deliberately.

## 5. Agents and provider packs

> [!check] **Moot in v1 — D1.** Claude-only, so agents have no pack records.

The mockup gives agents versionless packs, but unevenly: four agents have Claude and Codex packs, three are Claude-only. The architecture says agents are provider-neutral once their default model is a logical id (the PRD still stores a native one). Does an agent need a pack record at all, or only a model-resolution check?

## 6. How does the pack/step provider check reach the flow editor?

> [!check] **Moot in v1 — D1.** No provider-match check while there is one provider.

Validation is pure functions over graph JSON. It needs the registry's pack list as input. That couples validation to registry state — is that a snapshot passed in, or a port?

## 7. Bundle-pack removal semantics

> [!check] **Moot in v1 — D3.** No bundle packs.

"Removing it leaves behind anything a flow still draws on." Does removing the pack remove its flows? Its unused members? Is the pack's membership kept so a re-install is idempotent?

## 8. Update detection

> [!check] **Resolved — D13.** A manual **Check for updates** per project.

What polls upstream? On demand, on screen open, or scheduled? Network access happens on the host; there is no stated schedule.

## 9. API surface

> [!check] **Resolved — D24.** See [[Capability Library API And Routes]].

The PRD lists four endpoints. The mockup needs preview, confirm, update, delete and usage. See [[Capability Library API And Routes]].

## 10. Define agent UI

> [!check] **Resolved — D21.** A plain form with the PRD fields; seeded agents read-only with **Duplicate to edit**.

The mockup's **+ Define agent** button only selects `architect` and switches the kind filter to Agents — no form is designed. The PRD lists the fields; the screen design is missing.

## 11. Seed set

> [!check] **Resolved — D22.** Mockup names with the PRD's contract skills kept; `implement` stays `/ponytail`.

PRD seeds (`researcher`, `planner`, `ponytail`, `explain-simply`…), plus backlog Story 1.2's research agents, differ from the mockup's Delivery pack (`scout`, `architect`, `developer`, `scribe`…). Which is canonical? See [[Seeded Capabilities]].

## 12. Network tools list

> [!check] **Partly resolved — D9.** Plugins shipping `.mcp.json` or `hooks/` are marked amber too. The tool set itself stays fixed, not data-driven.

The mockup treats `Bash` as network-capable alongside `WebFetch` and `WebSearch`. MCP tools that reach the network are not covered. Should the list be data-driven per provider?

## 13. Provider mismatch: block or warn?

> [!check] **Moot in v1 — D1.** Returns with the second provider.

The capability-library mockup and guide say the flow editor refuses to save a step whose provider has no pack for its capability. `01-ports.md` calls a capability-contract violation a design-time **warning**; only the artifact contract rejects the save. `05` gives the provider-match check no severity, and the flow-designer mockup does not implement it. See [[Provider Coverage And Portability]].

## 14. Data or behaviour: what is a `CapabilityPack`?

> [!check] **Resolved — D2.** Data: the `mount` union the adapter interprets.

`05-environment-and-registry.md` §13 gives it a `mount(spec: RunSpec): void` method; `agent-provider.ts` gives it a data union (`plugin_dir` / `system_prompt` / `native`) that the adapter interprets. See [[Capability Data Model]].

## 15. Is the skills directory mounted into the sandbox?

> [!check] **Resolved — D14.** Yes. `claude` runs inside the task's container (PRD §7 *Sandboxed runs*), so the step's plugin dirs are mounted read-only. `08-sandboxing.md` needs the mount added.

The harness diagram mounts `ro skills/ → /skills`. `08-sandboxing.md` says *mount only the worktree (and the declared artifact dir)* and lists no skills mount. If the agent CLI runs inside the sandbox, it needs the plugin dirs. See [[Capability Runtime Mounting]].

## 16. Does ACP change how packs mount?

> [!check] **Deferred.** Revisit if the `AgentProvider` port becomes ACP.

`01-ports.md`, the architecture README (open decision 2), feature map §6 and the drawio propose checking whether the `AgentProvider` port should *be* the Agent Client Protocol. If it does, pack mounting has to be re-checked against what ACP exposes rather than a per-vendor adapter.

## 17. Source documents drift from each other

> [!check] **Mostly resolved.** The source docs were fixed on 2026-10-15; two drift items remain. See [[Capability Library Decisions#Source docs to fix]].

- The drawio *Prompt builder* puts recalled memory after the headless instruction; PRD §7 and `09-memory.md` put it before.
- `01-ports.md` adds the `tool_hooks` flag; `agent-provider.ts` lacks it.

## Related

- [[Capability Library Decisions]]
- [[Capability Library Index]]
- [[Capability Library Roadmap]]
