# Shared helpers for dots. Sourced, not run.
set -euo pipefail

DOTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$(uname -s)" in
  Linux)  DOTS_OS=linux ;;
  Darwin) DOTS_OS=macos ;;
  *)      echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

if [[ -t 1 ]]; then G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' B=$'\e[1m' N=$'\e[0m'; else G= Y= R= B= N=; fi
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
fix()  { printf '  %s→%s %s\n' "$Y" "$N" "$*"; }
fail() { printf '  %s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }
step() { printf '%s%s%s\n' "$B" "$*" "$N"; }

# Machine type: read from ~/.config/dots/type (or $DOTS_TYPE to preset it).
# First run asks and saves it. Each type is types/<type>.env (sets DOTS_MODULES).
DOTS_TYPE_FILE="$HOME/.config/dots/type"
load_type() {
  local types=() t
  for t in "$DOTS_DIR"/types/*.env; do types+=("$(basename "$t" .env)"); done
  if [[ -z "${DOTS_TYPE:-}" && -f "$DOTS_TYPE_FILE" ]]; then DOTS_TYPE="$(<"$DOTS_TYPE_FILE")"; fi
  if [[ -z "${DOTS_TYPE:-}" ]]; then
    [[ -t 0 ]] || fail "no machine type: set DOTS_TYPE to one of: ${types[*]}"
    echo "Machine type for $(hostname -s)?"
    select DOTS_TYPE in "${types[@]}"; do [[ -n "$DOTS_TYPE" ]] && break; done
  fi
  [[ -f "$DOTS_DIR/types/$DOTS_TYPE.env" ]] || fail "unknown type $DOTS_TYPE (have: ${types[*]})"
  if [[ "$(cat "$DOTS_TYPE_FILE" 2>/dev/null || true)" != "$DOTS_TYPE" ]]; then
    mkdir -p "$(dirname "$DOTS_TYPE_FILE")"; echo "$DOTS_TYPE" > "$DOTS_TYPE_FILE"
    fix "machine type saved: $DOTS_TYPE ($DOTS_TYPE_FILE)"
  fi
  set -a; source "$DOTS_DIR/types/$DOTS_TYPE.env"; set +a
}

# pkg <name>...: install any missing OS packages (apt on linux, brew on macos).
pkg() {
  local missing=() p
  case "$DOTS_OS" in
    linux)
      for p; do dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "ok installed" || missing+=("$p"); done
      if (( ${#missing[@]} )); then
        fix "apt install ${missing[*]}"
        sudo apt-get update -qq && sudo apt-get install -y -qq "${missing[@]}"
      fi ;;
    macos)
      command -v brew >/dev/null || fail "Homebrew required: https://brew.sh"
      for p; do brew list "$p" &>/dev/null || missing+=("$p"); done
      if (( ${#missing[@]} )); then
        fix "brew install ${missing[*]}"
        brew install -q "${missing[@]}"
      fi ;;
  esac
  ok "packages: $*"
}

# link <path in module's files/> <dest>: symlink into place, backing up whatever was there.
link() {
  local src="$MODULE_DIR/files/$1" dest="$2"
  [[ -e "$src" ]] || fail "missing $src"
  if [[ "$(readlink "$dest" 2>/dev/null || true)" != "$src" ]]; then
    if [[ -e "$dest" || -L "$dest" ]]; then
      mv "$dest" "$dest.bak.$(date +%Y%m%d-%H%M%S)"
      fix "backed up existing $dest"
    fi
    mkdir -p "$(dirname "$dest")"
    ln -s "$src" "$dest"
    fix "linked $dest"
  fi
  ok "${dest/#$HOME/\~}"
}
