---
name: setup-runtime
description: Use when installing or verifying application runtime dependencies on the Jetson device: Bun, fzf, workspace PATH, bash completion for `bun run`. Triggers when user mentions "setup runtime", "install application deps", "configure prod environment", "setup bun on device", or "install dependencies for Localization_ws".
---

# Setup Runtime

Install the application runtime stack on the Jetson device: Bun (TypeScript runtime),
fzf (interactive fuzzy finder), workspace PATH entries, and bash completion for
the `prod` command.

## Prerequisites

- Device SSH accessible (`ssh nv@192.168.55.1`) — see `setup-device` skill first
- Workspace synced to device (`bun run sync` from devel machine)
- Device has sudo access (passwordless, set up by `setup-device`)
- Internet access via wlan0 on the device

## Workflows

### 1. Install system packages

```bash
ssh nv@192.168.55.1 "sudo apt-get install -y unzip fzf"
```

`unzip` is required by the Bun installer. `fzf` provides interactive recipe selection
for `prod start` (when invoked without a recipe name in a TTY).

### 2. Install Bun (TypeScript/JavaScript runtime)

```bash
ssh nv@192.168.55.1 "curl -fsSL https://bun.sh/install | bash"
```

This installs Bun to `~/.bun/bin/bun` and adds the directory to `~/.bashrc`.
Default version is the latest stable.

**Verify:**

```bash
ssh nv@192.168.55.1 "~/.bun/bin/bun --version"
```

Expected output: `1.x.x` (should be >= 1.1.0 for aarch64 support).

### 3. Verify SQLite compatibility

Bun bundles `bun:sqlite` natively, so no separate SQLite installation is needed.
The completion history database is auto-created at `~/.local/state/l10n/completions.db`.

### 5. Create system-wide symlink

Non-interactive SSH commands (`ssh host command`) do not source `.bashrc` or `.profile`,
so `bun` must be available in a standard PATH location.

```bash
ssh nv@192.168.55.1 "sudo ln -sf ~/.bun/bin/bun /usr/local/bin/bun"
```

**Verify (non-interactive):**

```bash
ssh nv@192.168.55.1 "bun --version"
```

Must output the same version without sourcing any profile.

### 6. Configure workspace PATH

Add `Localization_ws/bin/` (the `prod` wrapper) to PATH so `prod start`,
`prod reset`, etc. work from any directory.

Each line is also added independently in the sections below, but the quickest way is
to paste these three lines into both `~/.bashrc` and `~/.profile`:

```bash
export LOCALIZATION_DEVICE_HOST=1
export PATH="$HOME/Localization_ws/bin:$PATH"
source "$HOME/Localization_ws/completions/bun-localization.bash" 2>/dev/null
```

`LOCALIZATION_DEVICE_HOST` is required by `prod.ts` to auto-detect the device host
so it can SSH-bridge from the devel host correctly.

**6.1 Append to `~/.bashrc`** (interactive login shells):

```bash
ssh nv@192.168.55.1 'bash -lc '\''
for f in ~/.bashrc ~/.profile; do
  echo "" >> "$f"
  echo "# Localization_ws convenience" >> "$f"
  echo "export LOCALIZATION_DEVICE_HOST=1" >> "$f"
  echo "export PATH=\"\$HOME/Localization_ws/bin:\$PATH\"" >> "$f"
  echo "source \"\$HOME/Localization_ws/completions/bun-localization.bash\" 2>/dev/null" >> "$f"
done
'\'''
```

### 7. Source the changes

For the current session, source the profile:

```bash
ssh nv@192.168.55.1 "source ~/.profile && source ~/.bashrc && prod --help"
```

Next login will automatically pick up the changes.

## Verification

| Step | Command (from devel machine) | Expected Result |
|------|------------------------------|-----------------|
| Bun installed | `ssh nv@192.168.55.1 "bun --version"` | `1.x.x` |
| fzf installed | `ssh nv@192.168.55.1 "fzf --version"` | `0.x.x` |
| unzip installed | `ssh nv@192.168.55.1 "unzip -v \| head -1"` | `UnZip x.xx` |
| `prod` in PATH | `ssh nv@192.168.55.1 "bash -lc 'which prod'"` | `/home/nv/Localization_ws/bin/prod` |
| Device host marker | `ssh nv@192.168.55.1 "bash -lc 'echo \$LOCALIZATION_DEVICE_HOST'"` | `1` |
| `prod` help | `ssh nv@192.168.55.1 "bash -lc 'prod --help'"` | Shows usage with recipes |
| `bun run` completion | `ssh nv@192.168.55.1 "bash -lc 'type _bun_run_complete'"` | `_bun_run_complete is a function` |
| `--list-recipes` | `ssh nv@192.168.55.1 "bash -lc 'prod --list-recipes'"` | Space-separated recipe names |
| Runtime status | `ssh nv@192.168.55.1 "bash -lc 'prod status'"` | tmux + docker + logs output |

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `bun: command not found` (non-interactive SSH) | Symlink not created | Run step 3; verify `/usr/local/bin/bun` exists |
| `bun: command not found` (after `bash -lc`) | Not in `.bashrc` / `.profile` | Check step 4.1 and 4.2; verify `grep Localization_ws ~/.bashrc` shows the line |
| `prod: command not found` | `bin/` not in PATH | Check step 4; verify `ls ~/Localization_ws/bin/prod` exists on device |
| `fzf: command not found` | Not installed | Run step 1; `sudo apt-get install -y fzf` |
| `--list-recipes` returns nothing | Workspace not synced | Run `bun run sync` from devel machine |
| `Illegal instruction (core dumped)` on older ARM CPUs | LSE atomics issue | Update Bun to >= v1.3.9 (has `-moutline-atomics` fix) |
| TAB completion not working in interactive shell | Completion file not sourced | Verify `source ~/Localization_ws/completions/bun-localization.bash` is in `~/.bashrc` and `~/.profile` |

## Related

- `setup-device` skill — initial Jetson system setup (SSH, mDNS, WiFi, LiDAR interface)
- `ci-cd` skill — build and verification pipeline
