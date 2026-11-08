#!/usr/bin/env bash
# Claude Code status line (managed by dots): model | dir@branch | context used/left | 5h/7d usage | effort
in="$(cat)"
IFS=$'\x1f' read -r model cwd size used five five_at seven seven_at < <(jq -r '[
  .model.display_name // "Claude",
  .workspace.current_dir // .cwd // "",
  .context_window.context_window_size // 200000,
  ((.context_window.current_usage // {}) | (.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)),
  .rate_limits.five_hour.used_percentage // "", .rate_limits.five_hour.resets_at // "",
  .rate_limits.seven_day.used_percentage // "", .rate_limits.seven_day.resets_at // ""
] | map(tostring) | join("\u001f")' <<<"$in")

dim=$'\e[2m' rst=$'\e[0m' blue=$'\e[34m' green=$'\e[32m' yellow=$'\e[33m' red=$'\e[31m'
color() { if (( $1 >= 90 )); then printf %s "$red"; elif (( $1 >= 70 )); then printf %s "$yellow"; else printf %s "$green"; fi; }
k() { if (( $1 >= 1000 )); then printf '%dk' $(( $1 / 1000 )); else printf '%d' "$1"; fi; }
at() { date -d "@$1" +"$2" 2>/dev/null || date -r "$1" +"$2" 2>/dev/null; }   # GNU, then BSD
sep=" ${dim}|${rst} "

out="${blue}${model}${rst}"
if [[ -n "$cwd" ]]; then
  out+="${sep}${cwd##*/}"
  branch="$(git -C "$cwd" branch --show-current 2>/dev/null)"
  [[ -n "$branch" ]] && out+="${dim}@${rst}${green}${branch}${rst}"
fi

(( size > 0 )) || size=200000
pct=$(( used * 100 / size ))
out+="${sep}$(k "$used")/$(k "$size") $(color "$pct")$(( 100 - pct ))% left${rst}"

usage() {   # usage <label> <percent> <reset epoch> <date format>
  [[ -n "$2" ]] || return 0
  local p="${2%.*}"
  out+="${sep}$1 $(color "$p")${p}%${rst}"
  [[ "$3" =~ ^[0-9]+$ ]] && out+=" ${dim}@$(at "$3" "$4")${rst}"
}
usage 5h "$five" "$five_at" '%H:%M'
usage 7d "$seven" "$seven_at" '%b %-d'

effort="${CLAUDE_CODE_EFFORT_LEVEL:-$(jq -r '.effortLevel // empty' ~/.claude/settings.json 2>/dev/null)}"
[[ -n "$effort" ]] && out+="${sep}${dim}${effort}${rst}"

printf '%s' "$out"
