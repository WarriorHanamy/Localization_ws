# Bringup Naming Convention

## Abstract Naming Rules

All files under `bringup/` follow a platform-first naming convention with
template placeholders.

### Config files

```
{platform}_{driver}_{sensor}_config.{ext}
```

| Placeholder  | Meaning                              | Domain                         |
| ------------ | ------------------------------------ | ------------------------------ |
| `{platform}` | Physical hardware entity             | `c5v1`, `c5pro`, ...           |
| `{driver}`   | Software subsystem / driver          | `livox`, `fastlio`, ...        |
| `{sensor}`   | Sensor model                         | `mid360`, `mid360s`, ...       |
| `{ext}`      | Configuration format                 | `json`, `yaml`, ...            |

### Launch files

```
{platform}_{action}[_{variant}].launch
```

| Placeholder  | Meaning                              | Domain                                  |
| ------------ | ------------------------------------ | --------------------------------------- |
| `{platform}` | Physical hardware entity             | `c5v1`, `c5pro`, ...                    |
| `{action}`   | Subsystem / operation                 | `livox`, `mapping`, `slam`, `odom`, ... |
| `{variant}`  | Optional behavioural variant          | `prior`, `reloc`, `with_map`, ...       |

## Action Semantics

| Action    | Meaning                                          |
| --------- | ------------------------------------------------ |
| `livox`   | Livox LiDAR driver (`livox_ros_driver2_node`)     |
| `mapping` | FAST-LIO mapping node only                       |
| `slam`    | Full SLAM pipeline: driver + mapping (composite)  |
| `odom`    | Odometry with prior map                          |

## Concrete Instances

### Current hardware platforms

| Template                                            | `c5v1` (single MID360)                | `c5pro` (dual Mid360s)                |
| --------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| `{platform}_livox_{sensor}_config.json`               | `c5v1_livox_mid360_config.json`        | `c5pro_livox_mid360s_config.json`      |
| `{platform}_fastlio_{sensor}_config.yaml`             | `c5v1_fastlio_mid360_config.yaml`      | `c5pro_fastlio_mid360s_config.yaml`    |
| `{platform}_livox.launch`                             | `c5v1_livox.launch`                    | `c5pro_livox.launch`                   |
| `{platform}_mapping.launch`                           | `c5v1_mapping.launch`                  | `c5pro_mapping.launch`                 |
| `{platform}_mapping_reloc.launch`                     | `c5v1_mapping_reloc.launch`            | `c5pro_mapping_reloc.launch`           |
| `{platform}_slam.launch`                              | `c5v1_slam.launch`                     | `c5pro_slam.launch`                    |
| `{platform}_slam_prior.launch`                        | `c5v1_slam_prior.launch`               | `c5pro_slam_prior.launch`              |
| `{platform}_slam_reloc.launch`                        | `c5v1_slam_reloc.launch`               | `c5pro_slam_reloc.launch`              |
| `{platform}_odom_with_map.launch`                     | `c5v1_odom_with_map.launch`            | (null)                                |

### Adding a new platform

1. Identify the `{platform}` name for the physical hardware.
2. Choose the appropriate `{sensor}` model.
3. Instantiate each template with concrete values.
4. Use `$(find bringup)/launch/` and `$(find bringup)/config/` paths in all ROS references.

## Design Principles

1. **Physical entity prefix** — The first segment is always `{platform}`, expressing which hardware the configuration runs on.
2. **Sensor explicit in configs** — `{sensor}` appears only in config filenames; launch files omit it because sensor detail is inherited from the configs they load.
3. **Backward-compatible JSON keys** — Livox driver JSON internal keys (`"MID360"`, `"Mid360s"` etc.) remain unchanged to preserve Livox SDK compatibility.
4. **Recipe names follow `{platform}-{lidar}[-{mode}]`** — e.g. `c5pro-mid360s` for c5pro + dual Mid360s slam, `c5pro-mid360s-map` for slam + map export, `c5pro-mid360s-reloc` for relocalization. Recipe → launch file mapping lives in `src/core/config.ts`.
