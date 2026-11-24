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
- **Open the files it mentions.** Under the block, one small "Open <file>" link per file path in the command
  (up to 4): absolute (`/tmp/x.sh`), `~/...`, or relative (`host/provision.sh`, `./a.log`), so you can read a
  script before you run it. It opens bb's own file preview, on desktop and phone. Skipped: flags (and their
  `=value`), URLs, globs, `$vars`, directories, comments, and paths with spaces. Relative paths resolve against
  the thread's workspace (a `cd` earlier in the command isn't followed); `~` is guessed from it (`/home/<user>`),
  so on an odd layout those links report an error instead of opening. Paths under `.bb/thread-storage/<thread>`
  open as thread files, paths inside the workspace as workspace files, the rest as files on the thread's machine.
  Extraction lives in `paths.ts`; check it with `node paths.test.ts`.
- Frontend only: it uses your own bb session. No settings, no storage, no network.

Install: `./install.sh bb` from the dots root (builds and installs every plugin in `modules/bb/plugins/`).
Working on it: `bb plugin dev modules/bb/plugins/send-to-shell` rebuilds and reloads on save.
