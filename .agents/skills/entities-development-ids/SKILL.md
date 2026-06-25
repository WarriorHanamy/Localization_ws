---
name: entities-development-ids
description: Clarify the five runtime entities (dev-host, dev-device, fleet-device, device-container, device-image), their workspace paths, and how to manipulate each. Use when an agent confuses development Jetson vs fleet Jetson operations.
---

# Entities Development IDs

## 1. Entity IDs

| ID                 | Description                          | How to manipulate                              |
| ------------------ | ------------------------------------ | ---------------------------------------------- |
| `dev-host`         | Local development workstation (x86)  | `bun run <cmd>`, direct filesystem             |
| `dev-device`       | Development Jetson (USB-connected)   | `ssh nv@192.168.55.1`, `runSSH(cmd)`           |
| `fleet-device`     | Production Jetson on aircraft (WiFi) | Self-contained, no external SSH control        |
| `device-container` | Docker container on any Jetson       | `docker exec <name> bash -c '...'`             |
| `device-image`     | Docker image (build snapshot)        | `docker run -d --name ... fastlio-jetson:latest` |

### `dev-device` vs `fleet-device`

| Dimension           | `dev-device`                              | `fleet-device`                            |
| ------------------- | ----------------------------------------- | ----------------------------------------- |
| Network             | USB RNDIS (`192.168.55.1`)                | WiFi LAN (Diff* SSID)                     |
| Code path           | `bun run sync` (rsync over USB)           | `wget` bringup tarball from HTTP `:8080`    |
| Image path          | `docker build` locally, then push         | `docker pull` from dev-host registry        |
| Runtime control     | dev-host SSH starts/stops/monitors        | Autonomous, no external orchestration     |
| Builds images       | Yes (sole build node)                     | No                                        |
| RViz visualization  | Yes (via NoMachine to `:0`)               | No                                        |

## 2. Connection Topology

```
dev-host ───USB/RNDIS─── dev-device ──build→push── registry(:5050) ──pull── fleet-device (×N)
(x86_64)   192.168.55.x   (aarch64)         on dev-host              (aarch64, standalone)
                              │                                                  │
                        docker run                                        docker run
                              ▼                                                  ▼
                      device-container                                  device-container
```

Both device types share the same `device-container` and `device-image` artifacts.
The dev-device is the sole golden build node; fleet-devices never build images.

## 3. Workspace Paths

Defined in `src/core/config.ts`:

| Constant            | Value                                                 | Meaning                           |
| ------------------- | ----------------------------------------------------- | --------------------------------- |
| `REC_DEVICE_LOC_WS` | `$REC_DEVICE_LOC_WS` (default: `/home/nv/rec_loc_ws`) | Workspace root on any Jetson     |
| (auto)              | `getRepoRoot()`                                       | dev-host workspace root           |

The same `REC_DEVICE_LOC_WS` path applies to both `dev-device` and `fleet-device`.

## 4. Workspace Alignment Chains

### Dev Chain (development, single device)

```
dev-host (src/)  ──rsync──>  dev-device ($REC_DEVICE_LOC_WS/)
                                    │
                              docker build (snapshot on dev-device)
                                    │
                                    ▼
                             device-image (fastlio-jetson:latest)
                                    │
                              docker run -d --name ...
                                    │
                                    ▼
                             device-container (fastlio-{recipe})
```

Image contents are frozen at build time. Runtime configs come from bind-mounted `bringup/`.

### Fleet Chain (production, N devices)

```
dev-device ──docker push──>  registry on dev-host (:5050)
                                    │
                       docker pull (:5000 proxy) ──────────────── fleet-device
                                    │                                    │
                       wget bringup tar (:8080) ────────────────── workspace configs
                                                                         │
                                                                   docker run -d ...
                                                                         │
                                                                         ▼
                                                                  device-container
```

Fleet-devices pull the pre-built image and fetch config updates via HTTP tarball.
No SSH, no rsync, no local docker build.

