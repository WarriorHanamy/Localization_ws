---
name: docker-artifact-migration
description: Migrate a ROS package from in-Dockerfile catkin_make to pre-built artifacts in bringup/resource/. Four-phase loop: experiment in daemon → extract + write MANIFEST → integrate into Dockerfile → build + verify. Use when eliminating catkin_make from Dockerfiles or adding pre-built ROS package artifacts.
---

# Docker Artifact Migration

## Overview

Replace `catkin_make` in Dockerfiles with pre-built artifacts stored in `bringup/resource/<pkg>/`.
The canonical mapping is `bringup/resource/MANIFEST`.

**Loop**: experiment (daemon) → extract + manifest → integrate → build → verify.

## Infrastructure Dependencies

| Component                                | Purpose                                    | Location            |
| ---------------------------------------- | ------------------------------------------ | ------------------- |
| `test/daemon.sh start|shell|run|stop`        | Container lifecycle for experimentation    | `test/daemon.sh`    |
| `test/runner.sh l1`                        | Passive check engine (inside container)    | `test/runner.sh`    |
| `test/config.sh`                           | Recipe mappings (hw+imu → image+launch)    | `test/config.sh`    |
| `bringup/resource/`                        | Canonical artifact storage (committed git) | `bringup/resource/` |
| `bringup/resource/MANIFEST`                | resource → container path mapping          | same dir            |
| Dev-device reachable                     | SSH tunnel for docker commands             | `nv@192.168.55.1`   |

## Phase 1: Experiment (daemon loop)

Goal: determine the minimal set of files needed at which container paths.

```
# 1. Start daemon from current (catkin_make) image
bash test/daemon.sh start <recipe>

# 2. Baseline check
bash test/daemon.sh run l1

# 3. Shell in — iterate freely
bash test/daemon.sh shell

  # Inside container — trial and error loop:
  cp -a /catkin_ws/devel/lib/<pkg>/    /opt/ros/noetic/lib/<pkg>/
  cp -a /catkin_ws/devel/include/<pkg>/ /opt/ros/noetic/include/<pkg>/
  cp -a /catkin_ws/devel/share/<pkg>/   /opt/ros/noetic/share/<pkg>/
  cp    /catkin_ws/src/<pkg>/package.xml /opt/ros/noetic/share/<pkg>/
  cp -a /catkin_ws/devel/lib/python3/dist-packages/<pkg>/ \
        /opt/ros/noetic/lib/python3/dist-packages/<pkg>/ 2>/dev/null || true

  # Fix cmake hardcoded paths
  find /opt/ros/noetic/share/<pkg>/cmake -name '*.cmake' -exec \
    sed -i 's|/catkin_ws/devel|/opt/ros/noetic|g' {} \;

  # Test if node still launchable
  mv /catkin_ws/devel /catkin_ws/devel.bak
  roslaunch bringup <launch_file> <args> &
  bash /test/runner.sh l1 /livox/imu

  # If pass → success.  If fail → fix, retry.
  # Record what files were actually needed.

# 4. Exit container, stop daemon
exit
bash test/daemon.sh stop
```

**Card point**: `rosnode kill` terminates the container if the node has `required="true"` in the launch file. Use a separate experiment container, or start the node directly with `rosrun` instead of `roslaunch`.

## Phase 2: Extract & Write Manifest

Goal: copy only the necessary files from the Docker image to `bringup/resource/<pkg>/`, then write the MANIFEST.

```
# From the Docker image
CID=$(docker create <image>)
docker cp "$CID:/catkin_ws/devel/lib/<pkg>/."          bringup/resource/<pkg>/lib/
docker cp "$CID:/catkin_ws/devel/include/<pkg>/."      bringup/resource/<pkg>/include/
docker cp "$CID:/catkin_ws/devel/share/<pkg>/."        bringup/resource/<pkg>/share/
docker cp "$CID:/catkin_ws/src/<pkg>/package.xml"      bringup/resource/<pkg>/share/
docker cp "$CID:/catkin_ws/devel/lib/python3/dist-packages/<pkg>/." \
          bringup/resource/<pkg>/python/ 2>/dev/null || true
docker rm "$CID"
```

Then append to `bringup/resource/MANIFEST`. Format:
```
<resource_path>    <container_path>
```
- `resource_path` is relative to `bringup/resource/`
- `container_path` is absolute inside the Docker image
- Trailing `/` on both sides = directory
- `#` = comment

Commit both the extracted files and the MANIFEST.

## Phase 3: Integrate

### 3a: Dockerfile

Replace the `catkin_make` block:

