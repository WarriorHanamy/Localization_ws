#!/usr/bin/env bash
set -euo pipefail

CONF="${1:-/etc/systemd/system/docker.service.d/http-proxy.conf}"
SUBNETS="${2:-192.168.88.191/22,192.168.88.0/24}"
BASE_NO_PROXY="${BASE_NO_PROXY:-localhost,127.0.0.1}"
FULL_NO_PROXY="${BASE_NO_PROXY},${SUBNETS}"
NO_SUDO="${NO_SUDO:-}"

SUDO_PREFIX="sudo"
if [[ -n "$NO_SUDO" ]]; then
    SUDO_PREFIX=""
fi

$SUDO_PREFIX mkdir -p "$(dirname "$CONF")"

# ---- Case: file does not exist — create minimal template (no HTTP_PROXY) ----
if ! [[ -f "$CONF" ]]; then
    $SUDO_PREFIX tee "$CONF" > /dev/null <<EOF
[Service]
Environment="NO_PROXY=${FULL_NO_PROXY}"
Environment="no_proxy=${FULL_NO_PROXY}"
EOF
    echo "[CREATE] ${CONF}"
    $SUDO_PREFIX systemctl daemon-reload 2>/dev/null || true
    exit 0
fi

# ---- Ensure [Service] header exists ----
grep -q '^\[Service\]' "$CONF" || $SUDO_PREFIX sed -i '1i[Service]' "$CONF"

# ---- Core: idempotently ensure a given variable contains required subnets ----
ensure_line() {
    local var_name="$1"
    local add_subnets="$2"
    local full_value="${BASE_NO_PROXY},${add_subnets}"

    if grep -q "^Environment=\"${var_name}=" "$CONF"; then
        # Line exists — check for each required entry
        local missing=""
        IFS=',' read -ra entries <<< "$add_subnets"
        for entry in "${entries[@]}"; do
            if ! grep "^Environment=\"${var_name}=" "$CONF" | grep -qF "$entry"; then
                missing="${missing}${entry},"
            fi
        done
        missing="${missing%,}"
        if [[ -n "$missing" ]]; then
            $SUDO_PREFIX sed -i "/^Environment=\"${var_name}=/ s|\"$|,${missing}\"|" "$CONF"
            echo "  [APPEND] ${var_name} += ${missing}"
        else
            echo "  [SKIP]  ${var_name} already complete"
        fi
    else
        # Line does not exist — insert after last Environment line or after [Service]
        local last_env
        last_env=$($SUDO_PREFIX grep -n '^Environment=' "$CONF" | tail -1 | cut -d: -f1 || true)
        if [[ -n "$last_env" ]]; then
            $SUDO_PREFIX sed -i "${last_env}a Environment=\"${var_name}=${full_value}\"" "$CONF"
        else
            $SUDO_PREFIX sed -i '/^\[Service\]/a Environment="'"${var_name}=${full_value}"'"' "$CONF"
        fi
        echo "  [INSERT] ${var_name} = ${full_value}"
    fi
}

ensure_line "NO_PROXY" "$SUBNETS"
ensure_line "no_proxy" "$SUBNETS"

$SUDO_PREFIX systemctl daemon-reload 2>/dev/null || true
echo "[DONE]"
