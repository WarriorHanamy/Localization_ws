# Architecture Decision Records

## ADR 0001: Device Rendering for Human-in-the-Loop Smoke Tests

**Status:** Accepted

**Context:** Smoke tests like `bun run smoke fov` require human visual inspection
of RVIZ point cloud display on the Jetson from the dev-host, with full mouse
interaction (rotate, zoom, select). The rendering pipeline determines how 3D
content reaches the user's screen.

**Decision:** NoMachine (`nxplayer` → Jetson display :0)

RVIZ runs natively on the Jetson display `:0` with the Jetson GPU. The
dev-host connects to the physical desktop through NoMachine over the USB
link (`192.168.55.1:4000`). `bun run smoke fov` and `bun run rviz` require the
NoMachine client; VNC is not an automatic fallback because its point-cloud
interaction and frame rate are insufficient for this smoke test.

On Arch Linux + Wayland + Hyprland, the CLI installs a runtime rule matching
the exact NoMachine class `Nxplayer.bin` and routes newly created viewer
windows silently to workspace 9. Other desktop environments leave placement
to their compositor.

**Alternatives Considered:**

| Alternative          | Why Rejected                                                     |
| -------------------- | ---------------------------------------------------------------- |
| SSH X11 forwarding   | 3D GLX over X11 tunnel is extremely slow for dense point clouds  |
| VNC (`gvncviewer`)   | Functional but too slow for interactive dense point clouds       |
| RustDesk             | Works but requires daemon + local relay server, heavier setup    |
| Web (rosbridge +     | Ideal architecture (more rendering on dev-host GPU), but not   |
| three.js)            | ready yet — frontend needs multi-topic PointCloud2 display       |
| Virtual framebuffer  | Xvfb + x11vnc adds complexity; physical :0 is simpler            |

**Consequences:**
- Jetson must have Xorg session running on display `:0`
- NoMachine server must be enabled on the Jetson and listen on TCP 4000
- Devel-host needs `/usr/NX/bin/nxplayer`; on Arch install `nomachine` from AUR
- The first connection targets `192.168.55.1:4000`; save its `.nxs` profile
- `NOMACHINE_SESSION` can select an explicit `.nxs` profile
- Smoke command auto-launches NoMachine on dev-host + tmux logs in terminal
- Arch + Wayland + Hyprland routes new NoMachine viewers to workspace 9
- ROS topics are shared via `--network host` Docker container

**RVIZ runs natively (temporary):** RVIZ currently runs on Jetson's display `:0`
outside Docker for GPU access. Docker GPU passthrough requires
nvidia-container-toolkit which is not configured. This decision should be
revisited — the long-term goal is running RVIZ inside Docker with GPU
passthrough for a fully containerized rendering pipeline.

## ADR 0002: Build and Fleet Distribution Pipeline

**Status:** Accepted

**Context:**
The project needs to deploy SLAM software to 50+ Jetson aircrafts. The current
workflow (`bun run sync` + `docker-dbuild`) is designed for single-Jetson
development over USB RNDIS (`192.168.55.1`). Three problems emerge at fleet
scale:

1. Each aircraft builds its own Docker image independently; a full build takes
   15-40 minutes per aircraft, totaling 12-33 hours for 50 units — unacceptable.
2. `bun run sync` uses rsync over SSH to a fixed USB IP; aircraft LAN IPs vary,
   so it cannot be reused directly for fleet distribution.
3. `bringup/resource/livox_sdk2/` (31 MB of SDK binaries) is synced every time,
   but these files are only consumed during `docker build` (staged via
   `.docker-sdk/` from `/usr/local/`), never at runtime.

The distribution network is a shared Diff* WiFi LAN where all aircrafts and the
dev-host coexist.

**Decision:**

Layered delivery with the dev-host as a local distribution hub.

| Layer                    | Carrier        | Change Freq | Delivery            |
| ------------------------ | -------------- | ----------- | ------------------- |
| Docker image (~2-5 GB)  | registry:5000  | Medium      | `docker pull`       |
| bringup code (~200 KB)  | HTTP :8080     | High        | `wget tarball`      |
| Livox SDK2 binaries      | (inside image) | Very low    | Excluded from rsync |

**Docker Registry (port 5000)** — A golden Jetson builds the image once via
`docker build` and pushes to a local `registry:2` container on the dev-host.
All 50+ aircrafts pull concurrently over the LAN. Docker layer caching means a
typical code-only update transfers only the changed layers (10-100 MB), not the
full image.

**HTTP static server (port 8080)** — A `python3 -m http.server` serves a
bringup tarball (~200 KB) for configuration file updates. This replaces the
per-aircraft SSH+rsync model with a simple `wget + tar xz` on each aircraft.

