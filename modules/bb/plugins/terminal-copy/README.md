# Terminal copy

Select and copy terminal text on a phone. bb's terminal draws to a canvas, so there's nothing to long-press;
this adds a small text-select button in the top right corner of the terminal panel. Tap it and the terminal's
text opens as plain text you can select the normal way (long-press, drag the handles, Copy in the system menu).

- **Copy** copies your selection, or everything if nothing is selected.
- **Add to message** puts the same text in this thread's message box as a code block. Nothing is sent.
- It opens scrolled to the bottom, where the error usually is.
- **Where the text comes from:** the terminal's scrollback via bb's terminal API (last ~2 MB), replayed through
  a headless xterm (`@xterm/headless`, bundled) at the terminal's size, so colors, progress redraws and wrapped
  lines come out as you saw them. It's a snapshot from when you tapped; tap again for newer output.
- **Desktop:** the button is there too, but selecting in the terminal itself works as before.
- Frontend only: your own bb session, no settings, no storage, no network. bb has no slot for terminal
  toolbar buttons, so the button is mounted into the terminal's own box and removed on unload. If bb's markup
  changes it just doesn't show.

Install: `./install.sh bb` from the dots root.
Working on it: `bb plugin dev modules/bb/plugins/terminal-copy`.
