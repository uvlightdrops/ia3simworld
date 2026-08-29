# IA3 SimWorld CLI Autocompletion

The `ia3ctl` CLI supports shell autocompletion for all shells supported by Typer: **bash**, **zsh**, **fish**, and **PowerShell**.

## Setup

First, ensure `ia3ctl` is installed and in your PATH:

```bash
# Create symlink in ~/.local/bin (if not already done)
mkdir -p ~/.local/bin
chmod +x ~/dev_flow/ia3simworld/scripts/ia3ctl.py
ln -sf ~/dev_flow/ia3simworld/scripts/ia3ctl.py ~/.local/bin/ia3ctl

# Verify it works
ia3ctl --help
```

Then proceed with shell-specific completion setup below.

## Quick Install

### Bash

Add this line to your `~/.bashrc`:

```bash
eval "$(_IA3CTL_COMPLETE=bash_source ia3ctl)"
```

Then reload your shell:

```bash
source ~/.bashrc
```

### Zsh

Add this line to your `~/.zshrc`:

```bash
eval "$(_IA3CTL_COMPLETE=zsh_source ia3ctl)"
```

Then reload your shell:

```bash
source ~/.zshrc
```

### Fish

Add this line to your `~/.config/fish/config.fish`:

```fish
env _IA3CTL_COMPLETE=fish_source ia3ctl | source
```

Then reload your shell:

```bash
source ~/.config/fish/config.fish
```

### PowerShell

Add this to your PowerShell profile (get the path with `$profile`):

```powershell
$env:_IA3CTL_COMPLETE = 'powershell_source'; ia3ctl completion --shell powershell | Out-String | Invoke-Expression
```

## Interactive Guide

You can also use the CLI to guide you through the installation:

```bash
python3 scripts/ia3ctl.py completion --shell bash
python3 scripts/ia3ctl.py completion --shell zsh
python3 scripts/ia3ctl.py completion --shell fish
python3 scripts/ia3ctl.py completion --shell powershell
```

## Verify Installation

After installation, try typing:

```bash
ia3ctl dev-<TAB>
```

You should see suggestions for `dev-lokal-start`, `dev-lokal-stop`, etc.

## How It Works

The completion uses Typer's built-in completion system:
- `--install-completion` — automatically installs completion for your shell
- `--show-completion` — shows the raw completion script (for debugging or manual installation)
- `completion` — interactive guide to install completion

The completion script intercepts your shell's tab completion and delegates to `ia3ctl` with special environment variables to generate suggestions.
