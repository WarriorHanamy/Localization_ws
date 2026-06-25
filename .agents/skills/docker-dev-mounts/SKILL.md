# Skill: docker-dev-mounts

Development container mount design constraints for the Localization_ws Docker runtime.

## 1. Core Constraint

Development containers have exactly **one file mount**: `bringup/` full directory.
Everything else is resource configuration, not a mount.

## 2. The One File Mount

```
-v ${WORKSPACE}/bringup:/catkin_ws/src/bringup
```

- **Scope**: The entire `bringup/` tree (launch/, config/, scripts/, PCD/, rviz_cfg/, bags/)
- **Permission**: RW (writable inside container → writable on host via bind mount)
- **Purpose**: Launch files, LiDAR config YAML, shell scripts, PCD map data, RViz configs
- **Why**: File changes in `bringup/` are live at container runtime without `docker-dbuild`
- **Implementations**:
  - `src/cli/prod.ts:99` — production launch
  - `src/cli/smoke.ts:161, 223, 280, 341` — smoke tests (all 4 L1/L2 variants)
  - `src/cli/docker-start.ts:32` — manual container starter
  - `docker/docker-compose.yml:15` — docker-compose anchor

This single coarse-grained RW bind mount is the **antithesis** of the fleet deployment
pattern, which uses 5 fine-grained subdirectory mounts with RO protection. See
`fleet-bootstrap` skill §4 for the fleet contract.

## 3. Resource Configuration (Not File Mounts)

These are **Docker runtime flags**, not file/data mounts. They should never be
called "mounts" in code comments or documentation.

| Flag / Config                    | Kind         | Responsibility                              |
| -------------------------------- | ------------ | ------------------------------------------- |
| `--network host`                 | Docker flag  | LiDAR UDP packets reach container directly  |
| `--ipc host`                     | Docker flag  | ROS nodelet / shared memory IPC             |
| `--privileged`                   | Docker flag  | Hardware device access (LiDAR, IMU, GPIO)   |
| `-v /tmp/.X11-unix:/tmp/.X11-unix` | X11 socket | RVIZ rendering to host display              |
| `-e DISPLAY=...`                 | Env var      | X display / GPU targeting                   |

## 4. Pattern Comparison: Dev vs Fleet

| Aspect                  | Development                     | Fleet                                 |
| ----------------------- | ------------------------------- | ------------------------------------- |
| Mount granularity       | `bringup/` single (coarse)       | 5 subdirs (fine)                     |
| Mount permission        | RW everywhere                    | config/launch/scripts: RO; PCD/logs: RW |
| File change propagation | Immediate (bind mount)           | Requires new tarball + bootstrap      |
| Design driver           | Edit-iterate speed               | Security, immutability                |
| Documented in           | This skill                       | `fleet-bootstrap` skill §4            |

## 5. Bind Mount Permission Leakage

(Content migrated from `docker-bindmount-permissions` — relevant because
development mounts are RW, so container writes leak onto the host.)

Container root (UID 0) = host root (UID 0) for file ownership on bind mounts.
If a development container writes to `/catkin_ws/src/bringup/...`, those files
become root-owned on the host.

### Detection

| Symptom | Likely Cause |
|---------|-------------|
| `ls -la bringup/...` shows `root root` | Container wrote to bind mount |
| `Permission denied` editing bringup files on host | Files owned by root after container write |
| `stat -c '%U:%G' bringup/...` shows `root:root` | Confirm root ownership |

### Fix-up

```bash
sudo chown -R $USER:$USER bringup/
rm -rf bringup/PCD/pointcloud_*.pcd  # typical container-generated files
```

### Always-On Rules

1. Never let the container write to a development bind mount path unless the
   host user is prepared to fix up ownership.
2. Logs, generated PCD, and other container-side output should go to paths
   outside the bringup mount tree (e.g., `/root/.ros/log` inside container,
   mapped to dedicated host path in fleet mode).
3. If a script inside the container must write into `bringup/`, add a host-side
   `sudo chown` post-step in the launcher or documentation.

## 6. References

- `fleet-bootstrap` skill — fleet deployment mount contract
- `docker-image-naming` skill — image tag conventions for build/dbuild/push
- `entities-development-ids` skill — which entities run which container images
