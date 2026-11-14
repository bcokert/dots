# Send to shell

A terminal button on every shell code block (`bash`, `sh`, `shell`, `zsh`, `console`) in an agent's reply,
in the block's own toolbar next to Wrap lines and Copy code. Click it and the command lands in the thread's terminal prompt, typed but not run: read it, then
press Enter or don't.

- **Where it sits:** bb has no slot for code-block toolbar buttons, so the plugin finds the toolbar (the
  parent of the Copy code button) and mounts the button at its start. If bb's markup changes and there's no
  toolbar, the button drops to a row under the block, never over the code.
- **Which terminal:** the one open in the side panel, else the thread's most recently used, else a new one.
- **Never runs anything.** It strips control characters (so the text can't press Enter or escape the paste)
  and sends it as a bracketed paste, so multi-line blocks arrive as one edit. Needs a shell with bracketed
  paste (zsh, bash 5.1+, fish); in plain `sh`, newlines in a multi-line block would run.
- `console` blocks send only their `$ ` lines, without the `$ `.
- Frontend only: it uses your own bb session. No settings, no storage, no network.

Install: `./install.sh bb` from the dots root (builds and installs every plugin in `modules/bb/plugins/`).
Working on it: `bb plugin dev modules/bb/plugins/send-to-shell` rebuilds and reloads on save.