**rsync exclusion of Livox SDK2 binaries** — `bringup/resource/` is added to
`RSYNC_EXCLUDES` in `src/core/config.ts`, reducing the sync payload from 37 MB
to ~6 MB. These binaries are only needed during `docker build` on the golden
Jetson (where they are staged from the device's `/usr/local/` into
`.docker-sdk/`), never on fleet Jetsons at runtime.

**Build layers (Dockerfile):**

| Layer            | Content                                                     | Rebuild scope              |
| ---------------- | ----------------------------------------------------------- | -------------------------- |
| Base             | Ubuntu 20.04 ARM64 + ROS Noetic + apt deps                  | Rare (full rebuild)        |
| Layer 1 (stable) | livox_ros_driver2, ekf_quat_pose, incremental_map_publisher | Infrequent (make L1 + L2)  |
| Layer 2 (hot)    | FAST_LIO, bringup                                           | Frequent (make L2 only)    |
| Runtime          | bringup/ bind-mounted, no rebuild needed                    | Immediate (tarball update) |

**Distribution workflow:**

```
[Dev Device]                [Dev-host LAN IP]              [50+ Fleet Devices]
                              ┌──────────────┐
docker build / push ────────► │ registry:2   │ ◄─────────── docker pull
                              │ port 5000    │
                              ├──────────────┤
bringup/ tarball ───────────► │ HTTP server  │ ◄─────────── wget + tar xz
                              │ port 8080    │
                              └──────────────┘
```

**Alternatives Considered:**

| Alternative               | Why Rejected                                           |
| ------------------------- | ------------------------------------------------------ |
| Per-aircraft docker build | 50 × 15-40 min = 12-33 h, unacceptable at fleet scale |
| Feishu cloud drive        | No CLI access, manual download for 50+ units           |
| SCP direct to each IP     | IP list maintenance, no built-in concurrency, SSH keys |
| SD card pre-flashing      | Physical access to 50+ units, no OTA                   |
| Docker Hub / public cloud | Requires internet per aircraft, bandwidth cost         |
| NFS runtime mount         | LAN dependency in flight, single point of failure      |

**Consequences:**
- `dev-host` must open UFW ports 5000 (registry) and 8080 (bringup tarball)
- Each aircraft's Docker daemon needs
  `insecure-registries: ["<dev-host-lan-ip>:5000"]`
- A `bun run docker-push` CLI command is needed for image push workflow
- A `bun run fleet-deploy` CLI command should generate the aircraft-side
  bootstrap script (`docker pull` + `wget` + `docker run`)
- `bringup/resource/` excluded from rsync (already in `RSYNC_EXCLUDES`)
- Registry storage grows with image versions; periodic `docker image prune` or
  tag cleanup is needed
- Layer-aware incremental pulls: code-only changes transfer 10-100 MB,
  not the full 2-5 GB

## ADR 0004: Calibration Workflow — Extrinsic LiDAR-IMU Calibration

**Status:** Accepted

**Context:** LiDAR-IMU calibration (LI-Init) requires Ceres solver for
optimization and Pixhawk IMU data via MAVROS for extrinsic parameter
estimation. The SLAM pipeline also transitions to MAVROS IMU
(`/mavros/imu/data`) as the primary IMU source, replacing the Livox built-in
IMU (`/livox/imu`). MAVROS is therefore a shared dependency for both
images.

Physically, the drone has two IMUs:
- **Pixhawk IMU**: high-accuracy, low-drift, provides absolute gravity
  reference. Topic: `/mavros/imu/data` (filtered).
- **Livox IMU**: on the LiDAR, used as fallback. Topic: `/livox/imu`.

Ceres solver is the differentiating dependency — needed only by LI-Init, not
by the SLAM pipeline. Keeping it out of the main image avoids bloat and
faster SLAM-only builds.

**Decision:**
- `ros-noetic-mavros` + `geographiclib-tools` installed in **both** images
  (`fastlio-jetson` and `fastlio-calib`)
- Ceres solver (`libceres-dev`) installed **only** in `fastlio-calib`
- LI-Init package built **only** in `fastlio-calib` (Layer 2)
- A separate `docker/Dockerfile.calib` defines the calib image
- `bun run docker-dbuild calib` builds the calib image

**Assumptions:**
- Pixhawk (or MAVLink-compatible FCU) connected via `/dev/ttyTHS0:921600`
- LI-Init uses `/mavros/imu/data` (filtered), aligning with the rest of the
  codebase — no `data_raw` usage
- Mid360 and Mid360s share `lidar_type: 1` (Livox CustomMsg) for LI-Init

**Consequences:**
- Two Docker images share MAVROS deps; only Ceres + LI-Init differ
- The calib image is built on-demand — not in the production SLAM pipeline
- CI must rebuild both images when MAVROS-related files change
- MAVROS serial (`/dev/ttyTHS0`) requires `--privileged` (already default)

## ADR 0005: Three-Image Docker Architecture

**Status:** Accepted

