# clarity-theme

bb wearing the Clarity design system: one theme, `plugin:clarity-theme:clarity` in Settings → Appearance and
`bb theme list`. The rules behind it are in the design system's DESIGN.md; the values in its tokens.css.

- `themes/clarity.css` is generated: `python3 modules/design/bb-theme.py modules/bb/plugins/clarity-theme/themes/clarity.css`, run from dots. Edit
  tokens.css or bb-theme.css in `modules/design/`, never this file.
- It also defines every `--cl-*` token, so other plugins style themselves with `var(--cl-…)` instead of
  hard-coded colours. They should still fall back to bb's variables when the theme is off.
- Dark only: light mode gets the same dark values.
- `modules/bb/install.sh` installs it like any plugin here and makes it the active theme.
