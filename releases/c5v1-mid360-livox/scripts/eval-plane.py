#!/usr/bin/env python3
"""
Evaluate LiDAR-IMU calibration by ground-plane tilt from /cloud_registered.

Subscribes to /cloud_registered (PointCloud2) for duration seconds,
fits a ground plane to the lowest 20% of Z-points via SVD,
computes roll/pitch of the plane normal relative to [0,0,1],
emits SMOKE_RESULT lines.
"""

import sys
import time
import numpy as np
import rospy
from sensor_msgs.msg import PointCloud2
import sensor_msgs.point_cloud2 as pc2

DURATION = rospy.get_param("~duration", 10)
ROLL_THRESH_DEG = float(rospy.get_param("~roll_thresh_deg", 0.5))
PITCH_THRESH_DEG = float(rospy.get_param("~pitch_thresh_deg", 0.5))

points = []


def cb(msg):
    pts = list(pc2.read_points(msg, field_names=("x", "y", "z"), skip_nans=True))
    points.extend(pts)


rospy.init_node("eval_ground_plane")
rospy.Subscriber("/cloud_registered", PointCloud2, cb)

deadline = time.time() + DURATION
while time.time() < deadline and not rospy.is_shutdown():
    rospy.sleep(0.1)

if len(points) < 100:
    print(
        "SMOKE_RESULT\teval\tGround points\tground_plane\t>=100\t{}\t{} pts\t0".format(
            len(points), len(points)
        )
    )
    sys.exit(1)

xyz = np.array(points)
z_thresh = np.percentile(xyz[:, 2], 20)
ground = xyz[xyz[:, 2] < z_thresh]

# SVD plane fit: find normal of best-fit plane
centroid = ground.mean(axis=0)
centered = ground - centroid
U, S, Vt = np.linalg.svd(centered, full_matrices=False)
normal = Vt[2, :]  # row corresponding to smallest singular value
normal /= np.linalg.norm(normal)

# Ensure normal points upward (positive z)
if normal[2] < 0:
    normal = -normal

roll_deg = np.degrees(np.arctan2(normal[1], normal[2]))
pitch_deg = np.degrees(np.arctan2(-normal[0], normal[2]))

roll_ok = 1 if abs(roll_deg) < ROLL_THRESH_DEG else 0
pitch_ok = 1 if abs(pitch_deg) < PITCH_THRESH_DEG else 0

print(
    "SMOKE_RESULT\teval\tGround roll\tground_plane\t<{}°\t{}\t{:.4f}°\t{}".format(
        ROLL_THRESH_DEG, abs(roll_deg), roll_deg, roll_ok
    )
)
print(
    "SMOKE_RESULT\teval\tGround pitch\tground_plane\t<{}°\t{}\t{:.4f}°\t{}".format(
        PITCH_THRESH_DEG, abs(pitch_deg), pitch_deg, pitch_ok
    )
)

failures = 0 if roll_ok and pitch_ok else 1
print("SMOKE_SUMMARY\t{}".format(failures))
sys.exit(0 if failures == 0 else 1)
