# Claude Code: install it, merge the settings dots owns, status line, skills.
# Global instructions come from the agents module.
pkg jq curl

if ! command -v claude >/dev/null && [[ ! -x "$HOME/.local/bin/claude" ]]; then
  fix "installing Claude Code (native installer)"
  curl -fsSL https://claude.ai/install.sh | bash
fi
ok "claude installed"

link statusline.sh "$HOME/.claude/statusline.sh"

# Skills dots owns (files/skills/<name>/SKILL.md), each linked into ~/.claude/skills.
for dir in "$MODULE_DIR"/files/skills/*/; do
  name="$(basename "$dir")"
  link "skills/$name" "$HOME/.claude/skills/$name"
done

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
