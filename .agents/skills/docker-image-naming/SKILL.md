---
name: docker-image-naming
description: Canonical Docker image naming for Localization_ws fleet distribution. Use when naming, building, tagging, pushing, pulling, documenting, or validating Docker images for dev-device, fleet-device, registry, docker-push, docker-dbuild, tracker, or fleet deployment workflows.
---

# Docker Image Naming

Use this image reference format:

```text
<registry>/<image>:cuda<cuda-version>-<variant>-ubuntu<ubuntu-version>-<arch>
```

For local build tags, omit `<registry>/`. Add the registry only when pushing or pulling.

## Current Images

| Role | Local image ref |
| ---- | --------------- |
| Base runtime | `lio-base:cuda0.0.0-run-ubuntu20.04-arm64` |
| SLAM runtime | `lio-slam:cuda0.0.0-run-ubuntu20.04-arm64` |
| Calibration runtime | `lio-calib:cuda0.0.0-run-ubuntu20.04-arm64` |

## Tag Fields

| Field | Meaning |
| ----- | ------- |
| `cuda0.0.0` | No CUDA support |
| `run` | Runtime image |
| `ubuntu20.04` | Ubuntu 20.04 base |
| `arm64` | ARM64 / aarch64 target |

## Registry Rules

- Dev-device push uses the direct TLS registry: `<dev-host>:5443/<image>:<tag>`.
- Fleet-device pull uses the tracker/proxy endpoint: `<dev-host>:5000/<image>:<tag>`.
- Do not use Docker Hub names or implicit `latest` tags for fleet images.
- Keep `src/core/config.ts`, Dockerfiles, Compose, docs, and tracker pull scripts on this convention.

Example fleet pull:

```bash
docker pull 192.168.108.83:5000/lio-base:cuda0.0.0-run-ubuntu20.04-arm64
```
