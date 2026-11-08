pkg neovim

# System-wide vi/vim/editor (used by sudo -e, crontab, git without $EDITOR) → neovim.
for name in editor vi vim view vimdiff; do
  target="$(update-alternatives --query "$name" 2>/dev/null | awk '/^Alternative: .*(nvim|neovim)/{print $2; exit}' || true)"
  [[ -n "$target" ]] || continue
  if [[ "$(update-alternatives --query "$name" | awk '/^Value:/{print $2}')" != "$target" ]]; then
    fix "$name → $target"
    sudo update-alternatives --quiet --set "$name" "$target"
  fi
done
ok "system vi/vim/editor → neovim"
