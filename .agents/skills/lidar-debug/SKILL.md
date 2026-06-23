---
name: lidar-debug
description: Diagnose and fix Livox MID360 or Mid360s bringup failures across network reachability, driver JSON, launch include chains, xfer_format, ROS message schemas, and FAST_LIO preprocessing. Use for LiDAR not working, params check failures, missing SLAM data, network/ARP faults, ROS datatype mismatches, or repeated PointCloud2 field errors such as "Failed to find match for field 'time'/'ring'" on the Jetson runtime.
---

# LiDAR Debug

Debug a LiDAR deployment from NIC to SLAM. Supports both **MID360** and
**Mid360s** models. The workflow covers three layers: **network** (find the
LiDAR IP, fix subnet mismatch), **driver config** (Livox JSON structure, param
naming), and **SLAM config** (faster_lio message type alignment).

---

## Step 0: Identify Model

Identify the model from user intent and the detection log. Treat `dev_type:9`
as MID360 and `dev_type:35` as Mid360s. Resolve any disagreement before
editing configuration.

Inspect launch/config files only under `bringup/launch/` and
`bringup/config/`; these bind-mounted files are canonical. Trace every
top-level `<include>` and `<rosparam>` to the actual loaded file. Never infer
the active config from a recipe name alone.

Require model-isolated chains:

| Hardware | Driver JSON | FAST_LIO YAML | Driver launch | Mapping launch |
| --- | --- | --- | --- | --- |
| MID360 | `MID360_config.json` | `fast_lio_mid360.yaml` | `msg_MID360.launch` | `mapping_mid360.launch` |
| Mid360s | `MID360s_config.json` | `fast_lio_mid360s.yaml` | `msg_MID360s.launch` | `mapping_mid360s.launch` |

Do not route Mid360s through `mapping_mid360.launch` or a shared sensor YAML;
that hides model-specific message and preprocessing assumptions.

---

## Layer 1 — Network: From NIC to LiDAR

### 1.1 Check Jetson network interfaces

```bash
ssh nv@192.168.55.1 "ip addr show"
```

Look for:

| Interface | Purpose                          | Typical subnet     |
| --------- | -------------------------------- | ------------------ |
| `eth0`    | Hardwired Ethernet → LiDAR        | `192.168.x.0/24`   |
| `wlan0`   | WiFi → internet / ROS bridge      | `192.168.110.0/22` |
| `l4tbr0`  | USB bridge → host PC              | `192.168.55.0/24`  |

### 1.2 Read the configured IP from JSON

```bash
cat /home/nv/Localization_ws/bringup/config/<model-config>.json
```

Extract these two fields:

- For Mid360s (`"host_net_info"` is an Array): `host_net_info[0]` → `"host_ip"`
- For MID360 (`"host_net_info"` is an Object): `host_net_info` → `"cmd_data_ip"`
- `lidar_configs[0]` → `"ip"` (lidar side, e.g. `"192.168.2.88"`)

### 1.3 Match subnet

Compare the config IPs against the actual interface IPs (`ip addr show`).

If the LiDAR subnet does not exist on any Jetson interface (e.g. config says
`192.168.2.x` but eth0 is on `192.168.1.x`), add a secondary IP to the
physical port the LiDAR is connected to:

```bash
ssh nv@192.168.55.1 "sudo ip addr add <host_ip>/24 dev eth0"
# Example: sudo ip addr add 192.168.2.50/24 dev eth0
```

**Persistence via NetworkManager**: This change is lost on reboot. To make it
permanent, modify the ethernet NM connection to hold both IPs:

```bash
ssh nv@192.168.55.1 "sudo nmcli connection modify Livox-LiDAR \
  ipv4.method manual \
  ipv4.addresses '<primary_ip>/24,<secondary_ip>/24'"
ssh nv@192.168.55.1 "sudo nmcli connection down Livox-LiDAR; \
  sudo nmcli connection up Livox-LiDAR"
# Example: 192.168.2.50 as primary, 192.168.1.50 as secondary for LiDAR on 1.x subnet
ssh nv@192.168.55.1 "sudo nmcli connection modify Livox-LiDAR \
  ipv4.method manual \
  ipv4.addresses '192.168.2.50/24,192.168.1.50/24'"
```

Verify both IPs survive `nmcli connection up`:

```bash
ssh nv@192.168.55.1 "ip addr show eth0 | grep 'inet '"
# Expected:
#     inet 192.168.2.50/24 ...
#     inet 192.168.1.50/24 ...
```

### 1.4 Verify reachability

```bash
ssh nv@192.168.55.1 "ping -c 3 <lidar_ip>"
# Example: ping -c 3 192.168.2.88
```

