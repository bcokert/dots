# bb: make this machine's bb server match dots, and keep it that way.
#   - every plugin in plugins/ is built and installed from its path (or rebuilt and reloaded)
#   - plugin settings are applied (per machine: machine type, then ~/.config/dots/bb.env overrides)
#   - a nightly bb automation pulls dots and re-runs this module, so every bb server stays in sync
# Skipped where no bb server answers. Uses `bb` when it's on PATH, otherwise bb's `npx --package bb-app bb`, so a
# machine with only the bb app needs no extra install.
#
# ~/.config/dots/bb.env (per machine, never committed; for values too private for this public repo):
#   BB_SESSION_LABEL=...   label after "Sessions" in the session list (default: DOTS_BB_LABEL from the type)
#   BB_WORK_MACHINES=...   regex: machines whose name matches get session-agents' work icon (default: "work")
#   BB_ACCESS_CLIENT_ID=...      this machine's Cloudflare Access service token, given to every plugin that talks
#   BB_ACCESS_CLIENT_SECRET=...  to an app behind Access (plugins with accessClientId / accessClientSecret settings)
#
# Plugins here are clients of apps' public APIs (through the app's own auth), never of local files or ports, so the
# same plugin works on every bb server.
BB_ENV_FILE="$HOME/.config/dots/bb.env"
[[ ! -f "$BB_ENV_FILE" ]] || { set -a; source "$BB_ENV_FILE"; set +a; }
# A Mac with only the bb app has no bb CLI and maybe no Node: Node brings npx, which runs bb's CLI.
if ! command -v bb >/dev/null && ! command -v npx >/dev/null && [[ "$DOTS_OS" == macos ]]; then pkg node; fi
if command -v bb >/dev/null; then bbc() { bb "$@"; }
elif command -v npx >/dev/null; then bbc() { npx -y --package bb-app bb "$@"; }
else ok "no bb CLI and no npx: skipping"; return 0; fi
installed="$(bbc plugin list --json 2>/dev/null | jq -r '.plugins[] | "\(.id) \(.source)"')" \
  || { ok "no bb server running here: skipping"; return 0; }

# 1. Plugins
for dir in "$MODULE_DIR"/plugins/*/; do
  dir="${dir%/}"; id="$(basename "$dir")"
  bbc plugin build "$dir" >/dev/null || fail "bb plugin build failed: $dir"
  if grep -qx "$id path:$dir" <<<"$installed"; then
    bbc plugin reload "$id" >/dev/null || fail "bb plugin reload $id failed (bb plugin logs $id)"
    ok "bb-plugin $id (rebuilt, reloaded)"
  else
    fix "installing bb-plugin $id"
    bbc plugin install "$dir" --yes >/dev/null || fail "bb plugin install $dir failed"
    ok "bb-plugin $id"
  fi
done

# 1b. A plugin installed from a folder that no longer exists is gone for good: uninstall it.
while read -r id src; do
  [[ "$src" == path:* && ! -d "${src#path:}" ]] || continue
  bbc plugin uninstall "$id" >/dev/null || fail "bb plugin uninstall $id failed"
  fix "uninstalled bb-plugin $id (its folder ${src#path:} is gone)"
done <<<"$installed"

# 2. Plugin settings
plugin_setting() { # PLUGIN KEY VALUE
  local now
  now="$(bbc plugin config "$1" --json 2>/dev/null | jq -r --arg k "$2" '.values[$k] // ""')"
  [[ "$now" == "$3" ]] && return 1
  bbc plugin config "$1" set "$2" "$3" >/dev/null && fix "$1: $2 = \"$3\""
}
changed=0
plugin_setting session-agents label "${BB_SESSION_LABEL:-${DOTS_BB_LABEL:-}}" && changed=1
plugin_setting session-agents workMachines "${BB_WORK_MACHINES:-work}" && changed=1
(( changed )) && bbc plugin reload session-agents >/dev/null
ok "session-agents: label \"${BB_SESSION_LABEL:-${DOTS_BB_LABEL:-}}\", work machines /${BB_WORK_MACHINES:-work}/"

# 2b. App credentials: plugins that call an app behind Cloudflare Access get this machine's service token. The
# secret is write-only in bb, so it's (re)written whenever the client ID changes.
for id in $(bbc plugin list --json | jq -r '.plugins[] | select(.source | startswith("path:")) | .id'); do
  cfg="$(bbc plugin config "$id" --json 2>/dev/null)" || continue
  jq -e '.schema.accessClientId and .schema.accessClientSecret' <<<"$cfg" >/dev/null || continue
  if [[ -z "${BB_ACCESS_CLIENT_ID:-}" || -z "${BB_ACCESS_CLIENT_SECRET:-}" ]]; then
    warn "$id: no BB_ACCESS_CLIENT_ID / BB_ACCESS_CLIENT_SECRET in $BB_ENV_FILE, so it can't reach its app"
  elif [[ "$(jq -r '.values.accessClientId // ""' <<<"$cfg")" != "$BB_ACCESS_CLIENT_ID" ]]; then
    bbc plugin config "$id" set accessClientSecret "$BB_ACCESS_CLIENT_SECRET" >/dev/null || fail "$id: setting accessClientSecret failed"
    bbc plugin config "$id" set accessClientId "$BB_ACCESS_CLIENT_ID" >/dev/null || fail "$id: setting accessClientId failed"
    bbc plugin reload "$id" >/dev/null
    fix "$id: this machine's Access service token"
  else
    ok "$id: Access service token"
  fi
done

# 3. Stay in sync: a nightly automation (in bb's Personal project) pulls dots and re-runs this module.
name="dots: keep bb in sync"
personal="$(bbc project list --include-personal --json | jq -r '.[] | select(.kind == "personal") | .id' | head -1)"
if [[ -z "$personal" ]]; then
  warn "no Personal project in bb: no nightly sync"
elif bbc automation list --project "$personal" --json 2>/dev/null | jq -e --arg n "$name" '[.. | objects | select(.name? == $n)] | length > 0' >/dev/null; then
  ok "nightly sync automation \"$name\""
else
  tz="$(timedatectl show -p Timezone --value 2>/dev/null || readlink /etc/localtime 2>/dev/null | sed 's#.*/zoneinfo/##')"
  path="$HOME/.local/bin:$(dirname "$(command -v git)"):$(dirname "$(command -v node 2>/dev/null || echo /usr/bin/node)"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
  script="export PATH='$path'; cd '$DOTS_DIR' && git pull --ff-only -q && ./install.sh bb"
  bbc automation create --project "$personal" --name "$name" --cron "30 4 * * *" --timezone "${tz:-UTC}" \
    --interpreter bash --working-directory automation-storage --timeout 600000 --script "$script" >/dev/null \
    || fail "couldn't create the nightly sync automation"
  fix "created nightly automation \"$name\" (04:30 ${tz:-UTC}): pulls dots, re-runs ./install.sh bb"
fi
