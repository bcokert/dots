# bb: make this machine's bb server match dots, and keep it that way.
#   - every plugin in plugins/ is built and installed from its path (or rebuilt and reloaded)
#   - third-party plugins (git_plugins) are installed from git, pinned to a reviewed commit
#   - plugin settings are applied (per machine: machine type, then ~/.config/dots/bb.env overrides)
#   - a nightly bb automation pulls dots and re-runs this module, so every bb server stays in sync
# Skipped where no bb server answers. Uses `bb` when it's on PATH, otherwise bb's `npx --package bb-app bb`, so a
# machine with only the bb app needs no extra install.
#
# ~/.config/dots/bb.env (one per computer, never committed; for values too private for this public repo; set one
# with modules/bb/set-env.sh KEY VALUE "why"):
#   BB_SESSION_LABEL=...   label after "Sessions" in the session list (default: DOTS_BB_LABEL from the type)
#   BB_WORK_MACHINES=...   regex (any case) over bb machine names (bb's "machine" = where a session runs on this bb
#                          server, e.g. a second Claude login on the same computer): matches get session-agents'
#                          work icon (default: "work")
#   BB_HOST_MACHINES=...   regex (any case) over bb machine names: Host agents (run directly on a computer, e.g.
#                          "Claude Personal Host"), which get session-agents' solid terminal icon (default: "\bhost$")
#   BB_MACHINE_NAME=...    name of this bb server's own machine, the agent that runs directly on this computer, e.g.
#                          "Claude <account> Host" (default: leave bb's name alone)
#   BB_ACCESS_CLIENT_ID=...      this computer's Cloudflare Access service token, given to every plugin that talks
#   BB_ACCESS_CLIENT_SECRET=...  to an app behind Access (plugins with accessClientId / accessClientSecret settings)
#   BB_PLUGINS_OFF=...     built-in plugins to keep disabled, space-separated (default: environment-git-worktree)
#   BB_THEME=...           bb theme id to keep active (default: plugin:clarity-theme:clarity)
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
  # Runtime dependencies (e.g. zod) get bundled, so they must be installed first; node_modules isn't committed.
  # Dev ones (types, the SDK) aren't needed to build. Re-installed when the lockfile changes.
  if jq -e '(.dependencies // {}) | length > 0' "$dir/package.json" >/dev/null \
    && [[ ! -f "$dir/node_modules/.package-lock.json" || "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]]; then
    command -v npm >/dev/null || fail "bb-plugin $id needs npm (Node) to install its dependencies"
    (cd "$dir" && npm ci --omit=dev --no-audit --no-fund --loglevel=error >/dev/null) || fail "npm ci failed in $dir"
    fix "installed bb-plugin $id's dependencies"
  fi
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

# 1b'. Third-party plugins: installed from git, pinned to the commit we reviewed (their server code runs inside bb
# with this user's rights). Bumping one: read the diff since the pinned commit, then change the sha here. The next run
# removes the old pin and installs the new one; bb deletes a removed plugin's settings, and section 2 sets ours again.
#   genui: our fork of ComicBit/bb-plugin-genui (branch bdon: upstream d8cac8d + closed questions look closed, a lone
#   answer button sends at once, the Clarity design system's rounded squares, info-coloured diffs and a tinted segmented control). Upstreaming
#   is pending; bumping it means rebasing bdon onto upstream.
git_plugins=(
  "genui https://github.com/bcokert/bb-plugin-genui.git ab563a3bc91ede6ac547cd5e2f9ba2330df2e236"
)
for entry in "${git_plugins[@]}"; do
  read -r id url sha <<<"$entry"
  src="$(bbc plugin source "$id" --json 2>/dev/null)" || src=""
  if [[ -n "$src" ]] && grep -q "$sha" <<<"$src"; then ok "bb-plugin $id (${sha:0:7})"; continue; fi
  if [[ -n "$src" ]]; then
    bbc plugin remove "$id" >/dev/null || fail "bb plugin remove $id failed"
    fix "removed bb-plugin $id's old pin"
  fi
  fix "installing bb-plugin $id at ${sha:0:7}"
  bbc plugin install "git:$url@$sha" --yes >/dev/null || fail "bb plugin install git:$url@$sha failed"
  bbc plugin source "$id" --json >/dev/null 2>&1 || fail "installed $url, but not as bb-plugin \"$id\" (bb plugin list): fix its id in git_plugins"
  ok "bb-plugin $id"
done

# 1b''. Plugins we tried and dropped: uninstalled wherever they're still installed.
#   plan-progress: a progress bar per job; not useful in Clarity, where the todos are the live view (Bdon 2026-11-23).
for id in plan-progress; do
  if bbc plugin source "$id" --json >/dev/null 2>&1; then
    bbc plugin remove "$id" >/dev/null || fail "bb plugin remove $id failed"
    fix "removed bb-plugin $id (dropped)"
  fi
  ok "bb-plugin $id: not installed"
done

# 1c. Built-in plugins we don't use stay off. Worktrees: a new session opens the project's own folder (bb's
# "Project checkout"), so the picker is just project + machine; agents handle branches themselves.
for id in ${BB_PLUGINS_OFF-environment-git-worktree}; do
  enabled="$(bbc plugin list --json | jq -r --arg id "$id" '.plugins[] | select(.id == $id) | .enabled' | head -1)"
  [[ -n "$enabled" ]] || { ok "bb-plugin $id: not installed"; continue; }
  if [[ "$enabled" == true ]]; then
    bbc plugin disable "$id" >/dev/null || fail "bb plugin disable $id failed"
    fix "disabled bb-plugin $id"
  fi
  ok "bb-plugin $id: off"
done

# 1d. Theme: bb wears the Clarity design system (plugins/clarity-theme). Set when it isn't the active one, so a
# theme picked by hand in Settings lasts until the next run. BB_THEME in bb.env picks another (e.g. "default").
theme="${BB_THEME:-plugin:clarity-theme:clarity}"
if [[ "$(bbc theme show --json | jq -r .themeId)" != "$theme" ]]; then
  bbc theme set "$theme" >/dev/null || fail "bb theme set $theme failed (bb theme list)"
  fix "theme: $theme"
fi
ok "theme $theme"

# 2. Plugin settings
plugin_setting() { # PLUGIN KEY VALUE
  local now
  now="$(bbc plugin config "$1" --json 2>/dev/null | jq -r --arg k "$2" '.values[$k] | if . == null then "" else tostring end')"
  [[ "$now" == "$3" ]] && return 1
  bbc plugin config "$1" set "$2" "$3" >/dev/null && fix "$1: $2 = \"$3\""
}
changed=0
plugin_setting session-agents label "${BB_SESSION_LABEL:-${DOTS_BB_LABEL:-}}" && changed=1
plugin_setting session-agents workMachines "${BB_WORK_MACHINES:-work}" && changed=1
plugin_setting session-agents hostMachines "${BB_HOST_MACHINES:-\bhost\$}" && changed=1
(( changed )) && bbc plugin reload session-agents >/dev/null
ok "session-agents: label \"${BB_SESSION_LABEL:-${DOTS_BB_LABEL:-}}\", work machines /${BB_WORK_MACHINES:-work}/, host machines /${BB_HOST_MACHINES:-\bhost\$}/"

# 2c. Third-party plugin settings.
#   genui webLookups off: with it on, any https image a reply's UI names is fetched by this bb server, with no tool
#     call to see or approve. A prompt-injected session could put private data in that URL. Off also turns off
#     ImageSearch and Map lookups (photos, place names, map tiles).
changed=0; plugin_setting genui webLookups false && changed=1
(( changed )) && bbc plugin reload genui >/dev/null
ok "genui: web lookups off"

# 2b. This bb server's own machine (the one with no machine provider) gets BB_MACHINE_NAME, if set.
if [[ -n "${BB_MACHINE_NAME:-}" ]]; then
  self="$(bbc machine list --json | jq -c '[.[] | select(.machineProviderId == null)][0] // empty')"
  if [[ -z "$self" ]]; then ok "no local bb machine found: not renaming it"
  elif [[ "$(jq -r .name <<<"$self")" != "$BB_MACHINE_NAME" ]]; then
    bbc machine rename "$(jq -r .id <<<"$self")" "$BB_MACHINE_NAME" >/dev/null \
      || fail "bb machine rename failed (run this from a plain terminal, not one inside a bb thread on another machine)"
    fix "this bb server's machine is now \"$BB_MACHINE_NAME\""
  fi
  ok "machine name \"$BB_MACHINE_NAME\""
fi

# 2a. Session list layout (bb's thread-list): grouped by project, each collapsible, newest session first within a
# project; empty projects hidden. session-agents keeps the projects themselves in most-recently-used order.
list_pref() { # KEY JSON
  [[ "$(bbc thread-list prefs get "$1" --json 2>/dev/null | jq -c '.value')" == "$(jq -c . <<<"$2")" ]] && return 0
  bbc thread-list prefs set "$1" "$2" >/dev/null && fix "session list: $1 = $2"
}
list_pref organizationMode '"project"'
list_pref chronologicalSort '"updated"'
list_pref showEmptyProjects false
ok "session list: by project, newest first, empty projects hidden"

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
