#!/usr/bin/env bash
set -euo pipefail

DEVICE_SSH="${DEVICE_SSH:-nv@192.168.55.1}"
HOST_PROXY_IP="${HOST_PROXY_IP:-192.168.55.100}"
PROXY_PORT="${PROXY_PORT:-7890}"
DEVICE_SUBNET="${DEVICE_SUBNET:-192.168.55.0/24}"
PROXY_URL="http://${HOST_PROXY_IP}:${PROXY_PORT}"
NO_PROXY_VALUE="localhost,127.0.0.1,::1,.local,192.168.0.0/16,172.16.0.0/12,10.0.0.0/8"

for command_name in curl ssh scp; do
  command -v "$command_name" >/dev/null || {
    printf 'missing required command: %s\n' "$command_name" >&2
    exit 1
  }
done

printf 'Checking host proxy at http://127.0.0.1:%s ...\n' "$PROXY_PORT"
curl -fsS --max-time 12 -x "http://127.0.0.1:${PROXY_PORT}" \
  https://api.ipify.org >/dev/null

if command -v nft >/dev/null && \
   sudo nft list chain ip nat PREROUTING 2>/dev/null | \
     grep -Eq 'redirect to :(7893|5334)'; then
  printf '%s\n' \
    'stale transparent-proxy redirects detected in ip nat PREROUTING.' \
    'Follow the migration procedure in SKILL.md, then rerun this script.' >&2
  exit 2
fi

if command -v ufw >/dev/null && sudo ufw status 2>/dev/null | grep -q '^Status: active'; then
  sudo ufw allow proto tcp from "$DEVICE_SUBNET" to any port "$PROXY_PORT" \
    comment 'device-host-proxy' >/dev/null
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat >"$tmp_dir/host-proxy.sh" <<EOF
# Managed by nv-network-proxy skill.
export http_proxy="${PROXY_URL}"
export https_proxy="${PROXY_URL}"
export HTTP_PROXY="${PROXY_URL}"
export HTTPS_PROXY="${PROXY_URL}"
export no_proxy="${NO_PROXY_VALUE}"
export NO_PROXY="${NO_PROXY_VALUE}"
EOF

cat >"$tmp_dir/80host-proxy" <<EOF
// Managed by nv-network-proxy skill.
Acquire::http::Proxy "${PROXY_URL}";
Acquire::https::Proxy "${PROXY_URL}";
EOF

cat >"$tmp_dir/host-proxy-env" <<'EOF'
# Managed by nv-network-proxy skill.
Defaults env_keep += "http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY"
EOF

scp -q "$tmp_dir/host-proxy.sh" "$tmp_dir/80host-proxy" \
  "$tmp_dir/host-proxy-env" "${DEVICE_SSH}:/tmp/"

ssh "$DEVICE_SSH" \
  "sudo install -o root -g root -m 0644 /tmp/host-proxy.sh /etc/profile.d/host-proxy.sh &&
   sudo install -o root -g root -m 0644 /tmp/80host-proxy /etc/apt/apt.conf.d/80host-proxy &&
   sudo install -o root -g root -m 0440 /tmp/host-proxy-env /etc/sudoers.d/host-proxy-env &&
   sudo visudo -cf /etc/sudoers.d/host-proxy-env >/dev/null &&
   rm -f /tmp/host-proxy.sh /tmp/80host-proxy /tmp/host-proxy-env"

printf 'Verifying device proxy from a fresh login shell ...\n'
ssh "$DEVICE_SSH" \
  "bash -lc 'test \"\$https_proxy\" = \"${PROXY_URL}\" && curl -fsS --max-time 15 https://api.ipify.org >/dev/null'"

printf 'Configured %s to use %s\n' "$DEVICE_SSH" "$PROXY_URL"
