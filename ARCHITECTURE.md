# Architecture

## Runtime Entities

```
┌─────────────────────┐     USB/RNDIS      ┌─────────────────────┐     docker     ┌──────────────────┐
│   Dev Host            │ ◄──────────────►  │   Dev Device          │ ◄──────────►  │   Device Container  │
│   (x86_64 Linux)      │    192.168.55.x    │   (Jetson Orin NX     │               │   (fastlio-jetson)   │
│                      │         SSH         │    aarch64 Linux)    │               │   ROS noetic        │
│                      │                    │                      │               │                     │
│  Bun 开发工具链       │                    │  Bun 生产编排         │               │  - FAST-LIO         │
│  - sync / build      │                    │  - prod start         │               │  - livox_ros_driver2│
│  - check / smoke     │                    │  - prod stop / reset  │               │  - bringup (bind)   │
│  - rviz / dashboard  │                    │  - prod attach        │               │                     │
│  - docker-*          │                    │  - prod status        │               └──────────────────┘
│  - registry          │                    │                      │
└─────────────────────┘                    └──────────────────────┘

┌─────────────────────┐     WiFi LAN        ┌──────────────────────┐
│   Registry + HTTP    │ ◄──────────────►   │   Fleet Device (×N)   │
│   (on dev-host)      │  pull image +      │   (Jetson Orin NX     │
│   :5000 :8080        │  wget tarball      │    aarch64 Linux)     │
│                      │                    │                       │
│  registry:2          │                    │  Autonomous runtime   │
│  tracker (bun)       │                    │  - docker pull        │
│  python http.server  │                    │  - docker run         │
└─────────────────────┘                    └──────────────────────┘
```

Bun is installed on **both** the dev host and the dev device, with distinct roles:

| Location   | Bun Role                | Commands                                                   |
| ---------- | ----------------------- | ---------------------------------------------------------- |
| Dev host   | Development toolchain   | `sync`, `build`, `check`, `smoke`, `rviz`, `dashboard`, `docker-*`, `registry` |
| Dev device | Production orchestration | `prod start <recipe>`, `prod stop`, `prod reset`, `prod attach`, `prod status` |

Fleet devices have **no Bun runtime** — they operate standalone via `docker pull` + `wget`.

**Sync** is one-directional: dev host pushes code changes to the dev device via `bun run sync`.

**All `bun run prod` commands work identically on both hosts.**
The TypeScript CLI (`src/cli/prod.ts`) auto-detects the host: if `docker` is not available
locally, it tunnels via SSH. The production orchestration always executes on the dev device.

---

## User Workflow

The same `bun run prod` commands work on both hosts — `prod.ts` auto-bridges via SSH
when invoked from the dev host.

### One Script to Start All Services (reset first)

```bash
bun run prod slam
# or simply (with bin/ in PATH):
prod slam
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

## Agent Workflow (Dev Host)

The agent runs exclusively on the dev host. All standard CLI commands work directly.
`bun run prod` auto-detects the dev host and tunnels via SSH to the dev device.
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
ssh nv@192.168.55.1 'cat ~/Localization_ws/logs/fastlio-c5pro-mid360s.log'

# Follow slam log
ssh nv@192.168.55.1 'tail -f ~/Localization_ws/logs/fastlio-c5pro-mid360s.log'

# Follow slam log in real time (most common)
ssh nv@192.168.55.1 'tail -f ~/Localization_ws/logs/fastlio-c5pro-mid360s.log'

# Search logs for errors or key words
ssh nv@192.168.55.1 'grep -i error ~/Localization_ws/logs/fastlio-c5pro-mid360s.log'

# Read topics log
ssh nv@192.168.55.1 'cat ~/Localization_ws/logs/fastlio-c5pro-mid360s.topics.log'

# Container-native logs (supplemental)
ssh nv@192.168.55.1 'docker logs --tail 200 fastlio-c5pro-mid360s'

# ROS error trace from inside the container
ssh nv@192.168.55.1 'docker exec fastlio-c5pro-mid360s grep ERROR /root/.ros/log/latest/roslaunch-*.log'
```

### Agent Triggering Production

All `bun run prod` commands work directly from the devel host — `prod.ts` automatically
bridges via SSH. No manual SSH wrapping required:

```bash
# These work on BOTH hosts:
bun run prod slam
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

- **Workspace sync is the dev deploy mechanism**: `bun run sync` pushes the entire workspace
  to the dev device. Fleet devices receive configs via HTTP tarball.

- **Convenience wrappers**: The `bin/prod` wrapper, SQLite-backed frequency tracker
  (`src/core/completions-db.ts`), and both fish/bash completions are synced with the
  workspace.

  **Devel host (fish shell)** — completions auto-loaded from `~/.config/fish/completions/bun.fish`;
  Ctrl+F opens fzf directly via `conf.d/bun-run.fish`:

  ```fish
  # ~/.config/fish/config.fish
  fisher install PatrickF1/fzf.fish   # enhanced fzf search
  ```

  **Dev device (bash)** — add to `.bashrc`:
  ```bash
  export PATH="$HOME/Localization_ws/bin:$PATH"
  source "$HOME/Localization_ws/completions/bun-localization.bash" 2>/dev/null
  ```

  The completion system uses `bun:sqlite` (bundled with Bun) to track frequency.
  Frequently used commands and recipes automatically sort to the top of the completion list.
  The history database lives at `~/.local/state/l10n/completions.db`.

---

## Data Flow (Development)

```
  Dev Host                             Dev Device                              Container
     │                                    │                                      │
     ├── bun run sync ──── rsync ───────► │                                      │
     │                                    │                                      │
│  <any host: bun run prod start <recipe>'     │                                      │
│  dev host auto-bridges via SSH ──────────►  │                                      │
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

## Data Flow (Fleet Distribution)

```
  Dev Device                    Dev Host Registry                Fleet Device (×N)
     │                               │                                │
     ├── docker push ──────────────► │                                │
     │     fastlio-jetson:latest      │                                │
     │                               ├── registry:2 (:5050)          │
     │                               ├── tracker proxy (:5000)       │
     │                               ├── python http.server (:8080)  │
     │                               │                                │
     │                               │ ◄──── docker pull :5000 ──────┤
     │                               │ ◄──── wget bringup.tar ───────┤
     │                               │                                │
     │                               │                          docker run -d
     │                               │                          --name fastlio-{recipe}
     │                               │                          roslaunch bringup {launch}
     │                               │                                │
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
