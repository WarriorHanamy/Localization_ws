# Architecture

## Runtime Entities

```
┌─────────────────────┐     USB/RNDIS      ┌─────────────────────┐     docker     ┌──────────────────┐
│   Devel Host         │ ◄──────────────►  │   Device Host        │ ◄──────────►  │   Container        │
│   (x86_64 Linux)     │    192.168.55.100  │   (Jetson Orin NX     │               │   (fastlio-jetson)   │
│                     │         SSH        │    aarch64 Linux)    │               │   ROS noetic        │
│                     │                    │                      │               │                     │
│  Bun 开发工具链      │                    │  Bun 生产编排         │               │  - FAST-LIO         │
│  - sync / build     │                    │  - prod start        │               │  - livox_ros_driver2│
│  - check / smoke    │                    │  - prod stop / reset │               │  - bringup (bind)   │
│  - rviz / dashboard │                    │  - prod attach       │               │                     │
│  - docker-*         │                    │  - prod status       │               └──────────────────┘
└─────────────────────┘                    └──────────────────────┘
```

Bun is installed on **both** the devel host and the device host, with distinct roles:

| Location   | Bun Role                | Commands                                                   |
| ---------- | ----------------------- | ---------------------------------------------------------- |
| Devel host | Development toolchain   | `sync`, `build`, `check`, `smoke`, `rviz`, `dashboard`, `docker-*` |
| Device host| Production orchestration | `prod start <recipe>`, `prod stop`, `prod reset`, `prod attach`, `prod status` |

**Sync** is one-directional: devel host pushes code changes to the device via `bun run sync`.

**All `bun run prod` commands work identically on both hosts.**
The TypeScript CLI (`src/cli/prod.ts`) auto-detects the host: if `docker` is not available
locally, it tunnels via SSH. The production orchestration always executes on the device host.

---

## User Workflow

The same `bun run prod` commands work on both hosts — `prod.ts` auto-bridges via SSH
when invoked from the devel host.

### One Script to Start All Services (reset first)

```bash
bun run prod start mapping-mid360
# or simply (with bin/ in PATH):
prod start mapping-mid360
```

Always starts from a clean state:
1. Kill stale tmux session `prod`
2. Stop + remove stale container `fastlio-{recipe}`
3. Start a fresh container with the selected launch file
4. Create tmux session with 3 windows (`slam`, `topics`, `shell`)
5. Auto-attach to tmux if terminal is interactive

**Recipe is a positional argument**. TAB completion is available: `prod start <TAB>`
lists all recipes. If no recipe is given in an interactive terminal, an fzf fuzzy-finder
pops up to select one interactively.

### One Script to Clean All Services

```bash
bun run prod reset
```

Kills everything unconditionally:
1. Kill tmux session `prod`
2. Stop + remove all `fastlio-*` containers
3. Kill native host processes: `livox_ros_driver2`, `roslaunch`, `mqtt_bridge`

### Supplementary Commands

| Command                          | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `bun run prod stop` / `prod stop`  | Kill tmux + stop/remove containers (leave native processes) |
| `bun run prod attach` / `prod attach` | Reconnect to running tmux session              |
| `bun run prod status` / `prod status` | Show runtime state (tmux, docker, logs)        |

---

## Agent Workflow (Devel Host)

The agent runs exclusively on the devel host. All standard CLI commands work directly.
`bun run prod` auto-detects the devel host and tunnels via SSH.
For a complete reference of all agent-accessible commands, see `docs/AGENT-API.md`.

### Log System (Reliability Guarantees)

The production pipeline writes all tmux window output to disk in real time via `tee -a`.
These log files are the primary, reliable observation interface for the agent.

| Log File (on device)                              | Source                | Reliability                       |
| ------------------------------------------------- | --------------------- | --------------------------------- |
| `~/Localization_ws/logs/fastlio-{recipe}.log`       | tmux `slam` window    | `tee -a`, append-mode, no truncate |
| `~/Localization_ws/logs/fastlio-{recipe}.topics.log` | tmux `topics` window  | `tee -a`, append-mode, no truncate |

**Properties:**

- **Persistent**: written to disk instantly, survive tmux session death or crash.
- **Reliable**: append-mode writes, no truncation or rotation risk.
- **Remote-accessible**: readable over SSH via USB/RNDIS link.
- **Real-time followable**: `tail -f` works over SSH.

### Agent Observation Commands

