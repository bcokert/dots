# Send to shell

A small **shell** button on every shell code block (`bash`, `sh`, `shell`, `zsh`, `console`) in an agent's
reply. Click it and the command lands in the thread's terminal prompt, typed but not run: read it, then
press Enter or don't.

- **Which terminal:** the one open in the side panel, else the thread's most recently used, else a new one.
- **Never runs anything.** It strips control characters (so the text can't press Enter or escape the paste)
  and sends it as a bracketed paste, so multi-line blocks arrive as one edit. Needs a shell with bracketed
  paste (zsh, bash 5.1+, fish); in plain `sh`, newlines in a multi-line block would run.
- `console` blocks send only their `$ ` lines, without the `$ `.
- Frontend only: it uses your own bb session. No settings, no storage, no network.

Install: `./install.sh bb` from the dots root (builds and installs every plugin in `modules/bb/plugins/`).
Working on it: `bb plugin dev modules/bb/plugins/send-to-shell` rebuilds and reloads on save.
