# Agent-agnostic global instructions: one AGENTS.md, linked wherever each agent looks for its global file.
link AGENTS.md "$HOME/.config/agents/AGENTS.md"     # neutral home for tools that take a path
link AGENTS.md "$HOME/.claude/CLAUDE.md"            # Claude Code
link AGENTS.md "$HOME/.codex/AGENTS.md"             # Codex
link AGENTS.md "$HOME/.config/opencode/AGENTS.md"   # opencode

# ~/CLAUDE.md was a mistaken earlier home for these; it only applied to sessions started under ~.
if [[ -f "$HOME/CLAUDE.md" && ! -L "$HOME/CLAUDE.md" ]]; then
  mv "$HOME/CLAUDE.md" "$HOME/CLAUDE.md.bak.$(date +%Y%m%d-%H%M%S)"
  fix "retired ~/CLAUDE.md (backed up)"
fi
ok "no stray ~/CLAUDE.md"