### 1.5 Check ARP table

```bash
ssh nv@192.168.55.1 "ip neigh show | grep <lidar_ip>"
```

A successful ping populates the ARP table with the LiDAR MAC address.

### 1.6 Common error: bind failed (detection socket)

**Error signature:**
```
bind failed
[error] Create detection socket failed.
[error] Create detection channel failed.
Failed to init livox lidar sdk.
```

**Root cause**: Livox SDK internally extracts the host IP from `host_net_info`
in the JSON (`cmd_data_ip` for MID360 object, `host_ip[0].host_ip` for Mid360s
array) and calls `bind()` on UDP port **56000** (`kDetectionPort`). If that IP
does not belong to any local network interface, `bind()` returns `EADDRNOTAVAIL`.

**Diagnosis** — read configured host IP, check interfaces, check port:
```bash
ssh nv@192.168.55.1 "cat /home/nv/Localization_ws/bringup/config/<model-config>.json | grep -E 'cmd_data_ip|host_ip'"
ssh nv@192.168.55.1 "ip addr show | grep <host_ip>"
ssh nv@192.168.55.1 "ss -ulpn | grep 56000"
```

**Fix — choose the right path:**

| Scenario | Action |
| -------- | ------ |
| JSON host IP correct but not assigned to any interface | `sudo ip addr add <host_ip>/24 dev eth0` (see 1.3) |
| JSON host IP does not match the Jetson's LiDAR-facing subnet | ① edit JSON: set `cmd_data_ip` (MID360) or `host_ip[0].host_ip` (Mid360s) to a valid IP on the same subnet as the LiDAR; ② add that IP to eth0 |
| Port 56000 already in use (e.g. stale driver process) | `sudo kill <pid>` or restart the node |

### 1.7 Common error: Detection succeeds but firmware query fails (status -4)

**Error signature:**

The driver repeatedly logs:

```
[info] Handle detection data, handle:<N>, dev_type:9, sn:<SN>, cmd_port:56100
[error] Query livox lidar Fw type failed, the status:-4
```

This pattern repeats every second — detection works but every firmware query
fails.

**Root cause**: The LiDAR's IP was reset to a different subnet than the one
configured in the JSON config (`lidar_configs[0].ip`). UDP broadcast detection
(port 56000, `255.255.255.255`) traverses all subnets and succeeds, but the
subsequent unicast command/firmware-queries use the JSON-configured IP, which
no longer matches the LiDAR's actual address.

**Diagnosis** — four-step chain:

`①` Confirm the driver sockets are bound correctly (detection is working):

```bash
ssh nv@192.168.55.1 "ss -ulpn | grep -E '56000|56101'"
```

`②` Try ping + ARP to the configured LiDAR IP — this will likely fail,
confirming the IP mismatch:

```bash
ssh nv@192.168.55.1 "ping -c 3 -W2 <lidar_ip>"
ssh nv@192.168.55.1 "ip neigh show | grep <lidar_ip>"
# Typical: FAILED (no ARP response)
```

`③` Install tcpdump on the device and capture the LiDAR's detection broadcast
response to discover its actual IP:

```bash
ssh nv@192.168.55.1 "sudo apt-get install -y tcpdump"
ssh nv@192.168.55.1 "sudo tcpdump -i eth0 -nn -c 5 udp port 56000 -X"
```

The LiDAR responds with a UDP packet originating from its real IP. Read the
source IP from the tcpdump header line:

```
IP <lidar_actual_ip>.56000 > 255.255.255.255.56000
```

`④` (Optional) Verify the response matches your LiDAR by decoding the SN from
the hex dump — look for ASCII in the payload:

```
0x0030:  ... 3437 4d44 4e37 4230 3033 3030 3338  ...
               47  M   D   N   7   B   0   0   3   0   0   3   8
```

**Fix** — update JSON config and persist the new subnet:

`①` Update `{model}.json` on the devel machine:
- Change `lidar_configs[0].ip` to the LiDAR's actual IP found in step `③`
- Change all `host_net_info` IP fields to an address on the **same subnet** as
  the LiDAR (add a secondary IP to eth0 as needed)

```bash
# Example: LiDAR is at 192.168.1.138, host was configured for 192.168.2.x
# Edit {model}.json:
#   "ip": "192.168.1.138"                         (was 192.168.2.88)
#   "cmd_data_ip": "192.168.1.50", "push_msg_ip": "192.168.1.50", ...  (was 192.168.2.50)
```

`②` Sync the updated config and add the host secondary IP:

