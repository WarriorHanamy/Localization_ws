---
name: ci-cd
description: SSH-based CI/CD runtime for Jetson-localization workspace. Defines build certification pipeline, remote catkin build via SSH, and tmux-based verification patterns. Use when discussing CI/CD, C++ edits, catkin builds, or SSH-based validation.
---

# CI/CD Runtime

## Architecture

```
Host (development)  ──USB──▶  Jetson (nv@192.168.55.1)
     │                                  │
  bun run               catkin build
  rsync workspace                  tmux test/run
```

- Zero Docker in this workspace
- Code synced to Jetson via rsync, built and tested on-device over SSH
- `uv` manages all CLI entry points (`bun run ...`)
- All stages assume Jetson is online via USB RNDIS (`192.168.55.1`)

## SSH Target

```
nv@192.168.55.1
```

Credentials: `nv` / `nv` for first-time auth; `ssh-copy-id` after. If password is
still required, set `SSHPASS=nv` env var (auto-detected by CLI).

## CLI Reference

All commands are exposed via `uv`:

```bash
bun run <subcommand>
```

Available subcommands:

| Command              | Description                                   |
| -------------------- | --------------------------------------------- |
| `check`              | Verify SSH connectivity + remote toolchain    |
| `sync`               | rsync workspace to Jetson (incremental)       |
| `build`              | Remote catkin build (`rm -rf build devel`)    |
| `increment`          | rsync + remote catkin build (no clean)        |
| `full`               | rsync + remote clean catkin build             |
| `build-pkg <pkg>`    | Build single package on remote                |
| `paths`              | Print local/remote workspace paths            |
| `rviz`               | Launch RViz on Jetson display (via RustDesk)  |
| `rviz livox`         | Launch RViz with raw LiDAR point cloud        |

Quick start:

```bash
bun run check        # is Jetson reachable?
bun run sync         # rsync source to Jetson
bun run build        # clean build on Jetson
bun run increment    # quick: rsync + incremental build
bun run build-pkg FAST_LIO  # single-package rebuild
```

---

## Stage Lifecycle

### CI (Certification)

- Use: code certification, catkin build, single-test, temporary validation
- ROS C++ changes MUST be certified via SSH remote build
- Build failure blocks completion

```bash
bun run sync
bun run build-pkg <pkg>
```

### CD (Delivery / Prod)

- Use: formal demo, long-running, cycle demo
- Only after CI passes
- Build without test flags, launch production tmux session

```bash
bun run sync
bun run build
# Then SSH in and launch prod tmux:
ssh nv@192.168.55.1 \
  'source /opt/ros/noetic/setup.bash && cd ~/Localization_ws && source devel/setup.bash && roslaunch ...'
```

### Debug

- Use: interactive bringup, RViz, gdb, manual troubleshooting
- tmux-based interactive session on Jetson

```bash
bun run sync
bun run build
ssh nv@192.168.55.1
# Inside Jetson:
cd ~/Localization_ws
source devel/setup.bash
tmux new -s bringup-debug
```

---

## ROS C++ CI Certification

This section is the mandatory CI protocol for any ROS C++ change.

### Trigger

Use for all ROS `.c/.cpp/.h/.hpp` changes, and also when changing:
- ROS topic names consumed by C++ nodes
- catkin package `CMakeLists.txt`
- launch parameters that affect C++ node runtime
- message/service dependencies used by C++ code

### Impact Mapping

Before editing, search for:
- the symbol/function/class being changed
- ROS topic names
- launch remaps
- YAML params
- CMake target names
- message/service types

Classify affected files as producer, consumer, launch/config, build system, or documentation.

### Pipeline

1. Map impact before editing.
2. Identify owning catkin workspace and package.
3. Modify the smallest correct set of files.
4. Add in-code documentation for non-obvious ROS topic, frame, unit, or parameter semantics.
5. Add `*_BUILD_TEST` compile definition in the package `CMakeLists.txt`:

   ```cmake
   option(ODOM_CONVERTER_BUILD_TEST "Enable odom converter build validation" OFF)
   if(ODOM_CONVERTER_BUILD_TEST)
     add_compile_definitions(ODOM_CONVERTER_BUILD_TEST)
   endif()
   ```

   Add a compile-time guard in the changed file:

   ```cpp
   #ifdef ODOM_CONVERTER_BUILD_TEST
   static_assert(true, "ODOM_CONVERTER_BUILD_TEST enabled");
   #endif
   ```

