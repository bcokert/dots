# tmux: shared config (linked) + a small rendered host.conf for the machine-type colour.
pkg tmux
link tmux.conf "$HOME/.config/tmux/tmux.conf"

dest="$HOME/.config/tmux/host.conf"
new="$(printf '# Managed by dots (modules/tmux/install.sh), from the machine type. Re-run install.sh to change.\nset -g @host_color "%s"\n' "${DOTS_HOST_COLOR:-yellow}")"
if [[ "$(cat "$dest" 2>/dev/null || true)" != "$new" ]]; then
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$new" > "$dest"
  fix "wrote $dest"
fi
ok "~/.config/tmux/host.conf (host colour ${DOTS_HOST_COLOR:-yellow})"
