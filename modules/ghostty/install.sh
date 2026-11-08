# Ghostty terminal config (desktop types). Same path on macOS and Linux.
link config "$HOME/.config/ghostty/config"
command -v ghostty >/dev/null || [[ -d /Applications/Ghostty.app ]] || fix "ghostty not found; config is in place for when it's installed"