```bash
# Runtime state snapshot
ssh nv@192.168.55.1 'cd ~/Localization_ws && bun run prod status'

# Read slam log
ssh nv@192.168.55.1 'cat ~/Localization_ws/logs/fastlio-mapping-mid360.log'

# Follow slam log
ssh nv@192.168.55.1 'tail -f ~/Localization_ws/logs/fastlio-mapping-mid360.log'

# Follow slam log in real time (most common)
ssh nv@192.168.55.1 'tail -f ~/Localization_ws/logs/fastlio-mapping-mid360.log'

# Search logs for errors or key words
ssh nv@192.168.55.1 'grep -i error ~/Localization_ws/logs/fastlio-mapping-mid360.log'

# Read topics log
ssh nv@192.168.55.1 'cat ~/Localization_ws/logs/fastlio-mapping-mid360.topics.log'

# Container-native logs (supplemental)
ssh nv@192.168.55.1 'docker logs --tail 200 fastlio-mapping-mid360'

# ROS error trace from inside the container
ssh nv@192.168.55.1 'docker exec fastlio-mapping-mid360 grep ERROR /root/.ros/log/latest/roslaunch-*.log'
```

### Agent Triggering Production

All `bun run prod` commands work directly from the devel host — `prod.ts` automatically
bridges via SSH. No manual SSH wrapping required:

```bash
# These work on BOTH hosts:
bun run prod start mapping-mid360
bun run prod stop
bun run prod reset
bun run prod attach
bun run prod status
```

---

## Code Layering

```
src/
├── cli/          # CLI commands
│   ├── index.ts  #   dispatcher (subcommand → handler)
│   ├── prod.ts   #   production pipeline (docker + tmux)
│   ├── sync.ts   #   rsync workspace to device
│   ├── build.ts  #   remote catkin build
│   └── ...
├── core/         # Shared config and utilities
│   ├── config.ts #   constants, recipe definitions, SSH opts
│   ├── ssh.ts    #   SSH / rsync helpers
│   └── workspace.ts # repo root resolver
├── server/       # HTTP/WebSocket dashboard
└── types/        # TS type definitions
```

---

## Key Principles

- **Bringup is canonical**: ROS launch files and LiDAR configs are the single source of
  truth for SLAM behavior. The container bind-mounts `bringup/` at runtime — no image
  rebuild for config changes.

- **Recipe mapping is single-sourced**: Recipe definitions live in `src/core/config.ts`
  only. No duplication across language boundaries (previously duplicated in bash `lib.sh`).

- **Bun-native orchestration**: Zero bash in the production pipeline. `bun run prod`
  uses `Bun.spawnSync` to drive docker and tmux directly.

- **Workspace sync is the deploy mechanism**: `bun run sync` pushes the entire workspace
  to the device. Bun runtime is the only pre-installed dependency on the device.

- **Convenience wrappers**: The `bin/prod` wrapper and `completions/prod.bash` completion
  are synced with the workspace. On the device, add to `.bashrc` for TAB completion and
  `prod` command at the terminal:

  ```bash
  export PATH="$HOME/Localization_ws/bin:$PATH"
  source "$HOME/Localization_ws/completions/prod.bash" 2>/dev/null
  ```

---

## Data Flow (Full Lifecycle)

```
  Devel Host                          Device Host                             Container
     │                                    │                                      │
     ├── bun run sync ──── rsync ───────► │                                      │
     │                                    │                                      │
│  <any host: bun run prod start <recipe>'     │                                      │
│  devel auto-bridges via SSH ──────────────►  │                                      │
     │                                    ├── docker stop / rm (stale)           │
     │                                    ├── docker run -d ──────────────────►  │
     │                                    │     --name fastlio-{recipe}          │
     │                                    │     roslaunch bringup {launch}       │
     │                                    │                                      │
     │                                    ├── tmux new-session "prod"            │
     │                                    │     ├─ slam: docker logs -f │ tee   │
     │                                    │     ├─ topics: rostopic list │ tee  │
     │                                    │     └─ shell: docker exec bash      │
     │                                    │                                      │
     │  <agent>                           │                                      │
     │  ssh ... 'tail -f logs/*.log' ──►  │  (reads tee'd log files)            │
     │                                    │                                      │
     │  <user or agent>                                                          │
     │  ssh ... 'bun run prod reset' ──►  │                                      │
     │                                    ├── tmux kill-session                  │
     │                                    ├── docker stop / rm                  │
     │                                    ├── pkill livox / roslaunch           │
     │                                    │                                      │
```

---

## Tmux Window Layout

Session `prod`, three windows:

| Window    | Command                                   | Log file                              |
| --------- | ----------------------------------------- | ------------------------------------- |
| `slam`    | `docker logs -f fastlio-{recipe}`           | `logs/fastlio-{recipe}.log`             |
| `topics`  | ROS topic polling loop (3s interval)       | `logs/fastlio-{recipe}.topics.log`      |
| `shell`   | `docker exec -it fastlio-{recipe} bash`     | —                                     |

All windows pipe through `tee -a` for disk persistence. The `slam` window is the
primary observation target for both the user (in tmux) and the agent (via SSH).
