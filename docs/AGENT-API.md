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

| Action          | Command (any host)                     | What it does                              |
| --------------- | -------------------------------------- | ----------------------------------------- |
| **Slam**        | `bun run prod slam [base]`            | Start slam, no map export                 |
| **Slam + map**  | `bun run prod slam-map [base]`        | Start slam + incremental map export       |
| **Reloc**       | `bun run prod reloc [base]`           | Start relocalization (prior map + align)  |
| **Start**       | `bun run prod start <recipe>`         | Start with explicit recipe (no base map)  |
| **Stop**        | `bun run prod stop`                   | Kill tmux + stop/remove containers        |
| **Reset**       | `bun run prod reset`                  | stop + kill native roslaunch/livox/mqtt   |
| **Attach**      | `bun run prod attach`                 | Connect to running tmux session           |
| **Status**      | `bun run prod status`                 | Snapshot: tmux + docker + logs            |

**Base options**: `c5pro-mid360s` (c5pro + dual Mid360s), `c5v1-mid360` (c5v1 + single MID360).

**Recipes** (defined in `src/core/config.ts`):

| Recipe                   | Description                     |
| ------------------------ | ------------------------------- |
| `c5pro-mid360s`          | c5pro + 双 Mid360s slam         |
| `c5pro-mid360s-map`      | c5pro + 双 Mid360s slam + 导出图 |
| `c5pro-mid360s-reloc`    | c5pro + 双 Mid360s 重定位        |
| `c5v1-mid360`            | c5v1 + 单 MID360 slam            |
| `c5v1-mid360-map`        | c5v1 + 单 MID360 slam + 导出图   |
| `c5v1-mid360-reloc`      | c5v1 + 单 MID360 重定位          |
| `l1`                     | L1 驱动频率 (LiDAR + MAVROS)     |
| `l2-slam`                | L2 SLAM 管道 (FAST_LIO)         |
| `l2-fov`                 | L2 SLAM + FOV 裁剪              |
| `l2-calib`               | L2 标定管道 (LI-Init)           |

Hardware base is auto-detected from `/tmp/smoke-hardware` after a smoke test.

**TAB completion** (on device host):

```bash
prod start <TAB>  → recipe names
prod <TAB>        → subcommands
```

**fzf interactive picker** (on device host, TTY):

```bash
bun run prod start  # no recipe → opens fzf menu
```

---

## 2. Build Pipeline

| Action                     | Command                          | What it does                                              |
| -------------------------- | -------------------------------- | --------------------------------------------------------- |
| **Sync workspace**         | `bun run sync`                   | rsync local workspace to device                           |
| **Build SLAM image**       | `bun run docker-dbuild`          | Build `lio-slam:cuda0.0.0-run-ubuntu20.04-arm64` on device via SSH |
| **Build base image**       | `bun run docker-dbuild base`     | Build `lio-base:cuda0.0.0-run-ubuntu20.04-arm64` only     |
| **Build calib image**      | `bun run docker-dbuild calib`    | Build `lio-calib:cuda0.0.0-run-ubuntu20.04-arm64`         |
| **Push to registry**       | `bun run docker-push`            | Tag & push fleet images to local registry from golden Jetson |
| **Start container**        | `bun run docker-start <recipe>`  | Start a named container for a recipe                     |
| **Shell into container**   | `bun run docker-shell <recipe>`  | Exec interactive bash into a running container           |

---

## 3. Registry (fleet distribution)

| Action              | Command                         | What it does                                  |
| ------------------- | ------------------------------- | --------------------------------------------- |
| **Start**           | `bun run registry start`        | Start `registry:2` container + pull tracker   |
| **Stop**            | `bun run registry stop`         | Stop registry + tracker                       |
| **Status**          | `bun run registry status`       | Show registry container/tracker status        |
| **Fleet status UI** | `bun run status fleet`          | Show status and open the fleet tracker page   |

Registry runs on the devel host. Direct registry port: `5443`; fleet tracker/proxy port: `5000`.
Fleet clients pull via `docker pull <lan-ip>:5000/lio-slam:cuda0.0.0-run-ubuntu20.04-arm64`.

---

## 4. Verification

| Action                      | Command                               | What it does                             |
| --------------------------- | ------------------------------------- | ---------------------------------------- |
| **Connectivity check**     | `bun run check`                       | SSH + remote toolchain (catkin, ROS, python3) |
| **L1: Driver smoke**       | `bun run smoke l1 <c5v1|c5pro>`       | LiDAR + MAVROS frequency check (headless) |
| **L2: SLAM smoke**         | `bun run smoke l2-slam <c5v1|c5pro>`  | FAST_LIO SLAM + RVIZ (interactive)       |
| **L2: FOV smoke**          | `bun run smoke l2-fov <c5v1|c5pro>`   | SLAM + FOV crop comparison (RVIZ)        |
| **L2: Calib smoke**        | `bun run smoke l2-calib <c5v1|c5pro>` | LI-Init calibration + RVIZ (interactive) |

---

## 5. Log Observation

All production pipeline logs are persisted to disk on the device via `tee -a`.

