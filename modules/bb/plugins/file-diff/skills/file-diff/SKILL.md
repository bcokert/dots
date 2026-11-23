---
name: file-diff
description: File links in replies open on their uncommitted diff (file-diff bb-plugin); link changed files so the user can review them.
---

# File links open a diff

The user has the file-diff bb-plugin: a workspace file link in your reply opens on that file's uncommitted diff,
with a Diff | File toggle. Unchanged files, host (absolute) paths and thread-storage files open bb's preview.

- After changing files, link each one (workspace-relative Markdown link) so the user can review the diff in one click.
- Extensionless files (`Dockerfile`, `Makefile`) and dotfiles (`.env`) open bb's preview, not the diff; mention
  the Git panel for those.
