# bb: install this repo's bb-plugins into the local bb server (skipped where bb isn't installed).
# Each plugins/<name>/ is built and installed from its path, so edits here go live on the next run
# (or instantly with `bb plugin dev plugins/<name>` while working on one).
if ! command -v bb >/dev/null; then ok "bb not installed here: no plugins"; return 0; fi
installed="$(bb plugin list --json | jq -r '.plugins[] | "\(.id) \(.source)"')"
for dir in "$MODULE_DIR"/plugins/*/; do
  dir="${dir%/}"; id="$(basename "$dir")"
  bb plugin build "$dir" >/dev/null || fail "bb plugin build failed: $dir"
  if grep -qx "$id path:$dir" <<<"$installed"; then
    bb plugin reload "$id" >/dev/null || fail "bb plugin reload $id failed (bb plugin logs $id)"
    ok "bb-plugin $id (rebuilt, reloaded)"
  else
    fix "installing bb-plugin $id"
    bb plugin install "$dir" --yes >/dev/null || fail "bb plugin install $dir failed"
    ok "bb-plugin $id"
  fi
done
