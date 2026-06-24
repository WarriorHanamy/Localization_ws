---
name: entities-development-ids
description: Clarify the four runtime entities (devel-host, device-host, device-container, container-image), their workspace paths, and how to manipulate each. Use when an agent confuses devel machine vs device machine operations.
---

# Entities Development IDs

## 1. Entity IDs

| ID               | Description                 | How to manipulate                    |
| ---------------- | --------------------------- | ------------------------------------ |
| `devel-host`     | Local development machine   | `bun run <cmd>`, direct filesystem   |
| `device-host`    | Jetson bare-metal OS        | `ssh nv@192.168.55.1`, `runSSH(cmd)` |
| `device-container` | Docker container on Jetson | `docker exec <name> bash -c '...'`   |
| `container-image`  | Docker image (snapshot)    | `docker run -d --name ... fastlio-jetson:latest` |

## 2. Workspace Paths

Defined in `src/core/config.ts`:

| Constant            | Value                        | Meaning                          |
| ------------------- | ---------------------------- | -------------------------------- |
| `REC_DEVICE_LOC_WS` | `$REC_DEVICE_LOC_WS` (default: `/home/nv/rec_loc_ws`) | Device-host workspace root |
| (auto)              | `getRepoRoot()`              | Devel-host workspace root        |

Alignment: `bun run sync` (rsync devel-host src/ → device-host `$REC_DEVICE_LOC_WS/`).

## 3. Device Container Runtime Infrastructure

Launch flags (`startContainer` in `src/cli/docker-start.ts`):

```
--network host      share device-host network stack (port 11311, UDP)
--ipc host          shared memory (Livox SDK requires this)
--privileged        hardware passthrough
--name <name>       container identity
```

Container filesystem:

```
/entrypoint.sh                         source ROS + devel, auto-start roscore if none
/opt/ros/noetic/                       ROS Noetic (arm64)
/catkin_ws/devel/                      catkin_make build artifacts (image snapshot)
/catkin_ws/src/bringup/config/         JSON configs, YAML files (image snapshot)
/catkin_ws/src/bringup/launch/         roslaunch files (image snapshot)
/usr/local/lib/                        Livox SDK2 prebuilt .a / .so
/usr/local/include/                    Livox SDK2 headers
```

Bind mounts:

```
-v ${REC_DEVICE_LOC_WS}/PCD:/catkin_ws/src/fast_lio/PCD       (writable PCD output)
-v ${REC_DEVICE_LOC_WS}/bringup:/catkin_ws/src/bringup         (live configs + launch files)
```

## 4. Log Sources

### Docker stdout (json-file driver on device-host)

All node output (`output="screen"` in launch files) goes to container stdout,
captured by Docker's `json-file` logging driver. Access from devel-host:

```
ssh nv@192.168.55.1 'docker logs fastlio-<recipe>[-suffix]'
ssh nv@192.168.55.1 'docker logs --tail 50 -f fastlio-<recipe>[-suffix]'
```

This captures stdout from:

| Node                      | What to look for                           |
| ------------------------- | ------------------------------------------ |
| entrypoint.sh             | roscore startup, ROS env sourcing          |
| livox_lidar_publisher2    | `Init lds lidar failed!`, data rate        |
| laserMapping              | `IMU Init`, point cloud registration       |
| cpu_monitor               | CPU affinity assignment                    |

### ROS log directory (inside container)

Per-launch log dir at `/root/.ros/log/<uuid>/`, symlinked as `latest/`.
Access from devel-host:

```
ssh nv@192.168.55.1 'docker exec <name> tail -100 /root/.ros/log/latest/master.log'
ssh nv@192.168.55.1 'docker exec <name> grep ERROR /root/.ros/log/latest/roslaunch-*.log'
```

| File                | Contents                                   |
| ------------------- | ------------------------------------------ |
| `master.log`        | roscore publisher / subscriber events      |
| `roslaunch-*.log`   | Launch orchestration (process start/stop)  |
| `rosout.log`        | Aggregated `/rosout` topic messages         |

> **Note**: Node output with `output="screen"` (both driver and laserMapping)
> goes to Docker stdout, **not** to these ROS log files. For full node debug
> output, use `docker logs`.

## 5. Workspace Alignment Chain

```
devel-host (src/)  ──rsync──>  device-host ($REC_DEVICE_LOC_WS/)
                                      │
                                docker build (snapshot)
                                      │
                                      ▼
                              container-image (fastlio-jetson:latest)
                                      │
                                docker run -d --name ...
                                      │
                                      ▼
                              device-container (fastlio-{recipe}[-suffix])
```

Image contents are frozen at build time. To update container launch files or configs, rebuild the image (`bun run docker-dbuild`).

## 6. Quick Reference

| Operation                   | Command                                               |
| --------------------------- | ----------------------------------------------------- |
| Check device connectivity   | `bun run check`                                       |
| Sync code to device         | `bun run sync`                                        |
| Build Docker image          | `bun run docker-dbuild`                               |
| Start container             | `bun run docker-start --recipe <name>`                |

| Shell into container        | `bun run docker-shell <recipe>`                       |
| List device-host processes  | `ssh nv@192.168.55.1 'pgrep -af <pattern>'`           |
| List containers             | `ssh nv@192.168.55.1 'docker ps -a'`                  |
| Inspect container logs      | `ssh nv@192.168.55.1 'docker logs <name>'`            |
| Exec in container           | `ssh nv@192.168.55.1 'docker exec <name> <cmd>'`      |
| Smoke test (bare-metal)     | `bun run smoke`                                       |
| Launch dashboard            | `bun run dashboard`                                   |

## 7. Development vs Deployment

- **`smoke.ts`**: checks a **device-host** native ROS deployment (catkin build, no Docker)
- Device-host never runs TypeScript; the Bun CLI runs on the **devel-host** and bridges to both device targets via SSH
