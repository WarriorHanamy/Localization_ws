import rosbag
import sensor_msgs.point_cloud2 as pc2
import numpy as np

TOPIC = '/cloud_registered_fov120'
BAG_PATH = './bags/loop_2026-06-23-07-31-57.bag'
OUTPUT_PATH = './pcd/loop_2026-06-23-07-31-57.pcd'

DTYPE = np.dtype([
    ('x',         np.float32),
    ('y',         np.float32),
    ('z',         np.float32),
    ('intensity', np.float32),
    ('normal_x',  np.float32),
    ('normal_y',  np.float32),
    ('normal_z',  np.float32),
    ('curvature', np.float32),
])

frame_arrays = []
total_points = 0

with rosbag.Bag(BAG_PATH, 'r') as bag:
    info = bag.get_type_and_topic_info()
    if TOPIC not in info.topics:
        raise ValueError(f"Topic '{TOPIC}' not found in bag. "
                         f"Available: {list(info.topics.keys())}")

    n_messages = info.topics[TOPIC].message_count
    print(f"Found {n_messages} messages on {TOPIC}")

    for i, (topic, msg, t) in enumerate(bag.read_messages(topics=[TOPIC])):
        pts = pc2.read_points(msg, field_names=("x", "y", "z", "intensity"), skip_nans=True)
        raw = np.array(list(pts), dtype=np.float32)  # shape (N, 4)

        if raw.size > 0:
            N = len(raw)
            arr = np.zeros(N, dtype=DTYPE)
            arr['x']         = raw[:, 0]
            arr['y']         = raw[:, 1]
            arr['z']         = raw[:, 2]
            arr['intensity'] = raw[:, 3]
            frame_arrays.append(arr)
            total_points += N

        if (i + 1) % 50 == 0 or (i + 1) == n_messages:
            print(f"  [{i+1}/{n_messages}] accumulated {total_points} points")

if not frame_arrays:
    print("No points collected.")
    exit(1)

all_points = np.concatenate(frame_arrays)
print(f"Total: {all_points.shape[0]} points")

N = len(all_points)
header = (
    "# .PCD v0.7 - Point Cloud Data file format\n"
    "VERSION 0.7\n"
    "FIELDS x y z intensity normal_x normal_y normal_z curvature\n"
    "SIZE 4 4 4 4 4 4 4 4\n"
    "TYPE F F F F F F F F\n"
    "COUNT 1 1 1 1 1 1 1 1\n"
    f"WIDTH {N}\n"
    "HEIGHT 1\n"
    "VIEWPOINT 0 0 0 1 0 0 0\n"
    f"POINTS {N}\n"
    "DATA binary\n"
)

with open(OUTPUT_PATH, 'wb') as f:
    f.write(header.encode('ascii'))
    f.write(all_points.tobytes())

print(f"Saved to {OUTPUT_PATH}")
