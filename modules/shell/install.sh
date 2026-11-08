# zsh + starship: config files, and zsh as the login shell.
link zshrc "$HOME/.zshrc"
link aliases.zsh "$HOME/.config/zsh/aliases.zsh"

# starship.toml is rendered (not linked) so the host colour can follow the machine type.
dest="$HOME/.config/starship.toml"
new="$(sed "s/__HOST_COLOR__/${DOTS_HOST_COLOR:-yellow}/g" "$MODULE_DIR/files/starship.toml.tmpl")"
if [[ "$(cat "$dest" 2>/dev/null || true)" != "$new" ]]; then
  if [[ -e "$dest" ]] && ! head -1 "$dest" | grep -q '^# Managed by dots'; then
    mv "$dest" "$dest.bak.$(date +%Y%m%d-%H%M%S)"; fix "backed up existing $dest"
  fi
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$new" > "$dest"
  fix "wrote $dest"
fi
ok "~/.config/starship.toml (host colour ${DOTS_HOST_COLOR:-yellow})"

zsh_path="$(command -v zsh)"
case "$DOTS_OS" in
  linux) login_shell="$(getent passwd "$USER" | cut -d: -f7)" ;;
  macos) login_shell="$(dscl . -read "/Users/$USER" UserShell | awk '{print $2}')" ;;
esac
if [[ "$login_shell" != "$zsh_path" ]]; then
  fix "login shell → $zsh_path (asks for your password; takes effect on next login)"
  chsh -s "$zsh_path"
fi
ok "login shell zsh"
