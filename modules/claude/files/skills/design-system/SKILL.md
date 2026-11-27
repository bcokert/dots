---
name: design-system
description: How to build anything Bdon will look at (a clarity-app page, the life dashboard, a bb plugin, a mockup, an HTML preview) to the Clarity design system. Use before writing any UI, CSS, colour, icon or layout, and before showing a design choice.
---

# Building to the Clarity design system

One look and set of behaviours for everything Bdon uses, so nobody can tell where one app ends and the next begins.
The system is three files in dots, `<dots>/modules/design/` (on every machine); read them, don't recall them:

| File | What |
|---|---|
| `DESIGN.md` | The rules: principles, colour meanings, shapes, type, space, states, components, progression, motion, phone |
| `tokens.css` | Every value, as `--cl-*` variables. Nothing hard-codes a colour, size, radius or font |
| `specimen.html` | Every token, shape, state and component drawn, with working markup to copy |

## Every time

1. Read `DESIGN.md` (all of it the first time in a session; the section you need after that).
2. Start from the specimen's markup for any component it has. Use only `--cl-*` tokens.
3. A value the tokens don't have is a change to the system: propose it (DESIGN.md, tokens.css and the specimen in one
   commit), never a local hex value.
4. Screenshot before showing Bdon: desktop in Chromium and phone in WebKit (`devices['iPhone 15']`: his phone is
   Brave on iOS). How, on this box: the clarity repo's `docs/clarity-app.md`, "Checking the UI".
5. A design choice with a visible outcome is shown, not described (the global AGENTS.md): draw the options against
   the specimen.

## Where it comes from, per surface

- **A clarity-app**: `web/design/` holds a copy of `tokens.css` and `fonts/`; pages link `/design/fonts/fonts.css`
  then `/design/tokens.css`. `docs/clarity-app.md` ("Look") has the refresh step.
- **A bb plugin**: the Clarity bb theme (the clarity-theme bb-plugin in dots) defines every `--cl-*` token in bb.
  Use `var(--cl-…, var(<bb variable>))` so the plugin still reads when another theme is on; Tailwind's host token
  classes (`bg-card`, `text-muted-foreground`, …) already follow the theme.
- **genui blocks and inline previews in bb**: bb's variables (`--foreground`, `--primary`, …) are Clarity's while
  the theme is on, but the `--cl-*` tokens don't reach the preview's frame.
- **Any HTML page shown in bb chat** (an `inline-vis` directive or block, an `app` block, a mockup) **is one file.**
  Sibling files don't load there, whatever the inline-vis skill says: a page that links `tokens.css` or the fonts
  shows up unstyled (Bdon hit this twice, the second time 2026-11-27). Build the page with its links as usual, then
  `python3 <dots>/modules/design/bundle.py <page> <page>.bundle.html` and show only the bundle. Check it the way it
  will be seen: copy the bundle alone into an empty folder and screenshot it from there.
- **The bb theme itself**: `modules/design/bb-theme.css` (hand-written mapping) and, from dots,
  `python3 modules/design/bb-theme.py modules/bb/plugins/clarity-theme/themes/clarity.css`. Re-run after any tokens.css change.

## The rules people get wrong first

- Colour means one thing: blue primary/selection/live, cyan info/focus/links, green done, red only attention
  (missed, broken, error), amber wobbling. Ranks are blue, never red. Goal accents mean nothing.
- Rounded squares, never circles or pills: 2px for anything smaller than a row, 4px for panels, buttons, inputs.
- Glow means now or earned. Nothing decorative glows.
- Inside a panel, boxes are fills, never outlines. Chrome sits in panels; content you read sits flat on the page.
- Agents are told apart by icon; only a chat turn also takes its agent's hue (`--cl-agent-*`). Metadata is a chip, never part of a title.
- Dark only: every page declares `<meta name="color-scheme" content="dark">` and `<meta name="darkreader-lock">`.
- Fonts are self-hosted, never a font CDN.
