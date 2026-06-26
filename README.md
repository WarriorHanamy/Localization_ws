# Localization WS

SLAM + LiDAR localization pipeline for c5v1/c5pro autonomous aircraft.

## Quick Start (Fleet Device)

```bash
curl -fsSL http://192.168.108.83:8080/install/fastlio | bash
```

Select hardware config (default: `c5v1-mid360-mavros`):

```bash
curl -fsSL http://192.168.108.83:8080/install/fastlio | bash -s -- c5v1-mid360-livox
```

Available configs: `c5v1-mid360-mavros`, `c5v1-mid360-livox`, `c5pro-mid360s-mavros`, `c5pro-mid360s-livox`.

## Development

See [ARCHITECTURE.md](ARCHITECTURE.md), [docs/AGENT-API.md](docs/AGENT-API.md).

### Common commands

```bash
bun run prod slam            # start SLAM on dev-device
bun run prod stop            # stop running session
bun run smoke l1 c5v1        # LiDAR + IMU frequency check
bun run smoke l2-slam c5v1   # SLAM + RViz
bun run sync                 # rsync workspace to device
bun run docker-dbuild        # build Docker images on device
bun run fleet-bundle <cfg>   # package bringup/ → runtime tarball
bun run help                 # show all commands
```
