# IA3 SimWorld CLI Autocompletion

The `ia3ctl` CLI provides native shell completion for **bash**, **zsh**, **fish**, and **powershell**.

## Setup

### 1. Install Tools

```bash
# Install Typer
pip3 install typer

# Create symlink
mkdir -p ~/.local/bin
chmod +x ~/dev_flow/ia3simworld/scripts/ia3ctl.py
ln -sf ~/dev_flow/ia3simworld/scripts/ia3ctl.py ~/.local/bin/ia3ctl

# Verify
ia3ctl --help
```

### 2. Install Completion (automatic)

The easiest way is to let `ia3ctl` auto-detect your shell:

```bash
ia3ctl install-completion
```

Or explicitly specify your shell:

```bash
ia3ctl install-completion --shell bash
ia3ctl install-completion --shell zsh
ia3ctl install-completion --shell fish
```

Then reload your shell:

```bash
source ~/.bashrc  # or ~/.zshrc, ~/.config/fish/config.fish, etc.
```

### 3. Manual Installation (if needed)

If automatic installation doesn't work, you can manually add the completion script:

**Bash** — add to `~/.bashrc`:

```bash
eval "$(ia3ctl completion --shell bash)"
```

**Zsh** — add to `~/.zshrc`:

```bash
eval "$(ia3ctl completion --shell zsh)"
```

**Fish** — add to `~/.config/fish/config.fish`:

```fish
ia3ctl completion --shell fish | source
```

**PowerShell** — add to your PowerShell profile:

```powershell
ia3ctl completion --shell powershell | Out-String | Invoke-Expression
```

## Usage

After installation, completion works automatically:

```bash
ia3ctl dev-<TAB>        # Suggests: dev-lokal-start, dev-lokal-stop, ...
ia3ctl dev-lokal-<TAB>  # Suggests: dev-lokal-start, dev-lokal-status, ...
ia3ctl completion --<TAB> # Suggests: --shell
```

## Commands

- `ia3ctl completion --shell <bash|zsh|fish|powershell>` — Show completion script
- `ia3ctl install-completion [--shell <shell>]` — Install completion permanently
- `ia3ctl completion --help` — Show help
