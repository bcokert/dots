#!/usr/bin/env bash
# One-command setup for a new machine. Clones (or updates) dots and runs install.sh. Safe to re-run.
#   curl -fsSL https://raw.githubusercontent.com/bcokert/dots/main/bootstrap.sh | bash
# While the repo is private (needs gh logged in):
#   gh api repos/bcokert/dots/contents/bootstrap.sh -H 'Accept: application/vnd.github.raw' | bash
# Install location: $DOTS_DIR (default ~/projects/dots). Args pass through to install.sh.
set -euo pipefail
DOTS_DIR="${DOTS_DIR:-$HOME/projects/dots}"
REPO=bcokert/dots

case "$(uname -s)" in
  Darwin)
    if ! command -v brew >/dev/null && [[ ! -x /opt/homebrew/bin/brew ]]; then
      echo "→ installing Homebrew (also brings git)"
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/tty
    fi
    eval "$(/opt/homebrew/bin/brew shellenv)" ;;
  Linux)
    command -v git >/dev/null || { echo "→ installing git"; sudo apt-get update -qq && sudo apt-get install -y -qq git; } ;;
esac

if [[ -d "$DOTS_DIR/.git" ]]; then
  echo "→ updating $DOTS_DIR"
  git -C "$DOTS_DIR" pull --ff-only -q
elif command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  echo "→ cloning $REPO (gh)"
  gh repo clone "$REPO" "$DOTS_DIR" -- -q
else
  echo "→ cloning $REPO"
  git clone -q "https://github.com/$REPO.git" "$DOTS_DIR"
fi

exec "$DOTS_DIR/install.sh" "$@" </dev/tty   # stdin is this script's pipe; prompts need the terminal