| Source             | Log file (on device)                                  | SSH access pattern                                   |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------- |
| **SLAM log**        | `~/rec_loc_ws/logs/fastlio-{recipe}.log`               | `ssh> cat` / `tail -f` / `grep -i error`           |
| **ROS topic log**   | `~/rec_loc_ws/logs/fastlio-{recipe}.topics.log`        | `ssh> cat` / `tail -f` / `grep`                    |
| **Container log**   | `docker logs fastlio-{recipe}`                         | `ssh> docker logs --tail 200`                       |
| **ROS error trace** | Container's `~/.ros/log/`                              | `ssh> docker exec <cont> grep ERROR .../roslaunch-*.log` |

**Note**: `REC_DEVICE_LOC_WS` (default `/home/nv/rec_loc_ws`) is configurable via the `REC_DEVICE_LOC_WS` env var.

Log file properties:
- Written to disk instantly (`tee -a`)
- Survive tmux session death
- No log rotation (external if needed)
- Accessible over USB/RNDIS link

---

## 6. Support

| Action                | Command                                      | What it does                                |
| --------------------- | -------------------------------------------- | ------------------------------------------- |
| **Dashboard**         | `bun run dashboard [--dev] [--no-launch]`    | Web UI server (ROS + MQTT + frontend)       |
| **RViz viewer**       | `bun run rviz [preset] [--viewer ...]`       | Launch RViz on Jetson display + connect viewer |
| **View FAST-LIO**     | `bun run view:fastlio [--reloc]`             | Full dashboard + SLAM pipeline launcher      |
| **Source info**       | `bun run source`                             | Print ROS source commands for eval           |
| **Package paths**     | `bun run paths`                              | Print workspace package paths                |
| **Help**              | `bun run help`                               | Print all CLI commands and usage             |

**RViz presets**: `fast-lio` (default), `livox`.

**Viewer options** (`--viewer` for `rviz`):

| Option       | Description                                   |
| ------------ | --------------------------------------------- |
| `nomachine`  | Default. Open NoMachine client to remote display |
| `rustdesk`   | Open RustDesk (ID: 466016959, pass via `RUSTDESK_PASS` env or `~/.config/l10n/rustdesk.pass`) |
| `none`       | RViz runs headless on Jetson; no local viewer |

Dashboard `--no-launch` skips auto-launching the SLAM pipeline (manual only).

---

## 7. Documentation Web Views

| View | Command | Source of truth |
|------|---------|-----------------|
| Codebase analysis | `bun run doc codebase [--no-open]` | Existing frontend analysis data |
| All recipe pipelines | `bun run doc pipeline [--no-open]` | `RECIPES` + canonical `bringup/launch/` files |
| One recipe pipeline | `bun run doc pipeline <recipe> [--no-open]` | Same, with the requested recipe selected |

Pipeline documents are regenerated before the Web view starts. Their primary
lanes are `devel.host`, `device.host`, and `device.container`; Bun, tmux,
Docker, Livox, and FAST_LIO are components within those entities.

---

## Quick Reference Card

```bash
# === MOST COMMON ===
bun run smoke l1 c5pro          # test LiDAR + MAVROS frequencies
bun run prod slam               # start slam (auto-detect hw)
bun run prod reset              # clean everything
bun run prod status             # what's running?

# === INTERACTIVE SMOKE ===
bun run smoke l2-slam c5pro     # SLAM pipeline + RVIZ
bun run smoke l2-fov c5pro      # SLAM + FOV crop + RVIZ
bun run smoke l2-calib c5pro    # LI-Init calibration + RVIZ

# === TROUBLESHOOT ===
ssh nv@192.168.55.1 'tail -f ~/rec_loc_ws/logs/fastlio-c5pro-mid360s.log'
ssh nv@192.168.55.1 'docker logs --tail 200 fastlio-c5pro-mid360s'
ssh nv@192.168.55.1 'docker exec fastlio-c5pro-mid360s grep ERROR /root/.ros/log/latest/roslaunch-*.log'

# === BUILD & DEPLOY ===
bun run sync                     # push code to device
bun run docker-dbuild            # compile SLAM image
bun run docker-dbuild calib      # compile calib image
bun run docker-push              # push to local registry
bun run check                    # verify SSH + remote toolchain

# === PRODUCTION ===
bun run prod slam                # auto-detected hardware
bun run prod slam-map            # slam + map export
bun run prod reloc               # relocalization
bun run prod start c5v1-mid360   # explicit recipe
bun run prod stop                # stop session only
bun run prod attach              # re-attach to tmux

# === VISUALIZATION ===
bun run rviz                     # RViz on Jetson + NoMachine viewer
bun run rviz --viewer rustdesk   # RViz via RustDesk
bun run view:fastlio             # full dashboard + SLAM

# === REGISTRY ===
bun run registry start           # start fleet registry
bun run registry status          # check registry health
bun run status fleet             # open fleet distribution tracker

# === DASHBOARD ===
bun run dashboard                # web UI (auto-launch SLAM)
bun run dashboard --no-launch    # web UI only, no SLAM
```
