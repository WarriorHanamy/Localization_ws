# Agent Operating Profile — Localization_ws

## Repo-specific Rules

### Bringup is canonical
All ROS launch files and LiDAR configs live under `bringup/launch/` and `bringup/config/`.
They are the single source of truth. The container bind-mounts them at runtime — no image
rebuild is needed for launch/config changes.

Never search elsewhere for launch files or LiDAR JSON/YAML configs.

### Launch file arg convention
`<arg>` definitions in top-level bringup launchers MUST use `default=` (not `value=`)
for any arg that may be overridden at `docker-start` time (e.g. `bd_list`). Inside `<include>`,
pass the arg via `value="$(arg <name>)"`.

### Entity naming
See `.agents/skills/entities-development-ids/SKILL.md` for the four runtime entities
and their workspace paths.

### Production pipeline (`bun run prod`)

All `bun run prod` commands work **identically on both hosts**.
`prod.ts` auto-detects the host: if `docker` is unavailable it tunnels via SSH.
Recipe definitions live in `src/core/config.ts` (single source of truth).

**Usage (on device):**

```bash
bun run prod start mapping-mid360   # start + auto-attach (most common)
prod start mapping-mid360           # same, with bin/ in PATH
prod start <TAB>                    # TAB completion for recipes
prod start                          # TTY → fzf interactive recipe picker
bun run prod stop                   # stop session + containers
bun run prod reset                  # full reset (stop + kill all processes)
bun run prod attach                 # attach to tmux session
bun run prod status                 # show status
```

**Usage (from devel-host) — same commands, auto-bridge:**

```bash
bun run prod start mapping-mid360   # auto-SSH to device, no manual wrapping
bun run prod reset                  # works identically
bun run prod status                 # works identically
```

#### Conventions

- **Clean state**: Always kills stale tmux session `prod` + stale container
  `fastlio-{recipe}` before starting. No incremental resume.
- **Tee to disk**: All tmux window output pipes through `tee -a` to
  `$WORKSPACE/logs/{container}.log`. Log rotation is external.
- **Auto-attach**: Interactive terminal (`process.stdin.isTTY`) → auto-attach after start.
- **Naming**: Tmux session `prod`, windows `slam` / `topics` / `shell`,
  container `fastlio-{recipe}`, image `fastlio-jetson:latest`.
- **SSH auto-bridge**: `prod.ts` detects `docker` availability; if absent
  (devel host), it wraps the command in `ssh nv@192.168.55.1` automatically.
- **Agent commands**: See `docs/AGENT-API.md` for the complete command reference.
