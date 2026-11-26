# Design system audit (2026-11-24)

What exists today, where it drifts, and what Bdon has to decide. Sources: `clarity-todo/web/life.html` (working
copy, Release 2 in flight), the design rules in `clarity-todo/AGENTS.md`, the dots bb plugins, genui, bb's
theme model, and the UI feedback in agent memory. The spec (`DESIGN.md`, `tokens.css`) is built from this.

## Already a system (keep)

The life dashboard is the most current design, and most of it is already rules, written down in clarity-todo's
`AGENTS.md`:

- **Colour means one thing.** Blue/cyan = info and primary. Green = good (hit, done). Red = attention only
  (missed, slipping, error). Amber = wobbling. Ranks are a blue scale (never red: low = still learning). Each goal
  has an accent used on its edge and title only.
- **Unset is a grey square the same size as a filled one.** Nothing empty draws a placeholder mark.
- **Today glows**: a solid square in its own colour with a soft bloom, never an outline. White while unmarked.
- **Inner boxes are fills, never outlines.** Only outer panels keep a thin edge, and each panel carries its
  accent as a short glowing bar on its top-left corner (a left bar on goal rows).
- **Type roles**: Chakra Petch, uppercase and tracked, for names and labels; Inter for body text; JetBrains
  Mono for numbers and metadata.
- **Behaviour**: the zoom rule, one control per action, back goes where you were, dashboard not blog (no how-to
  text), drag and drop everywhere (`web/drag.js`, pointer events), every stored field has a visible home,
  metadata as chips never in titles.
- **Phone**: same levels in one column, page scrolls down never sideways, bottom tab bar, 36-44px targets,
  `color-scheme: dark` + `darkreader-lock` so Brave's night mode leaves it alone.
- **Progression**: habit badges climb a promotion ladder (broken → kindled → diamond → plasma → antimatter →
  reality → ascended); checkin groups climb their own (dormant → … → ascended). Badges are always bright;
  marked-today is a corner pip.
- **Who**: agent icons and colours shared with bb's session list (house / briefcase / solid terminal, crown =
  lead, branch = worker); a live claim glows in its agent's colour.

## Drift and contradictions

### Need Bdon (Decisions, batch 1)

Decided 2026-11-24, all A: command-center chrome with paper content; rounded squares (2px small, 4px large, no
circles); glow means now or earned; goal accents drop crimson, ember, amber and green; agents are told apart by
icon, one live colour. Also: dark only; the system goes public in dots. Bdon wants progression consistent the way
StarCraft II's leagues are (one ladder everywhere), in its own slice.

1. **Paper or command center?** The written principles (agent memory, the end of clarity-todo's AGENTS.md, the
   retired list UI) say "flat and quiet, a sheet of paper, no cards, no extra borders". The life dashboard went
   "command center": panels with luminous edges, glows, a faint grid behind everything. Both can't be the rule
   for bb, where most of the screen is long chat text.
2. **Corners and circles.** life.html is sharp everywhere (radius 0), except five circles: the save dot, the
   project status dot, the frog dot, the ✓/✕ pip on badges, and the accountability toggle (a ring). bb and the
   plugins are rounded. Bdon's own example was "rounded squares, not circles".
3. **What glow means.** Glow is on things that are *now* or *earned* (today's cell, live claims, tier badges,
   the current tab) and also on plain decoration (every panel's accent bar, every heading's square). If glow
   meant only "now or earned", it would read as a signal.
4. **Goal accents that look like meanings.** The accent palette has crimson, ember, amber and green, while the
   rule says a goal's accent is never red or green (they mean attention and good).
5. **Personal agents are green.** The personal-agent colour (`#4cc394`) sits right next to "good" green
   (`#1fdc7a`), so a live claim from a personal agent reads as "done".

