# Only on machines you type on: the terminal there renders the glyphs, even for SSH sessions.
# Ghostty gets the font from the ghostty module; other terminals need it set by hand.
if command -v ghostty >/dev/null || [[ -d /Applications/Ghostty.app ]]; then
  ok "ghostty uses JetBrainsMono Nerd Font (ghostty module)"
else
  ok "set your terminal's font to \"JetBrainsMono Nerd Font\" (one-time, in its settings)"
fi
