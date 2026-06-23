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

### Device host never runs TypeScript
`bun run` executes on the devel-host. The device-host (Jetson) has no Bun/TS runtime.
All device-host commands go through `ssh nv@192.168.55.1` (`runSSH`).

### Entity naming
See `.agents/skills/entities-development-ids/SKILL.md` for the four runtime entities
and their workspace paths.
