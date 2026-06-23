# Agent API

Reference of all commands the agent uses from the devel host.
Every device interaction goes through `ssh nv@192.168.55.1`.

## Symbol Conventions

- `local$` — run on devel host directly
- `ssh>` — run via `ssh nv@192.168.55.1 '...'`

---

## 1. Production (tmux + docker)

All `bun run prod` commands work identically on both hosts.
When invoked from devel host, `prod.ts` auto-detects that docker is
not available and tunnels via SSH.

| Action            | Command (any host)                     | What it does                              |
| ----------------- | -------------------------------------- | ----------------------------------------- |
| **Start**         | `bun run prod start <recipe>`          | Clean → docker run → tmux 3-window        |
| **Stop**          | `bun run prod stop`                   | Kill tmux + stop/remove containers        |
| **Reset**         | `bun run prod reset`                  | stop + kill native roslaunch/livox/mqtt   |
| **Attach**        | `bun run prod attach`                 | Connect to running tmux session           |
| **Status**        | `bun run prod status`                 | Snapshot: tmux + docker + logs            |

**Recipe names**: `mapping-mid360`, `mapping-mid360-prior`, `mapping-mid360-reloc`,
`mapping-mid360s`, `mapping-mid360s-prior`, `mapping-mid360s-reloc`.

See `src/core/config.ts` for definitions.

**TAB completion** (on device host):

```bash
prod start <TAB>  → recipe names
prod <TAB>        → subcommands
```

**fzf interactive picker** (on device host, TTY):

```bash
prod start  # no recipe → opens fzf menu
```

---

## 2. Build Pipeline

| Action                  | Command                  | What it does                                    |
| ----------------------- | ------------------------ | ----------------------------------------------- |
| **Sync workspace**     | `bun run sync`           | rsync local workspace to device                  |
| **Clean build**        | `bun run build`          | Remote catkin clean build                        |
| **Incremental build**  | `bun run increment`      | rsync + remote incremental catkin build          |
| **Full rebuild**       | `bun run full`           | rsync + remote clean catkin rebuild              |
| **Single package**     | `bun run build-pkg <pkg>`| Build one ROS package remotely                   |
| **Docker image build** | `bun run docker-dbuild`  | Build `fastlio-jetson:latest` on device           |

---

## 3. Verification

| Action                   | Command                          | What it does                          |
| ------------------------ | -------------------------------- | ------------------------------------- |
| **Connectivity check**  | `bun run check`                  | SSH + remote toolchain verification    |
| **Smoke test**          | `bun run smoke [--level slam]`   | FAST-LIO smoke test checklist          |
| **Docker smoke**        | `bun run docker-smoke <cont>`    | Start + smoke-test device container    |

---

## 4. Log Observation

All production pipeline logs are persisted to disk on the device via `tee -a`.

| Source               | Log file (on device)                              | SSH access pattern                                 |
| -------------------- | ------------------------------------------------- | -------------------------------------------------- |
| **SLAM log**          | `~/Localization_ws/logs/fastlio-{recipe}.log`       | `ssh> cat` / `tail -f` / `grep -i error`         |
| **ROS topic log**     | `~/Localization_ws/logs/fastlio-{recipe}.topics.log`| `ssh> cat` / `tail -f` / `grep`                  |
| **Container log**     | `docker logs fastlio-{recipe}`                     | `ssh> docker logs --tail 200`                     |
| **ROS error trace**   | Container's `~/.ros/log/`                          | `ssh> docker exec <cont> grep ERROR .../roslaunch-*.log` |

Log file properties:
- Written to disk instantly (`tee -a`)
- Survive tmux session death
- No log rotation (external if needed)
- Accessible over USB/RNDIS link

---

## 5. Support

| Action              | Command                          | What it does                          |
| ------------------- | -------------------------------- | ------------------------------------- |
| **Dashboard**       | `bun run dashboard [--dev]`      | Web UI server (ROS + MQTT)            |
| **RViz viewer**     | `bun run rviz [preset]`          | Launch RViz on Jetson display         |
| **Source info**     | `bun run source`                 | Print ROS source commands for eval    |
| **Package paths**   | `bun run paths`                  | Print workspace package paths         |

---

## Quick Reference Card

```bash
# === MOST COMMON ===
bun run prod start mapping-mid360    # start + auto-attach
bun run prod reset                   # clean everything
bun run prod status                  # what's running?

# === TROUBLESHOOT ===
ssh nv@192.168.55.1 'tail -f ~/Localization_ws/logs/fastlio-mapping-mid360.log'
ssh nv@192.168.55.1 'docker logs --tail 200 fastlio-mapping-mid360'
ssh nv@192.168.55.1 'docker exec fastlio-mapping-mid360 grep ERROR /root/.ros/log/latest/roslaunch-*.log'

# === BUILD & DEPLOY ===
bun run sync            # push code
bun run build           # compile
bun run check           # verify

# === PRODUCTION ===
bun run prod stop       # stop session only
bun run prod attach     # re-attach to tmux
bun run prod start mapping-mid360-prior  # with prior map
bun run prod start mapping-mid360-reloc  # with prior + alignment
```