**Context:** The calib image (`fastlio-calib`) and SLAM image (`fastlio-jetson`)
share the vast majority of dependencies: Ubuntu base, ROS Noetic, PCL, Eigen,
MAVROS, geographiclib, Livox SDK2, and `livox_ros_driver2`. Maintaining two
independent Dockerfiles (`Dockerfile` and `Dockerfile.calib`) duplicates these
install steps and risks them diverging.

SLAM builds are frequent (FAST_LIO changes often); calib builds are rare. Base
image changes are very rare (ROS/driver updates). Separating into three images
optimizes each build cycle.

**Decision:**

Three Dockerfiles forming a dependency chain:

```
Dockerfile.base ─┬─→ Dockerfile.prod (SLAM)
                  └──→ Dockerfile.calib
```

| Image              | Dockerfile            | Contents                                | Build Frequency |
| ------------------ | --------------------- | --------------------------------------- | --------------- |
| `fastlio-base`     | `Dockerfile.base`     | ROS, MAVROS, SDK2, livox_ros_driver2   | Very rare       |
| `fastlio-jetson`   | `Dockerfile.prod`     | ekf, incr_map, FAST_LIO, bringup       | Frequent        |
| `fastlio-calib`    | `Dockerfile.calib`    | Ceres, LiDAR_IMU_Init                   | Rare            |

`bun run docker-dbuild` builds all three: base → slam → calib.
`bun run docker-dbuild base` builds base only.
`bun run docker-dbuild slam` builds slam only.
`bun run docker-dbuild calib` builds calib only.

**Consequences:**
- Three tags in local Docker registry instead of two
- Base image rebuild is near-instant when unchanged (Docker layer cache)
- `docker-build.ts` Orchestrates the dependency chain automatically

## Workspace Filesystem Mapping

Consistent host-to-container mapping for all packages across images:

| Host path                    | Container path                            | Method     | Image    |
| ---------------------------- | ----------------------------------------- | ---------- | -------- |
| `docker/entrypoint.sh`       | `/entrypoint.sh`                          | COPY       | base     |
| `bringup/resource/livox_sdk2/` | `/usr/local/lib/` `/usr/local/include/` | COPY       | base     |
| `bringup/resource/livox_ros_driver2/` | `/opt/ros/noetic/...`          | COPY       | base     |
| `ros_packages/ekf_quat_pose/` | `/catkin_ws/src/ekf_quat_pose/`         | COPY       | SLAM     |
| `ros_packages/incremental_map_publisher/` | `/catkin_ws/src/incremental_map_publisher/` | COPY | SLAM |
| `ros_packages/FAST_LIO/`      | `/catkin_ws/src/fast_lio/`                | COPY       | SLAM     |
| `ros_packages/LiDAR_IMU_Init/` | `/catkin_ws/src/lidar_imu_init/`        | COPY       | calib    |
| `bringup/`                     | `/catkin_ws/src/bringup/`                 | bind-mount | runtime  |
| `bringup/PCD/` (symlink)       | `/catkin_ws/src/fast_lio/PCD/`            | symlink    | prod     |

PCD is stored under `bringup/PCD/` and symlinked into the FAST_LIO runtime path
at `Dockerfile.prod` build time. Two subdirectories:
- `bringup/PCD/prior/` — prior maps read by FAST_LIO (insert initial_map.pcd here)
- `bringup/PCD/post/` — maps exported by FAST_LIO (scans_*.pcd, new_map.pcd)

No separate PCD bind-mount needed — `bringup/` is already bind-mounted. FAST_LIO
source code reflects this split (C++ paths changed to `PCD/prior/` for reads,
`PCD/post/` for writes).

## Smoke Test Levels

Tests are structured in two layers, each building on the previous:

```
smoke_l1.launch          (LiDAR driver + MAVROS, no consumers)
       │
       ├──→ smoke_l2_slam.launch   (L1 + FAST_LIO)
       ├──→ smoke_l2_fov.launch    (L1 + FAST_LIO + FOV crop)
        └──→ smoke_l2_calib_bag.launch  (bag + LI-Init)
```

| Level | Command                          | Image              | Scope                |
| ----- | -------------------------------- | ------------------ | -------------------- |
| L1    | `bun run smoke l1 <hw>`         | `fastlio-base`     | Driver frequency     |
| L2    | `bun run smoke l2-slam <hw>`    | `fastlio-jetson`   | SLAM pipeline + RVIZ |
| L2    | `bun run smoke l2-fov <hw>`     | `fastlio-jetson`   | FOV overlay + RVIZ   |
| L2    | `bun run smoke l2-calib <hw>`   | `fastlio-calib`    | Calibration + RVIZ   |

L1 scripts (`container-smoke-l1.sh`) replaces the old `container-calib-smoke.sh`
and the now-deleted `container-smoke.sh` (which checked the outdated `/livox/imu`
topic instead of `/mavros/imu/data`).
