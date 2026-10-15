---
tags: [flowboard, capability-library, decisions]
module: Capability Library
---

# Capability Library Open Questions

Places where the sources disagree or leave a gap. Each needs a decision before building.

## 1. Where does the capability store live?

`./skills/<slug>` (PRD), `skills/_installed/` (`.gitignore`), `skills/<slug>/…` for seeds (backlog), `~/.flowboard/capabilities` (mockup). Per-repo or per-user? Seeds committed in the repo vs installs in the home directory is a reasonable split, but nothing says so. See [[Capability Storage On Disk]].

## 2. One table or three?

The PRD has separate `skills` and `agents` tables and no packs. The architecture adds `provider` + `format` to `skills`. The mockup treats skill, agent and pack as kinds of one *capability*, each with several provider packs. Likely shape: a `capabilities` table (kind, author, source, commit) and a `capability_packs` table (capability, provider, version, mount). Undecided. See [[Capability Data Model]].

## 3. What is a pack's version?

The mockup shows per-provider versions (claude 2.1, codex 0.4) but one `commit` per capability. If the Codex pack lives in a different repository, it has its own commit. Which one drives *update available*?

## 4. Should flows pin capability versions?

Today: no — an update reaches every flow on its next run, and the UI warns instead. A lockfile-style pin per flow version would make updates safe but would need its own update flow. The current design chooses warning over pinning. Worth confirming deliberately.

## 5. Agents and provider packs

The mockup gives agents a pack per provider (versionless). The architecture says agents are already provider-neutral apart from the logical model id. Does an agent need a pack record at all, or only a model-resolution check?

## 6. How does the pack/step provider check reach the flow editor?

Validation is pure functions over graph JSON. It needs the registry's pack list as input. That couples validation to registry state — is that a snapshot passed in, or a port?

## 7. Bundle-pack removal semantics

"Removing it leaves behind anything a flow still draws on." Does removing the pack remove its flows? Its unused members? Is the pack's membership kept so a re-install is idempotent?

## 8. Update detection

What polls upstream? On demand, on screen open, or scheduled? Network access happens on the host; there is no stated schedule.

## 9. API surface

The PRD lists four endpoints. The mockup needs preview, confirm, update, delete and usage. See [[Capability Library API And Routes]].

## 10. Define agent UI

The mockup's **+ Define agent** button only selects `architect` — no form is designed. The PRD lists the fields; the screen design is missing.

## 11. Seed set

PRD seeds (`researcher`, `planner`, `ponytail`, `explain-simply`…) differ from the mockup's Delivery pack (`scout`, `architect`, `developer`, `scribe`…). Which is canonical? See [[Seeded Capabilities]].

## 12. Network tools list

The mockup treats `Bash` as network-capable alongside `WebFetch` and `WebSearch`. MCP tools that reach the network are not covered. Should the list be data-driven per provider?

## Related

- [[Capability Library Index]]
- [[Capability Library Roadmap]]
