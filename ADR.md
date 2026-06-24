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
