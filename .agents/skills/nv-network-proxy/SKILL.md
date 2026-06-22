---
name: nv-network-proxy
description: Configure an NVIDIA Jetson device on the USB/RNDIS link to use the development host's Clash/mihomo HTTP mixed proxy, including persistent shell and APT settings, sudo preservation, firewall checks, verification, and cleanup. Use when nv@192.168.55.1 cannot access the internet, apt/curl/git on the device need the host proxy, or stale transparent-proxy nftables rules break access to port 7890.
---

# NV Network Proxy

Route device HTTP/HTTPS clients explicitly through the host proxy. Prefer this over transparent NAT: it does not hijack DNS or unrelated ROS/LiDAR traffic and does not require changing the device default route.

## Fixed topology

- Device SSH: `nv@192.168.55.1`
- Device USB interface: `l4tbr0`, address `192.168.55.1`
- Host USB address: `192.168.55.100`
- Host Clash/mihomo mixed port: `7890`
- Proxy URL: `http://192.168.55.100:7890`

Do not store Clash subscription URLs, credentials, or proxy-node details in this skill.

## Configure

Run the bundled idempotent setup script from the host:

```bash
bash .agents/skills/nv-network-proxy/scripts/setup-device-proxy.sh
```

Override defaults only when the topology differs:

```bash
DEVICE_SSH=nv@192.168.55.1 HOST_PROXY_IP=192.168.55.100 PROXY_PORT=7890 \
  bash .agents/skills/nv-network-proxy/scripts/setup-device-proxy.sh
```

The script:

1. Verify the host proxy works through `127.0.0.1:7890`.
2. Reject stale nftables redirects to `7893` or `5334`; remove them using the migration procedure below.
3. Allow device-subnet TCP access to `7890` in UFW when UFW is installed.
4. Install `/etc/profile.d/host-proxy.sh`, `/etc/apt/apt.conf.d/80host-proxy`, and `/etc/sudoers.d/host-proxy-env` on the device.
5. Verify proxied HTTPS from a fresh device login shell.

The `NO_PROXY` list keeps loopback, `.local`, USB, Wi-Fi, LiDAR, and Docker private networks off the proxy. Do not proxy ROS master, LiDAR, SSH, or other local traffic.

## Migrate from the obsolete transparent setup

Check before deleting anything:

```bash
sudo nft -a list chain ip nat PREROUTING
systemctl status nv-usb-forward.service --no-pager
```

If the chain contains the exact device-subnet redirects below, delete each rule by its displayed handle and disable the old service:

```text
ip saddr 192.168.55.0/24 tcp dport != 22 redirect to :7893
ip saddr 192.168.55.0/24 udp dport 53 redirect to :5334
```

```bash
sudo nft delete rule ip nat PREROUTING handle <tcp-handle>
sudo nft delete rule ip nat PREROUTING handle <dns-handle>
sudo systemctl disable --now nv-usb-forward.service
```

Never flush a shared `nat` or `filter` chain: Docker and UFW also own rules there. The old TCP redirect catches connections intended for port `7890` and sends them to an unbound `7893`, which presents as a timeout.

## Verify

```bash
# Host proxy itself
curl -fsS --max-time 12 -x http://127.0.0.1:7890 https://api.ipify.org

# Device can reach the host port
ssh nv@192.168.55.1 "timeout 5 bash -lc '</dev/tcp/192.168.55.100/7890'"

# Fresh login loads proxy variables and reaches HTTPS
ssh nv@192.168.55.1 "bash -lc 'env | grep -i _proxy; curl -fsS --max-time 15 https://api.ipify.org'"

# APT sees its explicit proxy configuration
ssh nv@192.168.55.1 "apt-config dump | grep -i Acquire.*Proxy"
```

Do not treat a direct `curl` without `bash -lc` as a persistence test: non-login SSH commands do not source `/etc/profile.d`.

## systemd services

System services do not inherit shell variables. Add a drop-in only for a service that needs internet access:

```ini
[Service]
Environment="HTTP_PROXY=http://192.168.55.100:7890"
Environment="HTTPS_PROXY=http://192.168.55.100:7890"
Environment="NO_PROXY=localhost,127.0.0.1,::1,.local,192.168.0.0/16,172.16.0.0/12,10.0.0.0/8"
```

Then run `sudo systemctl daemon-reload` and restart that service. Do not set a global systemd proxy; it can route local robotics traffic incorrectly.

## Cleanup

```bash
ssh nv@192.168.55.1 \
  "sudo rm -f /etc/profile.d/host-proxy.sh /etc/apt/apt.conf.d/80host-proxy /etc/sudoers.d/host-proxy-env"
sudo ufw delete allow proto tcp from 192.168.55.0/24 to any port 7890
```

## Troubleshoot

- Host proxy works but device TCP times out: inspect `nft -a` for the stale `7893` redirect, then inspect UFW.
- Host proxy fails locally: fix/restart Clash or mihomo before changing the device.
- `sudo curl` loses variables: validate `/etc/sudoers.d/host-proxy-env` with `visudo -cf`.
- APT fails while shell curl works: inspect `/etc/apt/apt.conf.d/80host-proxy` with `apt-config dump`.
- Local ROS/LiDAR access uses the proxy: extend `NO_PROXY` with the specific private hostname or subnet.