```bash
rsync -avz bringup/config/<model-config>.json \
  nv@192.168.55.1:/home/nv/Localization_ws/bringup/config/<model-config>.json
ssh nv@192.168.55.1 "sudo ip addr add <host_secondary_ip>/24 dev eth0"
# Persist via NetworkManager (see 1.3)
```

`③` Kill any stale driver process and restart:

```bash
ssh nv@192.168.55.1 "source /opt/ros/noetic/setup.bash \
  && source /home/nv/Localization_ws/devel/setup.bash \
  && pkill -9 -f livox_ros_driver; pkill -9 -f roslaunch; \
  sleep 2 && roslaunch bringup <model-driver>.launch xfer_format:=1"
```

**Verification**: The log should now show:

```
[info] Query Fw type succ, the fw_type:1
[info] Update lidar:<N> succ.
successfully set data type ...
successfully change work mode ...
[ INFO] livox/imu publish imu data
[ INFO] livox/lidar publish use customized format
```

---

## Layer 2 — Driver Config: Livox JSON Config

### 2.1 Config file location

`bringup/config/<model-config>.json` — referenced by the model-specific launch:

```xml
<param name="user_config_path" type="string"
       value="$(find bringup)/config/{model}.json"/>
```

### 2.2 JSON structure by model

**MID360** — key `"MID360"`, `host_net_info` is an Object:

```json
{
  "lidar_summary_info" : {
    "lidar_type": 8
  },
  "MID360": {
    "lidar_net_info" : {
      "cmd_data_port": 56100,
      "push_msg_port": 56200,
      "point_data_port": 56300,
      "imu_data_port": 56400,
      "log_data_port": 56500
    },
    "host_net_info" : {
      "cmd_data_ip" : "192.168.2.50",
      "cmd_data_port": 56101,
      "push_msg_ip": "192.168.2.50",
      "push_msg_port": 56201,
      "point_data_ip": "192.168.2.50",
      "point_data_port": 56301,
      "imu_data_ip" : "192.168.2.50",
      "imu_data_port": 56401,
      "log_data_ip" : "",
      "log_data_port": 56501
    }
  },
  "lidar_configs" : [
    {
      "ip" : "192.168.2.88",
      "pcl_data_type" : 1,
      "pattern_mode" : 0,
      "extrinsic_parameter" : { "roll": 0, "pitch": 0, ... }
    }
  ]
}
```

**Mid360s** — key `"Mid360s"`, `host_net_info` is an Array:

```json
{
  "lidar_summary_info" : {
    "lidar_type": 8
  },
  "Mid360s": {
    "lidar_net_info" : {
      "cmd_data_port"  : 56100,
      "push_msg_port"  : 56200,
      "point_data_port": 56300,
      "imu_data_port"  : 56400,
      "log_data_port"  : 56500
    },
    "host_net_info" : [
      {
        "host_ip"        : "192.168.2.50",
        "cmd_data_port"  : 56101,
        "push_msg_port"  : 56201,
        "point_data_port": 56301,
        "imu_data_port"  : 56401,
        "log_data_port"  : 56501
      }
    ]
  },
  "lidar_configs" : [
    {
      "ip" : "192.168.2.88",
      "pcl_data_type" : 1,
      "pattern_mode" : 0,
      "extrinsic_parameter" : { "roll": 0, "pitch": 0, ... }
    }
  ]
}
```

Edit only the canonical file under `bringup/config/`. Do not search elsewhere
for launch files or LiDAR JSON/YAML templates, and never copy across models.

### 2.3 Critical differences: MID360 vs Mid360s

| Aspect                | MID360 (`config/MID360_config.json`)          | Mid360s (`config/MID360s_config.json`)         |
| --------------------- | --------------------------------------------- | ---------------------------------------------- |
| Key name              | `"MID360"` (uppercase)                        | `"Mid360s"` (mixed case, with `s`)             |
| `host_net_info`       | **Object** (each port has its own IP field)   | **Array** (single `host_ip` per entry)         |
| `lidar_summary_info.lidar_type` | `8` (both use 8; SDK C++ enum `kLivoxLidarTypeMid360 = 9`) | `8` (SDK C++ enum `kLivoxLidarTypeMid360s = 35`) |
| Port formatting       | no spaces before colon: `"cmd_data_port":`    | spaces before colon: `"cmd_data_port"  :`       |

### 2.4 Common error: Params check failed

**Error:**
```
[error] Params check failed, all livox lidars config is empty.
Failed to init livox lidar sdk.
```

**Likely causes (in order):**

1. The device-keyed section name does not match the hardware. Use the correct
   vendor template (`MID360_config.json` or `MID360s_config.json`). The section
   key and `host_net_info` format must both be consistent with the hardware.
