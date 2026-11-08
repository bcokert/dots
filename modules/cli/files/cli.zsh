# Debian package names
(( $+commands[batcat] )) && alias bat=batcat
(( $+commands[fdfind] )) && alias fd=fdfind

# Listings (plain ls stays untouched)
alias ll='eza -l --git --group-directories-first'
alias la='eza -la --git --group-directories-first'
alias lt='eza --tree --level=2 --group-directories-first'

# fzf: Ctrl-R history, Ctrl-T pick a file, Alt-C cd
(( $+commands[fzf] )) && source <(fzf --zsh)
