---
tags: [lamproom, projects, analysis, handoff]
module: Projects
---

# Analysis Agent Handoff

After a GitHub clone, the repo analyst (the internal `repo-analyst` skill) now reads the repo and proposes its stack, its check command and the network hosts its sandbox must reach. The wizard's done screen and the project page show each proposal with **Accept**. Lamproom applies nothing until you click it, because the analyst read an untrusted repo. Before this branch, the skill and its setting existed, but nothing launched them.

This note is the state of branch `feature/analysis-agent` on 2026-11-13: cut from `dev` at `2b2c29d`, commits `bc8a6bd..7b7021f`, not merged or pushed. It records:

- [[#How it works]], in brief.
- [[#Decisions open to your review]]: the five choices that shape the feature.
- [[#Rulings made on your behalf]]: the smaller decisions taken while building, with what each costs if wrong.
- [[#Left for later]]: what the final review declined to judge, and the minor problems left unfixed.

The plan is `docs/superpowers/plans/2026-11-13-analysis-agent.md`.

## How it works

- **It is an ordinary run of the project.** `startAnalysis` in `packages/cli/src/analysis-run.ts` writes `<dataDir>/internal/repo-analyst.yaml` from the app-wide setting (Sonnet, $0.50 by default) and starts it like any flow. So it runs in the project's sandbox, counts toward the project's monthly cap, and shows in the runs list. This answers the project budget's open question of whether the analyst's cost counts: it does.
- **The project record keeps only the run's name** (`analysis.run`). Everything else is read back from the run when the pages ask (`analysisView`): running, done with its proposal, failed or paused with why.
- **The proposal is read as untrusted input** (`parseProposal` in `packages/cli/src/analysis.ts`):
  - Only the skill's shape is accepted.
  - Check commands are one line of at most 500 visible characters, with no control, bidi or zero-width characters.
  - Hosts are plain host names, at most 20.
  - Lamproom marks every host outside the known public registries as custom itself, whatever the agent says.
- **Accept** writes the check command into the repo's `.lamproom.yaml` and adds the hosts to the project's `networkHosts`. Those hosts join an OpenSandbox box's allowed egress.
- **If the analyst can't start**, the clone still succeeds; its log says `-- analysis not started: <why>`. Local projects, and any analysis that failed, get **Analyse** / **Analyse again**.

## Decisions open to your review

Each was taken to keep the first version small; none is hard to change.

| # | Decision | Why | What changing it takes |
|---|---|---|---|
| 1 | The analyst runs under the project's own sandbox setting. A Normal project needs `CLAUDE_CODE_OAUTH_TOKEN` (or the internal step set to OpenCode with the OpenRouter key); an Untrusted project on a Mac is refused | The analyst reads an untrusted repo; running it on this machine would make it the one run that skips its project's isolation | Running it on the machine with its fixed read-only tools: it would always start, but outside the sandbox |
| 2 | Only GitHub clones are analysed automatically; a local project gets an **Analyse** button | A local folder is usually your own code, and each analysis costs up to $0.50 | Calling `startAnalysis` from project registration too |
| 3 | A proposal counts as accepted when the project already holds its value; **Later** isn't stored | Nothing extra to keep in step with the record | A proposal you never accept stays on the project page until the next analysis replaces it. Storing *Later* needs a field on the record |
| 4 | The hosts are accepted all together, as in the mockup, with no editor | The smallest Accept; the list can still be edited with `PATCH /api/projects/:id { networkHosts }` | A host list on the project's settings page, with a remove button per host (see [[Deferred Work#Analysis agent]]) |
| 5 | Accepted hosts only restrict OpenSandbox boxes. Docker boxes, the Normal default, keep full internet access | Docker boxes have no egress control until the egress proxy is built | The egress proxy reads the same `networkHosts` |

## Rulings made on your behalf

| # | Ruling | Why | Cost if wrong |
|---|---|---|---|
| 1 | The project data the pages read calls the analysis `analysed` | The stored record already uses the name `analysis` for `{ run }` | A rename |
| 2 | A stopped run reads as `paused` | Lamproom has no separate *stopped* status | A stopped analysis says *"the run paused; see its page"* |
| 3 | A proposal wrapped in a ```` ```json ```` block is read normally | Models often add the fence | None |
| 4 | A proposal file over 64 KB is refused, as *"the proposal is larger than 64 KB"* | A hostile repo could steer the agent into writing a huge file, which the pages would read on every poll | None; a real proposal is a few KB |
| 5 | `startClone` takes the analyst as an optional last argument; only the clone route passes it | Starting it by default would make every existing clone test launch a real, paid run | None |
| 6 | Every project page shows the analysis card, not only GitHub projects' | Local projects need the **Analyse** button | A card on projects that never need it |
| 7 | Accepting hosts adds them to the project's list instead of replacing it | A second analysis must not drop hosts you accepted earlier | Removing a host needs the API (see [[Deferred Work#Analysis agent]]) |
| 8 | `viewProjects` takes the analysis reader as a parameter | `analysis-run.ts` imports `projects.ts`, so importing it back would make an import loop | None |
| 9 | After review: Lamproom marks non-registry hosts custom itself | A hostile repo can steer the agent into leaving out its own `custom` flag, so `exfil.attacker.com` would show with no warning | A new public registry shows as custom until it is added to `REGISTRY_HOSTS` |
| 10 | After review: check commands and stack entries with control, bidi or zero-width characters are refused | The command you approve could otherwise read differently from what runs | A command that needs such a character can't be proposed; set it by hand |
| 11 | After review: check commands are trimmed, and a blank one is refused | Accepting a command of only spaces would have deleted the project's existing check command | None |

## Left for later

What this work left unfixed or open is in [[Deferred Work#Analysis agent]], the one list of deferred work.

## Related

- [[Project Settings]]: the check command and network rows
- [[Project Check Command]]
- [[Repository Trust And Sandboxing]]: the sandbox tiers the analyst runs in
- [[Project Budget Handoff]]: the cap the analyst's runs count toward
- [[Creating A Project]]: the wizard's done screen
- [[Projects Index]]
