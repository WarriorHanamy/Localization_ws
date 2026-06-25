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
bun run prod slam               # auto-detect hardware, start slam
bun run prod slam-map           # slam + map export
bun run prod reloc              # relocalization
bun run prod stop               # stop session + containers
bun run prod reset              # full reset
bun run prod attach             # attach to tmux session
bun run prod status             # show status
```

**Usage (from dev-host) — same commands, auto-bridge:**

```bash
bun run prod slam               # auto-SSH to device, no manual wrapping
bun run prod reset              # works identically
bun run prod status             # works identically
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

### Container runtime rule

All ROS node execution must happen inside Docker containers on the Jetson.
Never run `roslaunch`, `rosrun`, or `catkin build` directly on the Jetson host.
The device host is solely a scheduling layer — it runs `bun`, `tmux`, `docker`,
and `ssh` commands.

RVIZ is an exception — it runs natively on the Jetson's display `:0` for GPU
access, viewed remotely via VNC or RustDesk.

### CI certification (agent responsibility)

After any code or config change that affects SLAM behavior, the agent MUST
verify the change before declaring the task complete. This is the agent's
responsibility, never the user's.

**C++ changes** (FAST_LIO/, livox_ros_driver2/, ekf_quat_pose/, incremental_map_publisher/):

```bash
bun run sync && bun run docker-dbuild
```

Dockerfile layered builds keep the rebuild fast — only the changed package layer recompiles.

**bringup/ changes** (launch/*.launch, config/*.yaml, rviz_cfg/*.rviz):

```bash
bun run sync
```

No image rebuild needed — bringup is bind-mounted at container runtime.

**Combined changes** (C++ + bringup):

```bash
bun run sync && bun run docker-dbuild
```

**Every change** must pass:
1. Sync reaches the Jetson without error
2. Build (if applicable) completes without error
3. Result is reported to the user (pass / fail + log path if failed)

The agent MUST NOT ask the user to run sync, build, or docker-dbuild manually.

### Smoke tests (human visual inspection)

Tests that require human visual verification MUST provide a single command:
`bun run smoke <test-name>`. The command is a pure runtime launcher — it
MUST NOT include sync or build (those are the agent's CI responsibility).

The smoke command handles: launch pipeline on the Jetson, open RViz or other
visualization, and auto-attach to display results directly to the user.

Smoke test files follow a `smoke_` prefix convention:
- Config:   `bringup/config/smoke_<test>.yaml`
- Launch:   `bringup/launch/smoke_<test>.launch`
- RVIZ:     `bringup/rviz_cfg/smoke_<test>.rviz`
