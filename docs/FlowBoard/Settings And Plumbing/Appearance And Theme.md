---
tags: [flowboard, settings-and-plumbing, settings, theme]
module: Settings And Plumbing
---

# Appearance And Theme

Feature map §19: *"**Appearance** — Light, dark, or follow the system."*

## The setting

| Aspect | Source |
|---|---|
| Values: light / dark / system | feature map §19; `06` §15 (*"theme (light/dark/system)"*); backlog 8.3 |
| Applied before first paint | backlog 8.3: *"theme light/dark/system (class before first paint, `?theme=` override)"* |
| URL override `?theme=` | backlog 8.3 |
| Tokens on `:root` (light default) and `.dark` | backlog 9.1: *"Tokens on `:root` (light default) and `.dark`, mapped into Tailwind; IBM Plex Sans/Mono via `next/font`."* |
| Markdown must follow the theme | backlog 9.1 BUG: *"`markdown.tsx`: `prose dark:prose-invert` (today dark‑only → unreadable in the default theme)"* |
| Both themes readable | feature map, *Across everything*: *"a consistent, readable design in light and dark, fully usable from the keyboard, and friendly to screen readers"* |

*"Class before first paint"* means the theme class is on `<html>` before the page renders, so there is no flash of the wrong theme. **Inference, not in a source:** a theme stored only in the `settings` table needs a server read on every page load to do that (Open Questions #7).

## Which theme is the default

> [!warning] Three answers from five sources
> | Source | Position |
> |---|---|
> | PRD §13 | *"Dark-first, dense, keyboard-friendly."* |
> | Old design brief and handoff | *"Dark-first. Light mode should work but dark is the one to design."* Dark tokens are *"the designed default"*; light is artboard *1f* |
> | Backlog 9.1 | *"`:root` (light default)"* |
> | Mockups README and every mockup | *"Light only — no dark variant."* |
> | drawio *Harness architecture* tech card | *"shadcn/ui + Tailwind (light, zero radius, IBM Plex)"* |
>
> Dark-first (PRD, old handoff), light by default with a dark theme (backlog 9.1), light only (mockups, drawio). Feature map §19 and backlog 8.3 offer a switch, which assumes both themes exist. The same question is open in [[Flow Design Open Questions]] #34, [[Human In The Loop Open Questions]] #34 and [[Monitor Open Questions]] #27. See [[Settings And Plumbing Open Questions]] #7.

The Next.js scaffold at `code/flowboard/app/globals.css` follows the system (`prefers-color-scheme: dark`). It is the stock `create-next-app` output, not a design decision.

## Related

- [[Settings Catalogue]]
- [[Settings Defaults]]
- [[Settings Surfaces]]
- [[Settings And Plumbing Open Questions]]