6. Build on the remote Jetson via SSH:

   ```bash
   bun run sync
   bun run build-pkg <pkg>
   ```

7. Report build command, result, and remaining risks.

### Failure Handling

If build fails:
1. Capture the first relevant compile/link error.
2. Fix the root cause.
3. Rebuild on the remote Jetson.
4. Repeat until successful.

### Final Report

Always report:
- changed C/C++ files
- affected ROS topics/params
- remote build command
- build result
- any skipped broader build and why

---

## Caching

Enable ccache on the Jetson side to accelerate repeated builds:

```bash
# On Jetson (one-time setup):
sudo apt install ccache
echo 'export PATH="/usr/lib/ccache:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify:
ccache --show-stats
```

After setup, even `rm -rf build devel && catkin build` reuses cached objects across
clean builds.

---

## Visualization

RViz runs on the **Jetson** (native GPU via Xorg) and is viewed remotely from the
host via **RustDesk**. Both sides must run the same RustDesk version.

### Launch RViz

```bash
bun run rviz           # FAST_LIO SLAM point clouds + odometry
bun run rviz livox     # Raw LiDAR point cloud (/livox/lidar)
```

This does two things in one command:

1. SSH into the Jetson and launch RViz in background on display `:0`
2. Auto-connect RustDesk on the host to the Jetson's RustDesk ID via local relay

The RustDesk connection window appears automatically — no manual search or
password entry needed. A local relay server (`hbbs` + `hbbr`) runs on the host
at `192.168.55.100` to route the connection over the USB link.

### RViz Config Files

| Config                          | Path                                    | Topics                                          |
| ------------------------------- | --------------------------------------- | ----------------------------------------------- |
| FAST_LIO visualization         | `FAST_LIO/rviz_cfg/loam_livox.rviz`     | `/cloud_registered`, `/Odometry`, `/ekf_odom`   |
| Livox raw point cloud          | `livox_ros_driver2/config/display_point_cloud_ROS1.rviz` | `/livox/lidar`                     |

### RustDesk Quick Reference

See [`RUSTDESK_KNOWLEDGE.md`](../../../RUSTDESK_KNOWLEDGE.md) for version
sync, installation, and troubleshooting details.

---

## Prerequisites

| Component        | Location          | Required                                  |
| ---------------- | ----------------- | ----------------------------------------- |
| ROS Noetic       | Jetson            | `/opt/ros/noetic/setup.bash`              |
| catkin_tools     | Jetson            | `which catkin`                            |
| uv               | Host + Jetson     | `which uv` (host: `/usr/bin/uv`)          |
| SSH key          | Host → Jetson     | `ssh nv@192.168.55.1 echo OK`             |
| ccache (opt)     | Jetson            | `which ccache` — speeds repeat builds     |

---

## tmux Scripting Conventions

### Session Naming Convention

This project recognizes two naming scopes:

| Scope       | Pattern                | Example                     |
|-------------|------------------------|-----------------------------|
| Perpetual   | `bringup-*` prefix             | `bringup-lidar-debug`               |
| Ephemeral   | `<name>-test`          | `adjust-calib-test`         |
| Delivery    | `<name>-prod`          | `adjust-calib-prod`         |

Session names are defined as the **first** `readonly` variable at the top of every script. All create/list/kill calls reference only that variable — never a hardcoded string.

### Quick Start

Minimal headless script (self-cleaning):

```bash
#!/usr/bin/env bash
set -euo pipefail

SELF="adjust-calib"
STAGE="${TMUX_STAGE:-test}"
readonly SESSION="${SELF}-${STAGE}"

trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true' EXIT INT TERM ERR

tmux has-session -t "$SESSION" 2>/dev/null && tmux kill-session -t "$SESSION"

tmux new-session -d -s "$SESSION" -n main
tmux send-keys -t "$SESSION:main" 'echo hello' Enter
```

