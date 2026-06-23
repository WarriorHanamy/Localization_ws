#!/usr/bin/env python3
"""下采样 PCD 文件（支持 ASCII 和 binary 格式），每 N 个点保留 1 个。"""

import argparse
import os
import struct
import sys


def downsample_pcd(input_path, output_path, factor):
    header_lines = []
    point_count = 0
    point_step = 0
    data_type = None
    header_size = 0

    # 以二进制模式读取，手动解析 ASCII header
    with open(input_path, 'rb') as f:
        raw = f.read()

    # 逐行解析 header（PCD header 是 ASCII）
    pos = 0
    while pos < len(raw):
        line_end = raw.find(b'\n', pos)
        if line_end == -1:
            break
        line = raw[pos:line_end].decode('ascii', errors='replace')
        line_str = line.strip() + '\n'
        header_lines.append(line_str)

        if line.startswith('POINTS'):
            point_count = int(line.split()[1])
        elif line.startswith('FIELDS'):
            fields = line.split()[1:]
        elif line.startswith('SIZE'):
            sizes = [int(s) for s in line.split()[1:]]
            point_step = sum(sizes)
        elif line.startswith('TYPE'):
            types = line.split()[1:]
        elif line.startswith('COUNT'):
            counts = [int(c) for c in line.split()[1:]]
        elif line.startswith('DATA'):
            data_type = line.split()[1]
            pos = line_end + 1
            header_size = pos
            break

        pos = line_end + 1

    if point_count == 0 or data_type is None:
        print("Error: invalid PCD file (missing POINTS or DATA)")
        sys.exit(1)

    data_bytes = raw[header_size:]

    if data_type == 'ascii':
        # ASCII 模式：按行下采样
        data_lines = data_bytes.decode('ascii', errors='replace').strip().split('\n')
        sampled = data_lines[::factor]
        new_count = len(sampled)
        new_data = '\n'.join(sampled) + '\n'

    elif data_type == 'binary':
        # Binary 模式：按 point_step 字节为一个点，下采样
        if point_step == 0:
            print("Error: unknown point_step for binary PCD")
            sys.exit(1)

        new_count = (point_count + factor - 1) // factor
        new_data = bytearray()

        for i in range(0, point_count, factor):
            offset = i * point_step
            if offset + point_step <= len(data_bytes):
                new_data.extend(data_bytes[offset:offset + point_step])
        new_data = bytes(new_data)

    elif data_type == 'binary_compressed':
        print("Error: binary_compressed PCD is not supported")
        sys.exit(1)
    else:
        print(f"Error: unknown DATA type: {data_type}")
        sys.exit(1)

    # 重建 header
    new_header = []
    for line in header_lines:
        if line.startswith('POINTS'):
            line = f"POINTS {new_count}\n"
        elif line.startswith('WIDTH'):
            line = f"WIDTH {new_count}\n"
        elif line.startswith('HEIGHT'):
            line = "HEIGHT 1\n"
        new_header.append(line)

    with open(output_path, 'wb') as f:
        for line in new_header:
            f.write(line.encode('ascii'))
        f.write(new_data)

    print(f"Input:  {input_path}  ({point_count} points, {data_type})")
    print(f"Output: {output_path}  ({new_count} points)")
    print(f"Ratio:  1/{factor}")


def main():
    parser = argparse.ArgumentParser(description="Downsample PCD point cloud")
    parser.add_argument("-i", "--input", help="Input PCD file path")
    parser.add_argument("-o", "--output", default=None, help="Output PCD file path")
    parser.add_argument("-f", "--factor", type=int, default=3,
                        help="Downsample factor (default: 3)")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: file not found: {args.input}")
        sys.exit(1)

    if args.output is None:
        base, ext = os.path.splitext(args.input)
        args.output = f"{base}_down{args.factor}x{ext}"

    downsample_pcd(args.input, args.output, args.factor)


if __name__ == "__main__":
    main()
