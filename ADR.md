# Architecture Decision Records

## ADR 0001: Device Rendering for Human-in-the-Loop Smoke Tests

**Status:** Accepted (temporary — revisit when GPU passthrough is available)

**Context:** Smoke tests like `bun run smoke fov` require human visual inspection
of RVIZ point cloud display on the Jetson from the devel-host, with full mouse
interaction (rotate, zoom, select). The rendering pipeline determines how 3D
content reaches the user's screen.

**Decision:** VNC (`gvncviewer` → Jetson display :0)

RVIZ runs natively on the Jetson display `:0` (GPU-accelerated). A VNC server
shares the desktop frame buffer, and the devel-host opens a VNC viewer to
display it. This pattern is already implemented in `rviz.ts` and `prod.ts` /
`docker-start.ts`.

**Alternatives Considered:**

| Alternative          | Why Rejected                                                     |
| -------------------- | ---------------------------------------------------------------- |
| SSH X11 forwarding   | 3D GLX over X11 tunnel is extremely slow for dense point clouds  |
| RustDesk             | Works but requires daemon + local relay server, heavier setup    |
| Web (rosbridge +     | Ideal architecture (more rendering on devel-host GPU), but not   |
| three.js)            | ready yet — frontend needs multi-topic PointCloud2 display       |
| Virtual framebuffer  | Xvfb + x11vnc adds complexity; physical :0 is simpler            |

**Consequences:**
- Jetson must have Xorg session running on display `:0`
- `x11vnc` (already installed) is started on demand if not running
- Devel-host needs `gvncviewer` or `vncviewer` installed
- Smoke command auto-launches VNC viewer on devel-host + tmux logs in terminal
- ROS topics are shared via `--network host` Docker container

**RVIZ runs natively (temporary):** RVIZ currently runs on Jetson's display `:0`
outside Docker for GPU access. Docker GPU passthrough requires
nvidia-container-toolkit which is not configured. This decision should be
revisited — the long-term goal is running RVIZ inside Docker with GPU
passthrough for a fully containerized rendering pipeline.
