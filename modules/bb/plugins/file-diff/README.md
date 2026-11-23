# File diff

Click a file link in a bb thread and, if the file has uncommitted changes, it opens on its diff, with a small
**Diff | File** toggle in the corner. Files without uncommitted changes open bb's own preview, no toggle.

- **What counts as changed:** anything in bb's Git "Uncommitted" list for the thread's environment, including new
  untracked files (shown all green). Binary and too-large files open the preview.
- **Workspace files only.** Host files (absolute paths) and thread-storage files always get bb's preview.
- **Which files:** a `fileOpener` for ~100 common extensions (the list is in `app.tsx`). bb picks openers by the
  file name's last-dot extension and has no wildcard, so extensionless files (`Dockerfile`, `Makefile`) and
  dotfiles (`.env`, `.zshrc`) never reach it; `foo.env` and `app.dockerfile` do.
- **Takes the default from Monaco and Markdown.** It's installed by you, so bb picks it ahead of the bundled
  File Editor (Monaco) and Markdown openers for the same extensions. Want one of those back for a type: Settings →
  Files → File openers (per browser), or right-click a link → Open with.
- Frontend only: reads bb's Git plugin (`files` + keyed `patches`) with your own bb session and draws the diff
  with bb's diff viewer. No settings, no storage, no network.

Install: `./install.sh bb` from the dots root (builds and installs every plugin in `modules/bb/plugins/`).
Working on it: `bb plugin dev modules/bb/plugins/file-diff` rebuilds and reloads on save.
