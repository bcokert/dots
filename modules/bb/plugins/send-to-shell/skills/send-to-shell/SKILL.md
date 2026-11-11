---
name: send-to-shell
description: When the user must run a command themselves, put it in a bash code block so bb shows a one-click "send to shell" button.
---

# Commands the user runs

The user has the send-to-shell bb-plugin: every `bash`, `sh`, `shell`, `zsh` or `console` code block in your
reply gets a button that types the block into the thread's terminal without running it.

- A command the user should run (sudo, interactive prompts, anything you must not run yourself): put it in a
  fenced `bash` block, one command per block when they're separate steps. Not inline code.
- Keep examples you don't want run (output, illustrations) in a `text` block, or inline code.
- The block is typed as-is, so no `$ ` prompts (or use a `console` block, where only `$ ` lines are sent).