Decided 2026-11-24, Badges and progression, all A: one ladder of seven tiers (dormant, kindled, diamond, plasma,
antimatter, reality, ascended) where each kind sets only its thresholds; the silhouette climbs with the tier
(square, square, diamond, hexagon, octagon, star, seal) and means only "tier"; three pips as studs on the bottom
edge; broken is a state on the floor (red rim), not a tier. Also accepted: dormant is the shared floor (the
demon-warrior names retire), checkin bands re-cut for seven tiers, laws and responsibilities no longer differ on the
badge, pips replace diamond's lit border, "corner pip" is now "corner mark". Fixes point 14.

### My calls (in the spec unless Bdon objects)

6. **81 hard-coded colours.** Two greens (`--green` and `--hit`), two blues (`--blue` and `--primary`), the tier
   art, tooltip, error toast and today-white are raw hex. Every colour becomes a token with one name per meaning.
7. **Type scale.** 11 sizes (8-34px) and 8 letter-spacings (.04-.16em). Collapsed to 8 sizes and 3 trackings.
8. **Spacing.** 12 gap values (1-20px). Collapsed to a 2/4/6/8/12/16/24/32 scale.
9. **Chips.** Four chip sizes (`.chip` 20px, `.claim` 18px, `.role`, `.lint` 16px). One chip component, two
   sizes.
10. **Selected state.** Five looks: tabs = glowing underline, segmented buttons = an outline plus glow (an
    outline, against the fills rule), the Done toggle = a fill, accountability = a gold tint, the panel buttons =
    a brighter fill. One rule: selected = a primary-tinted fill; tabs keep their underline.
11. **Done.** Three looks: list rows strike through and go muted, dashboard items just go muted, task squares
    turn green. One rule: a green mark and muted text, no strikethrough.
12. **Fonts load from Google** on every page view, which leaks to a third party and breaks offline. Self-host
    them (woff2, Latin subset) in every app and in the bb theme.
13. **Text contrast.** `--muted` (#5d6f84) is 3.3:1 on the lightest panel, under the 4.5:1 floor; it becomes
    #72869c (4.6:1).
14. **Shape collision.** Hexagons mean "law" (habit badge) and "checkin group" (emblem). "Ascended" is the top
    tier of both ladders and looks different in each. Goes to the Badges and progression slice.

## bb today

bb themes set the palette from two anchors (`--canvas`, `--ink`), plus `--primary`, the text tiers, the
semantic colours (`--destructive`, `--warning`, `--success`, …), `--radius`, the fonts and the terminal
colours. One CSS file, dark and light blocks, applied live on every client. Plugins can add CSS for anything
tokens don't reach, as session-agents already does. So bb can take the palette, type and corners in the theme,
and the signature details (accent bars, glows, square marks) need a plugin CSS layer.

## bb plugins and genui

Read from `dots/modules/bb/plugins/*/app.tsx` and `bb-plugin-genui`. None of them use the life dashboard's
look; they follow bb's default (Tailwind shapes, theme variables), with hard-coded colours where they carry
meaning.

- **Shapes for status disagree.** todo: a round checkbox on rows and a 3px square one in chips. session-agents:
  1.5px rectangles for pips. usage and genui: round dots and bars. Life: squares.
- **Corners**: rounded-full chips (todo), 6px tints (session-agents), rounded-lg panels (usage), rounded-md
  buttons (genui). Nothing is sharp.
- **Four reds** (`#d03a3a`, `#c4153a`, Tailwind red-600, `--destructive`) and three ambers (`#b7791f` for
  archive-pending, amber-500, `--warning`).
- **Colour meanings collide**, the same problem as in life (point 5): personal green `#23845f` is also the done
  pip in session-agents and "OK" in usage. Violet is the work agent in todo and session-agents, and output tokens
  in usage. Sky is the blue flag in todo and input tokens in usage.
- **Uppercase labels**: usage and genui use small tracked caps (like life); todo and session-agents don't.
- **The agent icons are drawn twice** (todo, session-agents, and now life's who chips: three copies of the same
  masks and colours, kept in step by comments). The spec makes them one shared asset.
- genui draws its components from the theme variables (`--success`, `--warning`, `--destructive`, `--primary`,
  `--muted`), so a bb theme reaches it for free. Its own hard-coded bits are Compare's pink ring and shadows.
