# git: shared config in ~/.config/git/ (linked from dots). ~/.gitconfig stays a plain local file for
# machine-specific settings (identity, gh credential helper); git reads both, and tools write there.
pkg git
link config "$HOME/.config/git/config"
link ignore "$HOME/.config/git/ignore"

if [[ -L "$HOME/.gitconfig" ]]; then
  mv "$HOME/.gitconfig" "$HOME/.gitconfig.bak.$(date +%Y%m%d-%H%M%S)"
  fix "backed up symlinked ~/.gitconfig (it must be a local file)"
fi
[[ -f "$HOME/.gitconfig" ]] || { touch "$HOME/.gitconfig"; fix "created ~/.gitconfig"; }
ok "~/.gitconfig is local"

# Identity is per machine (work vs personal email), so it's asked once and kept in ~/.gitconfig.
for key in name email; do
  if [[ -z "$(git config --global "user.$key" || true)" ]]; then
    [[ -t 0 ]] || fail "git user.$key not set: git config --global user.$key ..."
    read -rp "  git user.$key: " value
    git config --global "user.$key" "$value"
    fix "git user.$key set"
  fi
done
ok "git identity $(git config --global user.name) <$(git config --global user.email)>"