## 5. Device Container Runtime Infrastructure

Launch flags (shared by both dev-device and fleet-device):

```
--network host      share device network stack (port 11311, UDP)
--ipc host          shared memory (Livox SDK requires this)
--privileged        hardware passthrough
--name <name>       container identity
```

Container filesystem:

```
/entrypoint.sh                         source ROS + devel, auto-start roscore if none
/opt/ros/noetic/                       ROS Noetic (arm64)
/catkin_ws/devel/                      catkin_make build artifacts (image snapshot)
/catkin_ws/src/bringup/config/         JSON configs, YAML files (bundled in image)
/catkin_ws/src/bringup/launch/         roslaunch files (bundled in image)
/usr/local/lib/                        Livox SDK2 prebuilt .a / .so
/usr/local/include/                    Livox SDK2 headers
```

Bind mounts:

```
-v ${REC_DEVICE_LOC_WS}/PCD:/catkin_ws/src/fast_lio/PCD       (writable PCD output)
-v ${REC_DEVICE_LOC_WS}/bringup:/catkin_ws/src/bringup         (live configs + launch files)
```

On fleet-devices, `bringup/` is populated from the HTTP tarball before container start.

## 6. Log Sources

### dev-device (remote access from dev-host)

All node output (`output="screen"` in launch files) goes to container stdout,
captured by Docker's `json-file` logging driver. Access from dev-host:

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
Access from dev-host:

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

### fleet-device (local-only)

fleet-devices operate autonomously. Log inspection requires physical access or
on-board telemetry (MQTT bridge → dashboard). The same Docker stdout and ROS
log paths exist inside the container, but there is no dev-host SSH bridge.

## 7. Quick Reference

| Operation                     | Command                                                 |
| ----------------------------- | ------------------------------------------------------- |
| Check dev-device connectivity | `bun run check`                                         |
| Sync code to dev-device       | `bun run sync`                                          |
| Build Docker image            | `bun run docker-dbuild` (runs on dev-device over SSH)   |
| Push image to registry        | `bun run docker-push` (from dev-device)                 |
| Start container (dev)         | `bun run prod <recipe>` (auto-bridges to dev-device)    |
| Start container (fleet)       | `docker pull <registry>/fastlio-jetson && docker run ...` |
| Stop container (dev)          | `bun run prod stop` / `bun run prod reset`              |
| Shell into container          | `bun run docker-shell <recipe>`                         |
| List dev-device processes     | `ssh nv@192.168.55.1 'pgrep -af <pattern>'`             |
| List containers               | `ssh nv@192.168.55.1 'docker ps -a'`                    |
| Inspect container logs        | `ssh nv@192.168.55.1 'docker logs <name>'`              |
| Exec in container             | `ssh nv@192.168.55.1 'docker exec <name> <cmd>'`        |
| Smoke test                    | `bun run smoke`                                         |
| Launch dashboard              | `bun run dashboard`                                     |
| Start registry + tracker      | `bun run registry start`                                |
| Fleet deploy (future)         | `bun run fleet-deploy`                                  |

## 8. Development vs Deployment

| Aspect          | dev-device                                          | fleet-device                               |
| --------------- | --------------------------------------------------- | ------------------------------------------ |
| Bun CLI         | Runs on dev-host, bridges via SSH                   | Not available (no Bun on fleet devices)    |
| Image source    | Built locally via `docker build`                    | Pulled from dev-host registry              |
| Config source   | `bun run sync` (rsync)                              | HTTP tarball (`wget + tar xz`)             |
| Runtime control | `bun run prod` via SSH tunneling                     | Self-bootstrapping script on device        |
| Logging         | `tee -a` to `logs/`, readable over SSH               | Local Docker logs + MQTT telemetry         |
| RViz            | Renders on Jetson `:0`, viewed via NoMachine         | Not used                                   |