Run with `bash script.sh` (test) or `TMUX_STAGE=prod bash script.sh` (prod).

### Interactive vs Headless

| Style         | Cleanup method                        | Typical use                     |
| ------------- | ------------------------------------- | ------------------------------- |
| Interactive   | Pre-flight kill only, ends with attach| Interactive bringup debugging   |
| Headless/test | `trap` + pre-flight kill, no attach   | CI, automated verification      |

### Workflow

#### Pre-flight

Always kill any stale leftover before creating:

```bash
tmux kill-session -t "${SESSION}" 2>/dev/null || true
```

#### Trap cleanup (headless only)

```bash
trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true' EXIT INT TERM ERR
```

The variable reference must match the `readonly SESSION` exactly.

#### Send keys

```bash
tmux send-keys -t "${SESSION}:window" 'command' Enter
```

Avoid quoting the command inside `send-keys` unless shell expansion is desired. Use single quotes for literal commands.

#### Capture output

```bash
output=$(tmux capture-pane -t "${SESSION}:window" -p)
```

Pipe through `grep`, `sed`, or `cmp` for verification.

#### Pane layout conventions

| Pane count | Layout | tmux command      | Visual        |
|------------|--------|-------------------|---------------|
| 2          | 1x2    | `split-window -h` | `[A \| B]`    |
| 4          | 2x2    | tiled             | `[A \| B]`<br>`[C \| D]` |

Two-pane windows **always** use 1x2 (side-by-side, `split-window -h`). Never 2x1 (top-bottom).

#### Pane navigation

**禁止使用显式 pane 索引（`window.pane-index`）创建或发送命令。** pane 索引值在不同 tmux 配置（`pane-base-index`）下会变化，导致脚本不可移植。

正确做法：始终用 `send-keys -t session:window` 模式，配合 `split-window`（新 pane 自动 focus）和 `select-pane` 相对导航。

2x2 布局模板：

```bash
# top-left      send after new-session
# top-right     split-window -h + send
# bottom-right  split-window -v + send
# bottom-left   select-pane -L + split-window -v + send
tmux new-window -c "${DIR}" -t "${SESSION}" -n "arm"
tmux send-keys -t "${SESSION}:arm" 'command-1'          # top-left

tmux split-window -h -c "${DIR}" -t "${SESSION}:arm"
tmux send-keys -t "${SESSION}:arm" 'command-2'          # top-right

tmux split-window -v -c "${DIR}" -t "${SESSION}:arm"
tmux send-keys -t "${SESSION}:arm}" 'command-3'          # bottom-right

tmux select-pane -L -t "${SESSION}:arm"
tmux split-window -v -c "${DIR}" -t "${SESSION}:arm}"
tmux send-keys -t "${SESSION}:arm}" 'command-4'          # bottom-left
```

注：上述模板存在花括号不闭合的笔误，实际使用时需保持一致。

`select-pane` 方向参数：

| Flag   | 含义     |
|--------|----------|
| `-U`   | 上       |
| `-D`   | 下       |
| `-L`   | 左       |
| `-R`   | 右       |

#### rosout 冲突预防（ROS 多 pane 启动关键）

当 tmux 中多个 pane 同时执行 `roslaunch`（无已有 roscore 时），每个 `roslaunch` 都会尝试启动 roscore，导致 rosout 无限重启循环：

```
[rosout-1] started with pid [10296]
[ WARN] Shutdown request received.
Reason: [[/rosout] Reason: new node registered with same name]
[rosout-1] restarting process  ← 无限循环
```

**根因**：多个 `roslaunch` 在 `sleep` 延迟前同时检查 roscore，均发现无 roscore → 各自启动自己的 roscore → rosout 冲突。

**修复**：显式先启 roscore + pane 启动时间错开。

```bash
# 1. 显式 roscore（单次）
roscore &
sleep 3

# 2. 后续所有 roslaunch 都会复用已存在的 roscore
roslaunch bringup msg_MID360s.launch &

# 3. 多 pane 启动错开时间（6s 间隔）
tmux send-keys -t "${SESSION}:win" 'bash pane0_launch.sh' C-m   # t=0
tmux send-keys -t "${SESSION}:win" 'sleep 6 && bash pane1.sh' C-m  # t=6
tmux send-keys -t "${SESSION}:win" 'sleep 6 && bash pane2.sh' C-m  # t=6
tmux send-keys -t "${SESSION}:win" 'sleep 10 && rviz' C-m          # t=10
```

