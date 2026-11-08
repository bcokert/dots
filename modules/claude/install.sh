# Claude Code: install it, merge the settings dots owns, status line.
# Global instructions come from the agents module.
pkg jq curl

if ! command -v claude >/dev/null && [[ ! -x "$HOME/.local/bin/claude" ]]; then
  fix "installing Claude Code (native installer)"
  curl -fsSL https://claude.ai/install.sh | bash
fi
ok "claude installed"

link statusline.sh "$HOME/.claude/statusline.sh"

# Merge, don't link: Claude Code writes its own changes to settings.json, which must stay local.
settings="$HOME/.claude/settings.json"
if [[ -L "$settings" ]]; then
  mv "$settings" "$settings.bak.$(date +%Y%m%d-%H%M%S)"; fix "backed up symlinked $settings"
fi
current="$(cat "$settings" 2>/dev/null || echo '{}')"
merged="$(jq -s '.[0] * .[1]' <(printf '%s' "$current") "$MODULE_DIR/files/settings.json")"
if [[ "$(jq -S . <<<"$current")" != "$(jq -S . <<<"$merged")" ]]; then
  mkdir -p "$(dirname "$settings")"
  printf '%s\n' "$merged" > "$settings"
  fix "merged dots keys into $settings"
fi
ok "~/.claude/settings.json (dots keys: $(jq -r 'keys | join(", ")' "$MODULE_DIR/files/settings.json"))"
