# Clarity design system

One look, feel and set of behaviours for everything Bdon uses: the life dashboard, every clarity-app, bb (theme and
plugins), and later the phone app and notifications. A thing built to this should fit in without anyone being able to
tell where one app ends and the next begins.

- **Tokens**: `tokens.css` here. Every surface imports it; nothing hard-codes a colour, size or radius.
- **Specimen**: `specimen.html` here shows every token, shape, state and component. When a rule changes, change
  the specimen in the same commit. Where a preview can't load sibling files (bb's inline previews), bundle it:
  `python3 modules/design/bundle.py modules/design/specimen.html <out>.html` (from dots) inlines the tokens and fonts into one file.
- **Why it looks like this**: `audit.md` (what existed, the drift, Bdon's decisions).
- **bb**: `bb-theme.css` maps the tokens onto bb's theme variables (plus a small layer for what they can't reach);
  `python3 modules/design/bb-theme.py modules/bb/plugins/clarity-theme/themes/clarity.css` (from dots) joins it with the fonts and tokens into the clarity-theme bb-plugin's
  theme. Re-run it whenever tokens.css changes.
- **Apps**: each keeps a copy of the tokens and fonts in `web/design/` (`docs/clarity-app.md`, "Look").
- Lives in dots (`modules/design/`: public, on every machine and agent), next to the bb theme it generates.

The life dashboard is the reference. When this file and the life dashboard disagree, this file wins and the
dashboard gets fixed.

## Principles

1. **Chrome is command center, content is paper.** Things you look across (dashboards, status, navigation, badges)
   sit in panels with thin luminous edges on a near-black page with a faint grid. Things you read (chat, notes,
   docs, a project's PROJECT.md) sit flat on the page, separated by hairlines. No panel around a paragraph.
2. **Colour means one thing**, everywhere, and position, shape and colour carry meaning before any label does.
3. **Glow means now or earned**: today, a live claim, the current tab, focus, tier badges. Nothing decorative glows.
4. **Rounded squares, never circles.** Marks, chips, pips and status squares are 2px; panels, buttons and inputs
   4px.
5. **Inside a panel, boxes are fills, never outlines.** Only an outer panel keeps an edge.
6. **Nothing empty pretends.** Unset is a grey square the same size as a filled one; an empty box says "Nothing yet"
   once, and draws no placeholder marks.
7. **Every stored field has a visible home**: at least as a list when zoomed all the way in, minimised (never
   dropped) further out. Metadata (owner, claim, author, session) is a chip, never part of a title. Titles stay
   short.
8. **One control per action.** No two ways to do the same thing.
9. **Dashboard, not blog.** No how-to text on screen; tooltips explain.
10. **Everything that's a list can be dragged**: reorder and move between lists, mouse and touch (pointer events,
    long-press on touch; `clarity-todo/web/drag.js`).
11. **Dark only.** Every page declares `<meta name="color-scheme" content="dark">` and `<meta name="darkreader-lock">`
    (Brave's night mode on Bdon's phone otherwise darkens every light grey).

## Colour

| Token | Means | Never |
|---|---|---|
| `--cl-primary` (blue) | the primary action, selection, a live claim (`--cl-live`) | decoration |
| `--cl-info` (cyan) | info, counts, links, focus, drop targets | good or bad |
| `--cl-good` (green) | hit, done, saved | an agent, an accent |
| `--cl-attention` (red) | missed, broken, error, slipping | anything that's merely low (ranks) |
| `--cl-wobble` (amber) | paused, syncing, at risk | an accent |
| `--cl-today` (white) | today's cell, unmarked | a control |
| `--cl-rank-lo` → `--cl-rank-hi` | a 0-10 rank, deep blue to bright cyan | red, ever: low means still learning |
| `--cl-you` / `--cl-you-edge` (blue) | Bdon's own turn in a chat: a 12% `--cl-primary` wash with a 2px left edge. Not selection: selection is an 18% tint with no edge, on a row you can pick; this is a turn you read | anything but his own messages |
| `--cl-agent-claire` / `-personal` / `-work` | whose turn it is in a chat, for an agent: Claire pink-magenta, Bdon's personal login (pods and Host agent) teal, the work login violet. A 6% wash (`--cl-agent-wash`) and a 2px edge at 75%: the session's own agent on the right, an agent talking to it on the left, like Bdon's. Every turn's bar carries its writer's name (Bdon, Claire, Host, Pod, Work; the hue says whose login): a 10px small caps label, set vertically into the top of the bar, which breaks around it. A box is at least as tall as its name, so one-line turns grow a few px | icons, chips, rows, anything outside a chat turn |

