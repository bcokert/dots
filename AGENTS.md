# dots

Personal dev environment for any machine (macOS + Linux/Debian). Standalone: it references no other project.

## Conventions

- **Public-safe.** This repo is public. No secrets, tokens, hostnames of private services, work details,
  or personal info beyond name/email. Anything sensitive stays out or goes in a gitignored `*.local` file.
- `install.sh` is idempotent: re-running fixes what's missing and prints one ✓ line for what's fine.
  Use `lib.sh` helpers: `ok`, `fix`, `fail`, `pkg` (apt/brew), `link` (symlink from `files/`).
- One module per concern under `modules/<name>/`. OS-specific bits go in `linux.sh` / `macos.sh`; shared in `install.sh`.
- Machines pick a **type** (`types/<type>.env`: personal-desktop, work-desktop, personal-server, ...), saved per machine in `~/.config/dots/type` (preset with `DOTS_TYPE`). No per-hostname config, no CLI flags.
- Keep it minimal: port only what the user explicitly chose; audit old config piece by piece.
- Shell additions from a module: put a `<module>.zsh` in its `files/` and `link` it to `~/.config/zsh/`; the zshrc sources everything there.
