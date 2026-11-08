# dots

My dev environment, for macOS and Linux. Idempotent: re-run any time.

New machine, one command (clones to `~/projects/dots`, then installs):

```sh
curl -fsSL https://raw.githubusercontent.com/bcokert/dots/main/bootstrap.sh | bash
```

Already cloned: `~/projects/dots/install.sh` (or `install.sh <module>...`).
First run asks for the machine type (`types/*.env`) and saves it to `~/.config/dots/type`.
