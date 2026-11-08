#!/usr/bin/env bash
# Install dots on this machine. Idempotent: re-run any time; fixes what's missing, skips what's fine.
#
#   ./install.sh            # every module for this machine's type
#   ./install.sh shell git  # only these modules
#
# Machine type (personal-desktop, work-desktop, personal-server, ...) is asked once and saved to
# ~/.config/dots/type; preset it non-interactively with DOTS_TYPE=<type>. Types live in types/<type>.env.
# Each module: modules/<name>/{linux.sh,macos.sh} (OS-specific, runs first, optional),
# install.sh (shared), files/ (symlinked into place).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_type

[[ $EUID -ne 0 ]] || fail "run as your normal user, not root"
step "dots on $(hostname -s) ($DOTS_OS, $DOTS_TYPE)"

for m in ${*:-$DOTS_MODULES}; do
  MODULE_DIR="$DOTS_DIR/modules/$m"
  [[ -d "$MODULE_DIR" ]] || fail "no module: $m"
  step "$m"
  (
    [[ ! -f "$MODULE_DIR/$DOTS_OS.sh" ]] || source "$MODULE_DIR/$DOTS_OS.sh"
    [[ ! -f "$MODULE_DIR/install.sh" ]] || source "$MODULE_DIR/install.sh"
  )
done
step "done"
