#!/usr/bin/env python3
"""
MQTT Bridge: ROS topics -> Mosquitto broker.

Subscribes to ROS topics and republishes to MQTT:
  /Odometry         -> l10n/odometry       (JSON)
  /cloud_registered -> l10n/cloud           (binary: float32 xyz array)
  /cpu_usage        -> l10n/cpu             (JSON)
  /path             -> l10n/path            (JSON)
  /ekf_quat/ekf_odom -> l10n/ekf_odom      (JSON)
  /prior_local_cloud -> l10n/prior_cloud    (binary: float32 xyz array)
  /rc_state         -> l10n/rc_state        (JSON)
"""

import json
import struct
import sys
from array import array

import paho.mqtt.client as mqtt
import rospy
from sensor_msgs.msg import PointCloud2, Imu
from nav_msgs.msg import Odometry, Path
from std_msgs.msg import Header
import sensor_msgs.point_cloud2 as pc2
from fast_lio.msg import CPUUsage
from incremental_map_publisher.msg import rc_state

MQTT_BROKER = "localhost"
MQTT_PORT = 1883

# Downsample to this many points max
MAX_POINTS = 8000

mqtt_client = None


def json_publisher(mqtt_topic, throttle_hz=10):
    """Factory: returns a ROS callback that publishes JSON to MQTT."""
    period = 1.0 / throttle_hz if throttle_hz > 0 else 0
    last_time = [0.0]

    def cb(msg):
        now = rospy.get_time()
        if period > 0 and now - last_time[0] < period:
            return
        last_time[0] = now

        payload = json.dumps(msg_to_dict(msg), default=str).encode("utf-8")
        mqtt_client.publish(mqtt_topic, payload, qos=0)

    return cb


def msg_to_dict(msg):
    """Convert any ROS message to a plain dict."""
    out = {}
    for slot in msg.__slots__:
        val = getattr(msg, slot)
        if hasattr(val, "__slots__"):
            out[slot] = msg_to_dict(val)
        elif hasattr(val, "__len__") and not isinstance(val, str):
            out[slot] = list(val)
        else:
            out[slot] = val
    return out


def odom_cb(msg):
    try:
        print("[mqtt_bridge] odom_cb called! seq=%d" % msg.header.seq, flush=True)
        payload = json.dumps(
            {
                "header": {
                    "stamp": {
                        "secs": msg.header.stamp.secs,
                        "nsecs": msg.header.stamp.nsecs,
                    },
                    "frame_id": msg.header.frame_id,
                },
                "child_frame_id": msg.child_frame_id,
                "pose": {
                    "position": {
                        "x": msg.pose.pose.position.x,
                        "y": msg.pose.pose.position.y,
                        "z": msg.pose.pose.position.z,
                    },
                    "orientation": {
                        "x": msg.pose.pose.orientation.x,
                        "y": msg.pose.pose.orientation.y,
                        "z": msg.pose.pose.orientation.z,
                        "w": msg.pose.pose.orientation.w,
                    },
                },
            }
        ).encode("utf-8")
        mqtt_client.publish("l10n/odometry", payload, qos=0)
    except Exception as e:
        rospy.logerr("[mqtt_bridge] odom_cb error: %s", str(e))


def path_cb(msg):
    poses = []
    for pose_stamped in msg.poses[:100]:
        p = pose_stamped.pose.position
        o = pose_stamped.pose.orientation
        poses.append(
            {"x": p.x, "y": p.y, "z": p.z, "qx": o.x, "qy": o.y, "qz": o.z, "qw": o.w}
        )
    payload = json.dumps(
        {"header": {"frame_id": msg.header.frame_id}, "poses": poses}
    ).encode("utf-8")
    mqtt_client.publish("l10n/path", payload, qos=0)


def cpu_cb(msg):
    payload = json.dumps({"usage": list(msg.cpu_usage)}).encode("utf-8")
    mqtt_client.publish("l10n/cpu", payload, qos=0)


def rc_state_cb(msg):
    payload = json.dumps({"connected": msg.connected}).encode("utf-8")
    mqtt_client.publish("l10n/rc_state", payload, qos=0)


def point_cloud_cb(mqtt_topic):
    """Return a callback that downsamples PointCloud2 and publishes binary float32."""
    last_time = [0.0]
    period = 0.25  # 4 Hz max

    def cb(msg):
        now = rospy.get_time()
        if now - last_time[0] < period:
            return
        last_time[0] = now

        try:
            points = []
            for p in pc2.read_points(msg, field_names=("x", "y", "z"), skip_nans=True):
                points.extend(p)

            n = len(points) // 3
            if n == 0:
                return

            # Voxel grid downsampling
            voxel = 0.05
            points_arr = points
            for _ in range(8):
                points_arr = _voxel_downsample(points_arr, voxel)
                if len(points_arr) // 3 <= MAX_POINTS:
                    break
                voxel *= 1.5

            # Publish as binary float32 array
            buf = struct.pack(f"<{len(points_arr)}f", *points_arr)
            mqtt_client.publish(mqtt_topic, buf, qos=0)
        except Exception as e:
            rospy.logwarn(f"[mqtt_bridge] point cloud error: {e}")

    return cb


def _voxel_downsample(xyz, voxel_size):
    n = len(xyz) // 3
    if n == 0:
        return xyz
    grid = {}
    for i in range(n):
        x, y, z = xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]
        key = (int(x / voxel_size), int(y / voxel_size), int(z / voxel_size))
        if key not in grid:
            grid[key] = (x, y, z)
    result = []
    for p in grid.values():
        result.extend(p)
    return result


def main():
    global mqtt_client

    rospy.init_node("mqtt_bridge", anonymous=True)

    mqtt_client = mqtt.Client(client_id="mqtt_bridge", clean_session=True)
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    mqtt_client.loop_start()
    rospy.loginfo(
        "[mqtt_bridge] Connected to Mosquitto on %s:%d", MQTT_BROKER, MQTT_PORT
    )

    # Subscribe to ROS topics
    rospy.Subscriber("/Odometry", Odometry, odom_cb, queue_size=10)
    rospy.Subscriber(
        "/cloud_registered", PointCloud2, point_cloud_cb("l10n/cloud"), queue_size=5
    )
    rospy.Subscriber("/cpu_usage", CPUUsage, cpu_cb, queue_size=5)
    rospy.Subscriber("/path", Path, path_cb, queue_size=5)
    rospy.Subscriber("/ekf_quat/ekf_odom", Odometry, odom_cb, queue_size=5)
    rospy.Subscriber(
        "/prior_local_cloud",
        PointCloud2,
        point_cloud_cb("l10n/prior_cloud"),
        queue_size=5,
    )
    rospy.Subscriber("/rc_state", rc_state, rc_state_cb, queue_size=5)

    rospy.loginfo("[mqtt_bridge] Bridge started. Subscribing to ROS topics...")

    # Status heartbeat via timer
    def publish_heartbeat(_event=None):
        mqtt_client.publish("l10n/bridge_status", b"alive", qos=0, retain=True)

    rospy.Timer(rospy.Duration(1), publish_heartbeat)

    # Spin to receive ROS callbacks
    rospy.spin()

    mqtt_client.loop_stop()
    mqtt_client.disconnect()


if __name__ == "__main__":
    try:
        main()
    except rospy.ROSInterruptException:
        pass