```dockerfile
# Before:
# COPY <pkg>/ /catkin_ws/src/<pkg>/
# RUN . /opt/ros/noetic/setup.sh && cd /catkin_ws && catkin_make ...

# After — follow MANIFEST entries for this package:
COPY bringup/resource/<pkg>/lib/     /opt/ros/noetic/lib/<pkg>/
COPY bringup/resource/<pkg>/include/ /opt/ros/noetic/include/<pkg>/
COPY bringup/resource/<pkg>/share/   /opt/ros/noetic/share/<pkg>/
COPY bringup/resource/<pkg>/python/  /opt/ros/noetic/lib/python3/dist-packages/<pkg>/

# Fix cmake paths (devel-space → install-space)
RUN find /opt/ros/noetic/share/<pkg>/cmake -name '*.cmake' -exec \
    sed -i 's|/catkin_ws/devel|/opt/ros/noetic|g' {} \;
```

### 3b: entrypoint script (service layer)

Entrypoint lives in `bringup/scripts/entrypoint-*.sh` as part of the runtime bundle,
not in the Docker image. See `.agents/skills/entities-development-ids/SKILL.md` §5.x.

The service entrypoint drops hard dependency on `/catkin_ws/devel/`:

```bash
source /opt/ros/noetic/setup.bash
if [[ -f /catkin_ws/devel/setup.bash ]]; then
    source /catkin_ws/devel/setup.bash
fi
export ROS_PACKAGE_PATH=/catkin_ws/src:$ROS_PACKAGE_PATH
```

### 3c: docker-build.ts (for `bringup/resource/` delivery)

`bringup/resource/` is in `RSYNC_EXCLUDES` and does not reach the Jetson via regular sync. Add a targeted rsync in the build pipeline before `docker build`:

```typescript
// Sync bringup/resource/ from dev-host to dev-device before docker build
const repo = getRepoRoot();
const src = `${repo}/bringup/resource/`;
const dst = `${sshTarget()}:${REC_DEVICE_LOC_WS}/bringup/resource/`;
await $`rsync -avz --delete --rsh=ssh ${SSH_OPTS} ${src} ${dst}`;
```

## Phase 4: Verify

```
bun run docker-dbuild base
bash test/daemon.sh start <recipe>
bash test/daemon.sh run l1            # 6/6 PASS required
bash test/daemon.sh stop

bun run smoke l1-<imu> <hw>           # user-level acceptance
```

**Verification criteria:**
- `/catkin_ws/devel` absent from container
- `/catkin_ws/src/<pkg>` absent from container
- All artifacts under `/opt/ros/noetic/`
- L1 runner: 6/6 PASS
- Smoke: ALL PASSED

## Risk Points

| # | Symptom                                        | Root Cause                                      | Fix                                              |
| - | ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| 1 | `Cannot locate node of type [x] in package [y]` | cmake Config hardcodes `/catkin_ws/devel`         | `sed` replace paths in `*.cmake` (Phase 3a)       |
| 2 | `[bringup] is neither a launch file...`         | ROS_PACKAGE_PATH missing `/catkin_ws/src`         | `export ROS_PACKAGE_PATH` in entrypoint (Phase 3b) |
| 3 | Container killed after experiment               | Launch file has `required="true"` on the node    | Use separate experiment container (Phase 1)       |
| 4 | runner.sh exits 1, no output                    | `set -u` clashes with ROS setup.sh unbound vars  | `export CATKIN_SHELL=bash; set +u` before source   |
| 5 | `wait_for_node` times out every time            | `grep -qx` exact-line vs `/node_name` prefix     | Use `grep -qF` substring match                    |
| 6 | `find_package` fails for downstream packages    | cmake include dir resolves to old devel path     | Same as #1 — ensure all `*.cmake` paths are fixed  |
| 7 | Python msg import fails at runtime              | Artifacts placed in wrong python path            | Must use `dist-packages/` (Ubuntu), not `site-packages/` |

## Files Modified (per package migration)

| File                                         | Action                                            |
| -------------------------------------------- | ------------------------------------------------- |
| `bringup/resource/<pkg>/`                       | New: pre-built artifacts (committed git)          |
| `bringup/resource/MANIFEST`                     | Edit: append mapping entries                      |
| `docker/Dockerfile.<target>`                    | Replace `catkin_make` with `COPY` + `RUN sed`       |
| `bringup/scripts/entrypoint-*.sh`                | Service entrypoint (runtime bundle, bind-mounted)    |
| `src/cli/docker-build.ts`                       | Add `bringup/resource/` targeted rsync (first time only) |
| `.gitignore`                                    | May need `!` exceptions for binary files          |