### Verification Pattern

```bash
tmux new-session -d -s "$SESSION"
tmux send-keys -t "$SESSION" 'echo hello' Enter
sleep 0.3
output=$(tmux capture-pane -t "$SESSION" -p)
echo "$output" | grep -q hello && echo "PASS" || echo "FAIL"
# trap fires → session killed
```

### CI

tmux 脚本的自动化验证采用 headless 模式。CI agent 自主运行，全程无需人工交互。

#### 流程

1. Session 命名使用 `<name>-test` 模式（由 `SELF` 变量推导）
2. `trap` 覆盖 EXIT INT TERM ERR，确保退出时销毁 session
3. `has-session` + `kill-session` 做预清理（幂等）
4. `new-session -d` 创建 headless session
5. `send-keys` 发送命令，`sleep 0.3–1.0` 等待输出就绪
6. `capture-pane -p` 抓取 pane 输出，`grep -q` 做断言匹配
7. 末尾 **不调用 attach**，自然结束后 trap 触发清理
8. 全部断言通过则 `exit 0`，否则 `exit 1`

#### 模板

```bash
#!/usr/bin/env bash
set -euo pipefail

SELF="hover-debug"
readonly SESSION="${SELF}-test"

trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true' EXIT INT TERM ERR
tmux has-session -t "$SESSION" 2>/dev/null && tmux kill-session -t "$SESSION"

tmux new-session -d -s "$SESSION" -n main
tmux send-keys -t "$SESSION:main" 'bun run init' Enter
sleep 0.5

output=$(tmux capture-pane -t "$SESSION:main" -p)
echo "$output" | grep -q 'init' && echo "PASS: init launched" || echo "FAIL: init not found"

echo "ALL PASS"
```

#### 集成

CI pipeline 中执行 `bash tmux_scripts/test_*.sh`，期望全部返回 0。

### CD

coding agent 在交付 tmux 脚本前，必须逐项验证以下 checklist。这是为了方便用户操作，确保脚本可直接投入现场使用。

#### 交互式脚本交付 checklist

- [ ] 顶部 `readonly SESSION` 符合命名惯例（`bringup-*` 永久 session 或 `<name>-prod` 交付 session）
- [ ] 第一行为 `tmux kill-session -t "${SESSION}" 2>/dev/null || true`
- [ ] 末尾有 `tmux attach -t "${SESSION}"` 使用户能直接进入 session
- [ ] 全部 `send-keys` 使用单引号括字面量命令
- [ ] **Pane 创建不依赖显式索引** — 每次 `split-window` 后立即 `send-keys` 到窗口名，跨 pane 用 `select-pane -U/-D/-L/-R` 导航，禁用 `window.pane-index` 写法
- [ ] 每个 window 有注释块标明 pane 布局
- [ ] header 注释中包含 `See: docs/<filename>.md` 引用文档
- [ ] 脚本文件有 execute 权限（`chmod +x`）
- [ ] 用户能**直观确认** pane 布局正确、各命令按预期启动
- [ ] 多 pane 启动时 **非 lidar pane 带 `sleep` 延迟**，避免 `roslaunch` 竞争 roscore
- [ ] `lidar_launch.sh` 或首个 pane 中 **显式 `roscore & sleep 3`** 后再启动 `roslaunch`

#### Headless/test 脚本交付 checklist

- [ ] `trap` 覆盖 EXIT INT TERM ERR
- [ ] 无 `tmux attach` 调用
- [ ] 断言失败时 `exit 1`
- [ ] CI pipeline 可直接调用，无需交互

---

## Resource

- `~/.config/tmux/tmux.conf` — prefix C-Space, vi copy mode, Alt+Arrow pane nav
- `l10n/cli/integration.py` — CLI source for all CI/CD commands
- `l10n/core/ssh.py` — SSH/rsync connection helpers
- `l10n/schema.py` — workspace constants (remote host, packages, excludes)
