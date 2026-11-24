# Scroll guard

On the phone, a sideways drag inside a diff drags the right panel (or the sidebar) instead of scrolling the diff.
This fixes that: a drag that starts in anything that scrolls sideways (diffs, wide code blocks, tables) scrolls it
and never reaches the panel swipe.

- **Why it broke:** bb already skips the swipe when the touch starts in a horizontally scrolling element, but it
  finds that element by walking up from the event target. bb's diff viewer lives in a shadow root, so from outside
  the target is the shadow host and the scroller is invisible to it.
- **What it does:** on touchstart (and touch pointerdown) it looks through the real event path, shadow roots
  included. If something in it scrolls sideways, it sets bb's own opt-out attributes (`data-no-sidebar-swipe`,
  `data-no-secondary-panel-swipe`) on the target until the finger lifts. bb does the rest.
- **Mouse and desktop:** untouched. Only touch events are looked at.
- **Turn the swipe off everywhere:** bb has no setting for it. Flip `NEVER_SWIPE` to `true` at the top of
  `app.tsx` and no drag moves the panel or sidebar, edge swipes included.
- Frontend only: no settings, no storage, no network. It decorates bb's own DOM and undoes it on unload; if bb
  changes the attribute names, the swipe just goes back to how bb ships it.

Install: `./install.sh bb` from the dots root (builds and installs every plugin in `modules/bb/plugins/`).
Working on it: `bb plugin dev modules/bb/plugins/scroll-guard` rebuilds and reloads on save.
