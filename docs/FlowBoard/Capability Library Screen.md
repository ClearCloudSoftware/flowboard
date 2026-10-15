---
tags: [flowboard, capability-library, ui]
module: Capability Library
---

# Capability Library Screen

The `flowboard/library` screen. Mockup: `docs/mockups/capability-library.html`; field guide: `docs/mockups/capability-library-guide.html`. House design: light only, zero border-radius, IBM Plex Mono/Sans, hairlines instead of shadows.

## Layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ① flowboard/library   7 SKILLS · 7 AGENTS · 3 PACKS   + Define agent  + Install from GitHub │
├──────────────────────┬────────────────────────────────────────────────────┤
│ ② CAPABILITIES  17 shown │ ③ code-review  [SKILL]  @flowboard/core · ships with FlowBoard │
│ [search…]            │ description                                        │
│ kind  All Skills Agents Packs │ [Open on GitHub] [Remove] in use by 4 steps     │
│ provider Any Claude Codex │ PACKS — ONE PACKAGING PER PROVIDER               │
│ SKILLS               │ SKILL.md / defaults+prompt / contains              │
│ ● code-review  @core │ TOOLS IT MAY USE                                   │
│ ● secret-scan        │ SOURCE                                             │
│ ○ release-notes      │ USED BY — STEPS DRAW ON THESE                      │
├──────────────────────┴────────────────────────────────────────────────────┤
│ ④ 17 capabilities · 1 update available · 1 used by nothing · codex packs for 7 of 17 · store ~/.flowboard/capabilities │
└───────────────────────────────────────────────────────────────────────────┘
```

Two columns: a 306 px rail and a detail pane. Below 900 px the panes stack, with the rail capped at 38 vh.

| # | Region | Job |
|---|---|---|
| ① | **Topbar** | The two ways things enter the library: clone from GitHub, or define an agent here. Shows counts per kind. |
| ② | **Rail** | Everything installed, grouped by kind, filtered by kind and provider, searchable. |
| ③ | **Detail** | One capability in full — including what would break if you removed it. |
| ④ | **Status bar** | The portfolio view: what needs updating, what nothing uses, how far Codex coverage goes, where the store lives. |

## The rail

- **Search** — placeholder *"Search capabilities and authors…"*. Matches **name, author and description** together. Type an author to see everything they published.
- **Kind chips** — `All` · `Skills` · `Agents` · `Packs`, each with its installed count.
- **Provider chips** — `Any` · `Claude Code` · `Codex CLI`, each with a count of capabilities packaged for it.
- **Group headers** — `skills`, `agents`, `packs` (sticky).
- **Empty state** — *"Nothing matches. Clear the search or widen the filters."*

Each row answers *whose is this, will it work here, does anything need it* without opening it:

```
● code-review                       @flowboard/core
  Read the diff against the plan, then call set_outcome…
                                    claude · codex · 4 uses
```

### Marks (the rail dot)

One dot per row, carrying the only three states worth interrupting you for.

| Dot | Means | When you see it | Do |
|---|---|---|---|
| solid grey | **in use** | At least one step in one flow references it. Most rows. | Nothing. |
| amber | **update available** | The source repository has moved past the installed commit. | Read the note, then take it or leave it. |
| hollow | **used by nothing** | Installed, but no step references it. | Remove it, or wire it into a flow. |

Precedence: update available > used by nothing > in use.

## The detail pane

Header: id (large mono), kind chip, author, and *· ships with FlowBoard* for seeded items. Then description and actions (**Update to n**, **Open on GitHub**, **Remove**). Then, in order:

1. **Update callout** — when an update exists
2. **packs — one packaging per provider** — a row per provider, then a coverage callout
3. Kind-specific block — `SKILL.md` + invoked as + format (skill) · defaults + prompt (agent) · contains (pack)
4. **tools it may use** — network tools amber
5. **source** — repository and commit
6. **used by — steps draw on these** — or the *Nothing uses this* callout

Empty: *"Select a capability."*

## The install dialog

Modal over a dimmed page; see [[Installing A Capability From GitHub]]. `esc` or a backdrop click closes it.

## Status bar

`17 capabilities · 1 update available · 1 used by nothing · codex packs for 7 of 17 · store ~/.flowboard/capabilities` and `esc close`. The update count turns amber when non-zero.

## Accessibility notes in the mockup

- Filter chips use `aria-pressed`; the dialog has `role="dialog"` and a label.
- Focus ring: 2 px teal `:focus-visible`.
- `prefers-reduced-motion` disables animations.
- Dots carry a `title` (*update available*, *in use*, *not used by any flow*).

## Related

- [[Capability Library Controls]]
- [[Capability Kinds]]
- [[Provider Coverage And Portability]]
- [[Updating And Removing Capabilities]]
