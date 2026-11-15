#!/usr/bin/env bash
# Set one value in this computer's ~/.config/dots/bb.env (private, never committed), with a "# KEY: why" comment
# above it. Idempotent; never prints the value. Run ../../install.sh bb afterwards to apply it.
#   modules/bb/set-env.sh KEY VALUE "why"
set -euo pipefail
[[ $# -eq 3 ]] || { echo "usage: $0 KEY VALUE \"why\"" >&2; exit 2; }
key="$1" value="$2" why="$3"
[[ "$key" =~ ^BB_[A-Z_]+$ ]] || { echo "$key: bb.env keys look like BB_SOMETHING" >&2; exit 2; }
f="$HOME/.config/dots/bb.env"; mkdir -p "$(dirname "$f")"; touch "$f"; chmod 600 "$f"
line="$key=$(printf '%q' "$value")"
if grep -qxF "$line" "$f"; then echo "  ✓ $key already set"; exit 0; fi
tmp="$(mktemp "$f.XXXX")"
grep -v -e "^$key=" -e "^# $key: " "$f" > "$tmp" || true
printf '# %s: %s\n%s\n' "$key" "$why" "$line" >> "$tmp"
chmod 600 "$tmp"; mv "$tmp" "$f"
echo "  → set $key in $f"