2. `host_net_info` structure mismatches SDK expectation (Object vs Array).
3. The LiDAR is not reachable on the network (see Layer 1).
4. `lidar_summary_info` or `lidar_configs` section is missing.

> **Note**: `bind failed` / `Create detection socket failed` in the log usually
> points to **network-layer** issue (host IP not assigned, see 1.6), not JSON
> structure. If the JSON is structurally valid but the driver still fails with
> `bind failed`, diagnose per 1.6.

### 2.5 Launch param: xfer_format

```xml
<arg name="xfer_format" default="1"/>
```

| Value | Driver output type | Point schema |
| --- | --- | --- |
| `0` | `sensor_msgs::PointCloud2` | `x,y,z,intensity,tag,line` |
| `1` | `livox_ros_driver2::CustomMsg` | Custom points with `offset_time,line,tag` |

Choose `xfer_format` only after inspecting the checked-out FAST_LIO enum,
subscriber, and preprocessing handler. For this repository revision, use
`xfer_format=1` with `preprocess/lidar_type=1` for MID360 and Mid360s.
Changing only one side creates a ROS datatype mismatch. Using PointCloud2 with
a parser for another sensor preserves the ROS datatype but breaks its fields.

### 2.6 Repository-specific `bd_list` convention

For this repository's current `livox_ros_driver2`, set `bd_list` defaults to
`000000000000000` for both MID360 and Mid360s launchers. Keep overridable
top-level declarations as `default=`, and pass them into an `<include>` with
`value="$(arg bd_list)"`.

Do not put the LiDAR IP in `bd_list`. Device selection and network endpoints
come from `bringup/config/MID360_config.json` or `MID360s_config.json`. The
current C++ startup path calls `InitLdsLidar(user_config_path)` and does not
read the launch-only `cmdline_str` parameter, so deriving `bd_list` from
`lidar_configs[0].ip` is misleading and must not be done in `docker-start`.

Before applying this rule to a different driver revision, search its C++ for
`cmdline_str` or argv whitelist parsing. Upstream variants may still use a
broadcast-code whitelist.

---

## Layer 3 — SLAM Config: faster_lio

### 3.1 Config location

Trace the top-level include to the model-specific mapping launch and YAML:

```xml
<!-- MID360 -->
<rosparam command="load" file="$(find bringup)/config/fast_lio_mid360.yaml" />
<!-- Mid360s -->
<rosparam command="load" file="$(find bringup)/config/fast_lio_mid360s.yaml" />
```

### 3.2 lidar_type

```yaml
preprocess:
    lidar_type: 1
```

Current `FAST_LIO/include/preprocess.h` defines:

| Value | Parser | Required input |
| --- | --- | --- |
| `1` (`AVIA`) | Livox | `livox_ros_driver2::CustomMsg` |
| `2` (`VELO16`) | Velodyne | PointCloud2 fields `time,ring` |
| `3` (`OUST64`) | Ouster | PointCloud2 fields `t,ring,...` |

`laserMapping.cpp` subscribes to CustomMsg only for `AVIA`; all other values
subscribe to PointCloud2. This revision has no `lidar_type=6`. Other forks may
add a Livox PointCloud2 handler as type 6; use it only after confirming the
enum, subscriber, and accepted fields in that exact source revision.

### 3.3 xfer_format causal chain and branches

Follow the complete chain:

```text
xfer_format
  -> driver ROS datatype and point schema
  -> subscriber selected by lidar_type
  -> preprocessing handler and required fields
  -> valid points, datatype rejection, or PCL field warnings
```

Branch on both values:

1. `xfer_format=1` + `lidar_type=1`: correct in this repository. Livox
   CustomMsg reaches the AVIA handler and preserves `offset_time`.
2. `xfer_format=1` + `lidar_type!=1`: publisher is CustomMsg but FAST_LIO
   subscribes to PointCloud2. Expect a ROS datatype mismatch or no callbacks.
3. `xfer_format=0` + `lidar_type=1`: publisher is PointCloud2 but FAST_LIO
   subscribes to CustomMsg. Expect the inverse datatype mismatch.
4. `xfer_format=0` + `lidar_type=2`: ROS datatypes match but point schemas
   do not. Livox publishes `tag,line`; Velodyne requests `time,ring`:

```text
Failed to find match for field 'time'.
Failed to find match for field 'ring'.
```

Treat this exact signature as a parser/schema mismatch, not a network fault
and not a MID360-vs-Mid360s JSON-key fault. Detection has already succeeded.
Fix the complete pair to `xfer_format=1` + `lidar_type=1`.