- **Accents** belong to a goal (or a checkin group) and colour only its edge bar, its title and its heading square:
  teal, cyan, blue, violet, magenta, gold, slate. They never mean anything. Set one with `data-accent`; everything
  below inherits it. Older tint names in the data map onto these: crimson and rose → magenta, ember, copper and
  amber → gold, green → teal.
- **Agents are told apart by icon; in a chat, also by colour** (the `--cl-agent-*` row above, Bdon 2026-11-26: he mixed up sessions): house (a pod on Bdon's personal login), briefcase (work login), HUD ring (Claire, his chief of staff),
  solid terminal (a Host agent), a person (Bdon), a cog (an app); crown = lead, branch = worker. Icons stay
  `--cl-agent` (neutral). A live claim glows `--cl-live`. One copy of the icons (the spec's SVG masks), used by
  every surface.
- **Contrast floor**: text is at least 4.5:1 on the lightest surface it sits on (`--cl-text-muted` is that floor).
  Text on a bright fill uses `--cl-on-bright`, except on a rank bar: there its names and value stay light and carry a
  dark halo (`--cl-halo`), which sets their contrast wherever the fill ends.
- Status shows in at least two ways (colour plus shape, icon or position), so nothing depends on colour alone.

## Shape

- Radius: `--cl-radius-sm` (2px) for anything smaller than a row: marks, chips, pips, swatches, status squares,
  the check control. `--cl-radius-lg` (4px) for panels, buttons, inputs, tooltips, popovers. No `50%`, no pills.
- A mark is a square: trend days, history cells, a todo's done box, a project's status. Its size is the same filled
  or unset.
- **Outer panel**: a 1px `--cl-line` edge, a gradient from the accent mixed 5% into `--cl-panel-2` down to
  `--cl-panel`, and its accent as a 34x2px bar on the top-left corner (flat, no glow). A goal row's bar runs down its
  left edge instead.
- **Heading**: a small accent square (7px; 5px in a box), then the name in display caps.
- Badge silhouettes (diamond, hexagon, octagon, star, seal) are reserved for the ladder and mean only "tier" (see
  Progression). Any shape that isn't a box is an SVG
  mask (antialiased, corners rounded a little like everything else), never `clip-path`, which draws jagged edges. A
  rim on such a shape is the shape in the rim colour with the art as a slightly smaller copy inside.

## Type

| Role | Font | Size | Notes |
|---|---|---|---|
| Screen heading | display, 600, caps | 20 (28 for a leaf's name) | `--cl-track-display` |
| Panel heading, tabs | display, 600, caps | 16 / 13 | `--cl-track-display` |
| Box heading, small labels | display, 600, caps | 12 / 11 | `--cl-track-label` |
| Body, rows | body, 400-500 | 14 | 20-22px line |
| Notes | body, 400 | 13 | `--cl-text-subtle` |
| Numbers, counts, metadata, breadcrumbs | mono, 500-700 | 11-14, 28 for a big stat | `--cl-track-mono`, tabular |

Eight sizes: 10, 11, 12, 13, 14, 16, 20, 28. Fonts are self-hosted (woff2, Latin subset) by each surface, never
loaded from a font CDN: a third-party request on every view, and broken offline.

## Space and layout

- Spacing comes from the scale: 2, 4, 6, 8, 12, 16, 24, 32. Gaps between cells 8 (6 on a phone), between items 4.
- Hairlines (`--cl-line`) separate rows in content. Panels separate regions in chrome.
- **The zoom rule** (the life dashboard's, and any app that nests): at zoom N the screen is N; N+1 fills it as a
  grid; N+2 shows inside each cell by type, labelled; N+3 only as unlabelled marks; N+4 hidden. Clicking goes one
  level in; Esc and breadcrumbs go out; back goes where you were.

## States

| State | Look |
|---|---|
| Unset | `--cl-unset` square, same size as filled |
| Hit / done | `--cl-good` fill with a small glow; done text goes `--cl-text-muted`, no strikethrough |
| Missed | `--cl-attention` fill with a small glow |
| Today | a solid square glowing in its own colour, brighter than any past day: `--cl-today` unmarked, `--cl-today-good` hit, `--cl-today-attention` missed. Never an outline |
| Future | `--cl-future` |
| Selected / pressed | `--cl-selected` (an 18% `--cl-primary` tint) with `--cl-text-strong`. Tabs: a glowing 2px underline |
| Hover | the fill steps up one (`--cl-fill-2` → `--cl-fill-3`), or a link brightens |
| Focus | 2px `--cl-focus` outline, 2px offset, keyboard only (`:focus-visible`) |
| Disabled | 35% opacity, no pointer |
| Live (in flight) | its chip tinted and glowing `--cl-live`; where only a mark fits (a card's row), the icon alone lit in `--cl-live` with a soft glow, never a filled box |
| Saving | a status square: `--cl-good` saved, `--cl-wobble` syncing, `--cl-attention` error |
| Dragging | the item at 30%; the ghost on `--cl-panel-3` with a `--cl-info` edge; a 2px `--cl-info` drop line; drop-into = a `--cl-info` tint with a 1px edge (drag states are the one place an edge appears inside a panel: they last a second) |
| Error | a toast: `--cl-attention-surface` with a `--cl-attention` edge |

## Components

Each is drawn in the specimen; the life dashboard has the working code.

- **Chip**: 18px (small) or 20px, mono 10-11, `--cl-fill-2`, radius 2. Variants by meaning only (live, lead,
  worker, problem). Holds an icon, a short label, or both.
- **Button**: a fill (`--cl-fill-2`), radius 4, display caps 11; icon-only on phones. One primary per screen at most: `--cl-primary` with `--cl-on-bright` text.
- **Segmented control**: buttons side by side; the pressed one takes the selected state.
- **Tabs**: display caps 13 with a count in mono `--cl-info`; current = underline glow. On phones, a bottom tab bar
  (icon, short label, count badge).
- **Check control**: one 22px square in a 44px target. Binary: unset → done. Habit: unknown → hit → missed → unknown.
- **Trend strip**: a row of day squares, newest right, today glowing.
- **History grid**: weeks as columns, seven rows, every cell tappable to backfill.
- **Rank bar**: a track filled at full strength from `--cl-rank-lo` to `--cl-rank-hi`, low name left, high name right,
  the value last in mono `--cl-text-strong`. No box behind any of it: the text sits on the track or the fill with a
  dark halo (`--cl-halo`; the value `--cl-halo-lit`, which adds a faint glow of its own). Bdon 2026-11-25.
- **Who chips**: the agent icon (`?` for an unknown agent, a mask like every icon), the claim (icon + age, glowing
  while live), the role (crown or branch), linked to the session.
- **Tooltip**: `--cl-overlay`, `--cl-line-2` edge, body 12.
- **Breadcrumbs**: mono 11 caps, `--cl-text-muted`; the current one in the accent. On phones: up, then current.

## Progression

**One ladder everywhere**, like StarCraft II's leagues (bronze → grandmaster mean the same thing in every mode).
Every kind of thing that levels up (a habit's streak, a checkin group's score, anything later) maps its own
measure onto the same tiers, with the same names, shapes, colours and pips, so a tier reads the same wherever it
shows up. **A kind sets only its thresholds**: where each tier above the floor starts, in its own measure.

| Tier | Shape | Art (first pass) | Daily habit | Weekly | Monthly | Checkin group |
|---|---|---|---|---|---|---|
| 0 Dormant | square | flat slate, no glow | 0 | 0 | 0 | 0-19% |
| 1 Kindled | square | green warming to gold | 1-6 | 1-2 | 1-2 | 20-39% |
| 2 Diamond | diamond | faceted blues | 7-20 | 3-6 | 3-4 | 40-54% |
| 3 Plasma | hexagon | living pink-violet | 21-29 | 7-10 | 5-6 | 55-69% |
| 4 Antimatter | octagon | dark core, burning violet rim | 30-59 | 11-19 | 7-11 | 70-84% |
| 5 Reality | star (two squares) | prismatic, turning | 60-99 | 20-39 | 12-23 | 85-94% |
| 6 Ascended | seal (three squares) | white core, double halo | 100+ | 40+ | 24+ | 95%+ |

- **A badge** is the tier's silhouette (an SVG mask), its art, the kind's number (streak length, percent) and its
  pips. The badge's box is the same size whatever the tier, so rows never shift; the silhouette grows a little as
  it climbs (up to 1.3x, `--k`). The code: `place(kind, value)` and `badge()` in the specimen.
- **The shape climbs with the tier**, so a tier reads by shape and colour, never colour alone. Badge silhouettes
  mean "tier" and nothing else: no shape tells a kind apart. The kind comes from where a badge sits (the
  Responsibilities or Laws bin, a checkin group's heading).
- **Pips**: three studs on the badge's bottom edge split each tier's range in thirds (lit `--cl-pip-lit`, still to
  earn `--cl-pip-unlit`, same size). The floor and the top have none. Inside a tier the art also steps up a little
  each check-in (`--f`, 0-100%); at a tier boundary the shape and art change.
- **New** (nothing marked yet) shows no badge: the box stays empty and keeps its room, so rows don't shift and it
  doesn't read as a second control beside the check.
- **Broken is a state, not a tier**: the floor's art inside a `--cl-attention` rim, glowing red. Only kinds that can
  break show it (a streak; a score can't break), so every kind shares one floor.
- **Badges are always bright.** Marked today is the **corner mark** (a 2px rounded square on the top-right, ✓
  `--cl-good` or ✕ `--cl-attention`), never a fade of the badge.
- Glow means earned: every tier above the floor glows in its own colour; the floor doesn't.
- Tier art keeps its own colours (`--cl-tier-*`): they name a tier, never a state, and the silhouette says it's a
  badge. The art is a first pass; the names, shapes, thresholds and pips are the system.
- A new kind: add its thresholds (one column above, one entry in `KINDS`). Nothing else changes.

## Motion

- `--cl-fast` (.15s) for state changes, `--cl-move` (.2s, `--cl-ease`) for a zoom or a panel. Zooms scale 1.5% and
  fade.
- Living tiers (plasma, reality) animate slowly; nothing else moves on its own.
- `prefers-reduced-motion: reduce` turns all of it off.

## Phone

Under 768x600: the same levels in one column; the page scrolls down, never sideways. Tabs move to a bottom tab bar;
the header row is the breadcrumbs (up + current) and the panel buttons. Aggregate harder where room is short (fewer
names, shorter strips). Touch targets 36-44px (`--cl-target-sm`, `--cl-target`). Controls on a row show after a tap,
not on hover. Bdon's phone is Brave on iOS (WebKit); check there.

## Building to it (agents)

1. Import `tokens.css`; use only its tokens. A missing token is a change to this system, not a local hex value.
2. Start from the specimen's markup for any component it has.
3. Check every new surface against the principles above, then screenshot desktop (Chromium) and phone (WebKit,
   iPhone 15) before showing Bdon.
4. A rule that doesn't fit: propose the change to the system (this file, the tokens, the specimen) instead of
   working around it.
