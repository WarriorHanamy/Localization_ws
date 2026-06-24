# Architecture Decision Records

## ADR 0001: Device Rendering for Human-in-the-Loop Smoke Tests

**Status:** Accepted

**Context:** Smoke tests like `bun run smoke fov` require human visual inspection
of RVIZ point cloud display on the Jetson from the devel-host, with full mouse
interaction (rotate, zoom, select). The rendering pipeline determines how 3D
content reaches the user's screen.

**Decision:** NoMachine (`nxplayer` → Jetson display :0)

RVIZ runs natively on the Jetson display `:0` with the Jetson GPU. The
devel-host connects to the physical desktop through NoMachine over the USB
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
| Web (rosbridge +     | Ideal architecture (more rendering on devel-host GPU), but not   |
| three.js)            | ready yet — frontend needs multi-topic PointCloud2 display       |
| Virtual framebuffer  | Xvfb + x11vnc adds complexity; physical :0 is simpler            |

**Consequences:**
- Jetson must have Xorg session running on display `:0`
- NoMachine server must be enabled on the Jetson and listen on TCP 4000
- Devel-host needs `/usr/NX/bin/nxplayer`; on Arch install `nomachine` from AUR
- The first connection targets `192.168.55.1:4000`; save its `.nxs` profile
- `NOMACHINE_SESSION` can select an explicit `.nxs` profile
- Smoke command auto-launches NoMachine on devel-host + tmux logs in terminal
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
devel-host coexist.

**Decision:**

Layered delivery with the devel-host as a local distribution hub.

| Layer                    | Carrier        | Change Freq | Delivery            |
| ------------------------ | -------------- | ----------- | ------------------- |
| Docker image (~2-5 GB)  | registry:5000  | Medium      | `docker pull`       |
| bringup code (~200 KB)  | HTTP :8080     | High        | `wget tarball`      |
| Livox SDK2 binaries      | (inside image) | Very low    | Excluded from rsync |

**Docker Registry (port 5000)** — A golden Jetson builds the image once via
`docker build` and pushes to a local `registry:2` container on the devel-host.
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
[Golden Jetson]              [Devel-host LAN IP]            [50+ Aircrafts]
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
- `devel-host` must open UFW ports 5000 (registry) and 8080 (bringup tarball)
- Each aircraft's Docker daemon needs
  `insecure-registries: ["<devel-host-lan-ip>:5000"]`
- A `bun run docker-push` CLI command is needed for image push workflow
- A `bun run fleet-deploy` CLI command should generate the aircraft-side
  bootstrap script (`docker pull` + `wget` + `docker run`)
- `bringup/resource/` excluded from rsync (already in `RSYNC_EXCLUDES`)
- Registry storage grows with image versions; periodic `docker image prune` or
  tag cleanup is needed
- Layer-aware incremental pulls: code-only changes transfer 10-100 MB,
  not the full 2-5 GB