5. `xfer_format=0` + a verified Livox PointCloud2 handler (for example type 6
   in another fork): valid only if source inspection confirms the driver's
   exact fields are supported.

A pure ROS datatype mismatch can instead produce:

```
Using AVIA Lidar (livox_ros_driver::CustomMsg)
No point, skip this scan!
finishing mapping
```

### 3.4 Other faster_lio topics

```yaml
common:
    lid_topic: "/livox/lidar"   # must match driver output topic
    imu_topic: "/livox/imu"     # must match driver output topic
```

Confirm topics match by inspecting the driver launch file
(`msg_{model}.launch`) — no explicit topic remaps; default topic path is
`/livox/lidar` and `/livox/imu`.

---

## Debugging Checklist

Use this 7-step flow when bringup fails (substitute `{model}`):

```
1. ip addr show                        ← verify NIC IPs
2. cat {model}.json                    ← read host/lidar IPs
3. subnet match?                       ← if no: ip addr add <host_ip>/24 dev eth0
4. port 56000 conflict?                ← if yes: ss -ulpn | grep 56000 → kill stale process
5. ping <lidar_ip>                     ← if no: ARP/cable issue
5.5. tcpdump -i eth0 udp port 56000  ← if detection OK but FW query fails: capture real LiDAR IP (see 1.7)
6. catkin build livox_ros_driver2     ← if build failed: package.xml missing?
7. trace top-level launch includes      ← record actual JSON, YAML, xfer_format
8. inspect FAST_LIO enum/subscriber     ← do not assume lidar_type numbering
9. verify the complete message pair     ← this repo: xfer_format 1 + lidar_type 1
```

---

### Error Decoder

| Symptom                                                       | Root cause                      | Fix                                                    |
| ------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `ROS_DISTRO: unbound variable`                                | ROS env not exported before source | Add to `env.sh`                                        |
| `cannot launch node of type [...] livox_ros_driver2`         | catkin skipped the package      | Generate `package.xml`, rebuild                        |
| `kLivoxLidarTypeMid360s is not a member`                     | SDK too old for this driver     | Add missing enum to `/usr/local/include/livox_lidar_def.h` |
| `Params check failed, all livox lidars config is empty`      | JSON key/structure mismatch     | Use correct vendor config (`MID360_config.json` / `MID360s_config.json`) |
| `Destination Host Unreachable` for LiDAR IP                  | Subnet mismatch                 | `ip addr add <host_ip>/24 dev eth0` |
| `bind failed` + `Create detection socket failed`             | Host IP not assigned to any Jetson interface, or UDP 56000 already in use | ① `ip addr show` verify IP; ② `ss -ulpn \| grep 56000` check port; ③ `sudo ip addr add <host_ip>/24 dev eth0` (see 1.6) |
| Detection succeeds + `Query livox lidar Fw type failed, the status:-4` | LiDAR IP reset to a different subnet; JSON-configured IP stale | `tcpdump -i eth0 udp port 56000` to capture LiDAR's actual IP → update `{model}.json` + host subnet (see 1.7) |
| Repeated missing `time` / `ring` after detection | Livox PointCloud2 parsed as Velodyne (`xfer_format=0`, `lidar_type=2`) | Set `xfer_format=1` + `lidar_type=1` in this repo |
| `Using AVIA Lidar (livox_ros_driver2::CustomMsg)` → no points | Driver and FAST_LIO use different ROS datatypes | Trace both values; in this repo use `xfer_format=1` + `lidar_type=1` |
| `Failed to open traj_file: ./Log/traj.txt`                   | Log directory missing           | `mkdir -p /home/nv/ros1-yopo/Log` |

---

## Key Files

| File                                              | Role                                           |
| ------------------------------------------------- | ---------------------------------------------- |
| `bringup/launch/msg_MID360*.launch`               | Model-specific driver launch and `xfer_format` |
| `bringup/launch/mapping_mid360*.launch`           | Model-specific FAST_LIO launch                  |
| `bringup/config/MID360*_config.json`              | Model-specific Livox network/device JSON        |
| `bringup/config/fast_lio_mid360*.yaml`            | Model-specific FAST_LIO parameters              |
| `FAST_LIO/include/preprocess.h`                   | Authoritative `lidar_type` enum and schemas    |
| `FAST_LIO/src/laserMapping.cpp`                   | Authoritative subscriber branch                 |
| `livox_ros_driver2/src/lddc.cpp`                  | Authoritative PointCloud2 field schema           |
| `/usr/local/include/livox_lidar_def.h`             | SDK device type enum (Jetson side)             |
