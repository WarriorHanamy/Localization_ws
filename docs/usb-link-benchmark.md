# USB Link: Host ↔ Jetson NX (RNDIS)

## Link Topology

```
Host (Arch)                    Jetson NX (Ubuntu)
  enp17s0u1i5  ───── USB 2.0 ────  l4tbr0
  192.168.55.100                 192.168.55.1
```

## Why USB 2.0 Only

The Jetson Orin NX SoM **supports USB 3.2 Gen2**, but the NX **carrier board's USB-C device port only wires D+/D-**
(USB 2.0 differential pair). The SuperSpeed SSTX/SSRX pairs required for USB 3.x are not routed to the device
port — they are assigned to the USB-A host port instead.

This is a **carrier-board design decision**, not a SoM limitation. The host side has USB 3.x ports available
(Bus 002/004/006 @ 10000M in `lsusb -t`) but the link downgrades to 2.0 because the device port cannot
negotiate higher.

```text
$ lsusb -t
/:  Bus 001.Port 001: Dev 001, Class=root_hub, Driver=xhci_hcd/12p, 480M
    |__ Port 001: Dev 016, If 0, Class=Communications, Driver=rndis_host, 480M
    |__ Port 001: Dev 016, If 1, Class=CDC Data, Driver=rndis_host, 480M
    |__ ... (CDC ACM, mass storage, CDC NCM on same USB device)
```

- **Bus 001** → USB 2.0 host controller (480 Mbps).
- **Dev 016** → The Jetson NX composite USB device; RNDIS operates over USB 2.0 HS.

## Sysfs Link Speed

```text
$ cat /sys/class/net/enp17s0u1i5/speed
425
```

The kernel reports 425 Mbps — slightly below the USB 2.0 HS theoretical 480 Mbps due to RNDIS framing overhead.

## Benchmark (iperf3)

### Commands

```bash
# Host → Device (TCP download)
iperf3 -c 192.168.55.1 -t 10 -O 2

# Device → Host (TCP upload)
iperf3 -c 192.168.55.1 -t 10 -O 2 -R

# Host → Device (UDP)
iperf3 -c 192.168.55.1 -t 5 -u -b 480M
```

### Results

| Direction                     | Protocol | Throughput    |
| ----------------------------- | -------- | ------------- |
| Host → Device (TCP download)  | TCP      | 282–283 Mbps  |
| Device → Host (TCP upload)    | TCP      | 333 Mbps      |
| Host → Device (UDP)           | UDP      | 288 Mbps (0% loss) |

Device→Host direction is ~50 Mbps faster because the NX as the USB **device** controls transfer scheduling,
allowing it to push data more efficiently upstream.

## Practical Implications

| Use case                 | Recommendation                               |
| ------------------------ | -------------------------------------------- |
| rsync, SSH, ROS topics   | USB is fine (~280 Mbps is plenty)            |
| RustDesk / remote viz    | Use WiFi instead; USB bandwidth limits FPS   |
| Large file transfer      | ~35 MB/s sustained (333 Mbps ÷ 8)            |
