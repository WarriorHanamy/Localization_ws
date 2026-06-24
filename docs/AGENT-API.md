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
| **Slam**          | `bun run prod slam [base]`            | Start slam, no map export                 |
| **Slam + map**    | `bun run prod slam-map [base]`        | Start slam + incremental map export       |
| **Reloc**         | `bun run prod reloc [base]`           | Start relocalization (prior map + align)  |
| **Stop**          | `bun run prod stop`                   | Kill tmux + stop/remove containers        |
| **Reset**         | `bun run prod reset`                  | stop + kill native roslaunch/livox/mqtt   |
| **Attach**        | `bun run prod attach`                 | Connect to running tmux session           |
| **Status**        | `bun run prod status`                 | Snapshot: tmux + docker + logs            |

**Base options**: `c5pro-mid360s` (c5pro + dual Mid360s), `c5v1-mid360` (c5v1 + single MID360).
After `smoke data_link` passes, base is auto-detected from `/tmp/smoke-hardware`.

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
| **Docker image build** | `bun run docker-dbuild`  | Build fastlio-jetson image with layered catkin_make on device |

---

## 3. Verification

| Action                   | Command                          | What it does                          |
| ------------------------ | -------------------------------- | ------------------------------------- |
| **Connectivity check**  | `bun run check`                  | SSH + remote toolchain verification    |
| **Hardware test**       | `bun run smoke data_link`        | Hardware detection + frequency check (fzf) |
| **FOV visual test**     | `bun run smoke fov`              | FOV crop visual comparison (RVIZ)     |


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

## 6. Documentation Web Views

| View | Command | Source of truth |
|------|---------|-----------------|
| Codebase analysis | `bun run doc codebase` | Existing frontend analysis data |
| All recipe pipelines | `bun run doc pipeline` | `RECIPES` + canonical `bringup/launch/` files |
| One recipe pipeline | `bun run doc pipeline <recipe>` | Same, with the requested recipe selected |

Pipeline documents are regenerated before the Web view starts. Their primary
lanes are `devel.host`, `device.host`, and `device.container`; Bun, tmux,
Docker, Livox, and FAST_LIO are components within those entities.

---

## Quick Reference Card

```bash
# === MOST COMMON ===
bun run smoke data_link          # select hardware → test
bun run prod slam                # start slam (auto-detect hw)
bun run prod reset               # clean everything
bun run prod status              # what's running?

# === TROUBLESHOOT ===
ssh nv@192.168.55.1 'tail -f ~/Localization_ws/logs/fastlio-c5pro-mid360s.log'
ssh nv@192.168.55.1 'docker logs --tail 200 fastlio-c5pro-mid360s'
ssh nv@192.168.55.1 'docker exec fastlio-c5pro-mid360s grep ERROR /root/.ros/log/latest/roslaunch-*.log'

# === BUILD & DEPLOY ===
bun run sync            # push code
bun run docker-dbuild   # compile inside container
bun run check           # verify

# === PRODUCTION ===
bun run prod slam               # auto-detected hardware
bun run prod slam-map           # slam + map export
bun run prod reloc              # relocalization
bun run prod stop               # stop session only
bun run prod attach             # re-attach to tmux
```
