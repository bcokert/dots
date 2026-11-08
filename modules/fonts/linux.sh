# Nerd Fonts has no Debian package: install the release into ~/.local/share/fonts.
pkg fontconfig xz-utils
dir="$HOME/.local/share/fonts/JetBrainsMonoNerdFont"
if ! fc-list | grep -q "JetBrainsMono Nerd Font"; then
  fix "installing JetBrainsMono Nerd Font"
  mkdir -p "$dir"
  curl -fsSL https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.tar.xz | tar -xJ -C "$dir"
  fc-cache -f "$dir" >/dev/null
fi
ok "JetBrainsMono Nerd Font"
