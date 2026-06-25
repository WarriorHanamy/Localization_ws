#!/bin/bash
# fastlio bootstrap installer
# Usage: curl -fsSL <SERVER>/install/fastlio | bash -s -- [CONFIG] [VERSION]
#   CONFIG:  c5v1-mid360-mavros (default), c5v1-mid360-livox, c5pro-mid360s-mavros, c5pro-mid360s-livox
#   VERSION: image tag or "latest" (default)
set -euo pipefail

readonly ARTIFACT_BASE="__ARTIFACT_BASE__"
readonly RUNTIME_ROOT="${HOME}/opt/fastlio"
readonly CONTAINER_NAME="fastlio-runtime"

GREEN="\\033[32m"
RED="\\033[31m"
BOLD="\\033[1m"
RESET="\\033[0m"

# ── 1. Resolve config & version ───────────────────────────────────────
CONFIG="${1:-c5v1-mid360-mavros}"
case "$CONFIG" in
  c5v1-mid360-mavros|c5v1-mid360-livox|c5pro-mid360s-mavros|c5pro-mid360s-livox) ;;
  *) echo "[fastlio] Unknown config: $CONFIG"; exit 1 ;;
esac

VERSION="${2:-latest}"
if [[ "$VERSION" == "latest" ]]; then
  echo "[fastlio] resolving latest version for $CONFIG..."
  VERSION=$(curl -fsSL "${ARTIFACT_BASE}/artifacts/fastlio/${CONFIG}/latest.txt" 2>/dev/null || \
            wget -qO- "${ARTIFACT_BASE}/artifacts/fastlio/${CONFIG}/latest.txt" 2>/dev/null)
  if [[ -z "$VERSION" ]]; then
    echo "[fastlio] ERROR: cannot resolve latest version"
    exit 1
  fi
fi
echo "[fastlio] config=$CONFIG version=$VERSION"

# ── 2. Check dependencies ──────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[fastlio] ERROR: docker not found"
  exit 1
fi

if ! id -nG | grep -qw docker; then
  if grep -q "^docker:.*:${USER}\b" /etc/group 2>/dev/null; then
    echo "[fastlio] docker group needs this login session"
    echo "  Run: newgrp docker && curl -fsSL ... | bash"
    exit 1
  else
    echo "[fastlio] ERROR: user not in docker group"
    echo "  Run once: sudo usermod -aG docker \$USER"
    echo "  Then: newgrp docker && curl -fsSL ... | bash"
    exit 1
  fi
fi

# ── 3. Docker daemon setup ─────────────────────────────────────────────
NEW_REG="192.168.108.83:5000"
if systemctl show docker.service 2>/dev/null | grep -q 'Environment=.*HTTP_PROXY'; then
  echo "[fastlio] WARNING: Docker daemon has HTTP_PROXY set"
  echo "[fastlio]   Ensure no_proxy includes 192.168.108.0/22"
fi
CFG=/etc/docker/daemon.json
CHANGED=0
if [ ! -f "$CFG" ]; then
  echo "{}" | sudo tee "$CFG" > /dev/null
fi
if ! grep -q "$NEW_REG" "$CFG"; then
  echo "[fastlio] configuring Docker insecure-registry: $NEW_REG"
  python3 -c "
import json
with open('$CFG') as f:
    d = json.load(f)
d.setdefault('insecure-registries', [])
if '$NEW_REG' not in d['insecure-registries']:
    d['insecure-registries'].append('$NEW_REG')
    with open('$CFG', 'w') as f:
        json.dump(d, f, indent=2)
    print('changed')
  " | grep -q changed && CHANGED=1
fi
if [ "$CHANGED" = "1" ]; then
  echo "[fastlio] restarting Docker daemon..."
  sudo systemctl restart docker
  sleep 2
fi

# ── 4. Download + verify ───────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

BUNDLE_NAME="fastlio-runtime-${CONFIG}"
BUNDLE_URL="${ARTIFACT_BASE}/artifacts/fastlio/${CONFIG}/${BUNDLE_NAME}.tar.gz"
SHA256_URL="${BUNDLE_URL}.sha256"

echo "[fastlio] downloading bundle..."
if command -v curl &>/dev/null; then
  curl -fsSL "$BUNDLE_URL" -o "$TMP_DIR/$BUNDLE_NAME.tar.gz"
  curl -fsSL "$SHA256_URL" -o "$TMP_DIR/$BUNDLE_NAME.tar.gz.sha256"
else
  wget -q "$BUNDLE_URL" -O "$TMP_DIR/$BUNDLE_NAME.tar.gz"
  wget -q "$SHA256_URL" -O "$TMP_DIR/$BUNDLE_NAME.tar.gz.sha256"
fi

echo "[fastlio] verifying sha256..."
(cd "$TMP_DIR" && sha256sum -c "$BUNDLE_NAME.tar.gz.sha256") || {
  echo "[fastlio] ERROR: sha256 mismatch"
  exit 1
}

# ── 5. Extract ────────────────────────────────────────────────────────
mkdir -p "$RUNTIME_ROOT"
rm -rf "${RUNTIME_ROOT}/config" "${RUNTIME_ROOT}/launch" "${RUNTIME_ROOT}/scripts" "${RUNTIME_ROOT}/rviz" "${RUNTIME_ROOT}/PCD"
tar xzf "$TMP_DIR/$BUNDLE_NAME.tar.gz" --strip-components=1 -C "$RUNTIME_ROOT"
echo "[fastlio] extracted to $RUNTIME_ROOT"

# ── 6. Cache bundle for rollback ────────────────────────────────────────
mkdir -p "${RUNTIME_ROOT}/releases"
cp "$TMP_DIR/$BUNDLE_NAME.tar.gz" "${RUNTIME_ROOT}/releases/${BUNDLE_NAME}.tar.gz"

# ── 7. Read manifest ───────────────────────────────────────────────────
MANIFEST="${RUNTIME_ROOT}/manifest.yaml"
if [[ ! -f "$MANIFEST" ]]; then
  echo "[fastlio] ERROR: manifest.yaml not found"
  exit 1
fi

IMAGE=$(grep -E '^\s*image:' "$MANIFEST" | awk '{print $2}')
echo "[fastlio] image: $IMAGE"

# ── 8. Docker pull ─────────────────────────────────────────────────────
echo "[fastlio] pulling image..."
docker pull "$IMAGE"

# Verify image digest
EXPECTED_DIGEST=$(grep -E '^\s*digest:' "$MANIFEST" | awk '{print $2}')
if [[ -n "$EXPECTED_DIGEST" ]]; then
  echo "[fastlio] verifying image digest..."
  ACTUAL_DIGEST=$(docker image inspect --format='{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null | cut -d@ -f2)
  if [[ "$EXPECTED_DIGEST" != "$ACTUAL_DIGEST" ]]; then
    echo "[fastlio] ERROR: digest mismatch"
    echo "  expected: $EXPECTED_DIGEST"
    echo "  actual:   $ACTUAL_DIGEST"
    exit 1
  fi
fi

# ── 9. Stop old container ──────────────────────────────────────────────
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[fastlio] stopping old container..."
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

# ── 10. Start new container ────────────────────────────────────────────
echo "[fastlio] starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --network host --ipc host --privileged \
  -v "${RUNTIME_ROOT}/config:/catkin_ws/src/bringup/config:ro" \
  -v "${RUNTIME_ROOT}/launch:/catkin_ws/src/bringup/launch:ro" \
  -v "${RUNTIME_ROOT}/scripts:/catkin_ws/src/bringup/scripts:ro" \
  -v "${RUNTIME_ROOT}/PCD:/catkin_ws/src/bringup/PCD" \
  -v "${RUNTIME_ROOT}/data/logs:/root/.ros/log" \
  "$IMAGE" \
  roslaunch bringup slam.launch

CID=$(docker ps -lq)
echo "[fastlio] container started: ${CID:0:12}"

# ── 11. L1 smoke test ──────────────────────────────────────────────────
echo ""
echo "[fastlio] running L1 smoke test (LiDAR + IMU)..."
SMOKE_OK=0
for i in $(seq 1 15); do
  if docker exec "$CONTAINER_NAME" bash /catkin_ws/src/bringup/scripts/check-l1.sh 2>/dev/null; then
    SMOKE_OK=1
    break
  fi
  sleep 6
done

# ── 12. Summary ────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo " fastlio deployment summary"
echo "============================================"
echo " config:      $CONFIG"
echo " version:     $VERSION"
echo " image:       $IMAGE"
echo " container:   $CONTAINER_NAME (${CID:0:12})"
echo " runtime:     $RUNTIME_ROOT"
if [[ "$SMOKE_OK" == "1" ]]; then
  echo " smoke:       ${GREEN}${BOLD}PASS${RESET}"
  echo "============================================"
  echo ""
  echo "${GREEN}${BOLD}[fastlio] deployment OK${RESET}"
  docker logs --tail 10 "$CONTAINER_NAME"
  exit 0
else
  echo " smoke:       ${RED}${BOLD}FAIL${RESET}"
  echo "============================================"
  echo ""
  echo "${RED}${BOLD}[fastlio] deployment FAILED — smoke check failed${RESET}"
  echo ""
  echo "[fastlio] rolling back..."
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
  if [[ -f "${RUNTIME_ROOT}/releases/${BUNDLE_NAME}.tar.gz" ]]; then
    rm -rf "${RUNTIME_ROOT}/config" "${RUNTIME_ROOT}/launch" "${RUNTIME_ROOT}/scripts" "${RUNTIME_ROOT}/rviz"
    rm -rf "${RUNTIME_ROOT}/config" "${RUNTIME_ROOT}/launch" "${RUNTIME_ROOT}/scripts" "${RUNTIME_ROOT}/rviz" "${RUNTIME_ROOT}/PCD"
    tar xzf "${RUNTIME_ROOT}/releases/${BUNDLE_NAME}.tar.gz" --strip-components=1 -C "$RUNTIME_ROOT"
    docker run -d \
      --name "$CONTAINER_NAME" \
      --network host --ipc host --privileged \
      -v "${RUNTIME_ROOT}/config:/catkin_ws/src/bringup/config:ro" \
      -v "${RUNTIME_ROOT}/launch:/catkin_ws/src/bringup/launch:ro" \
      -v "${RUNTIME_ROOT}/scripts:/catkin_ws/src/bringup/scripts:ro" \
      -v "${RUNTIME_ROOT}/PCD:/catkin_ws/src/bringup/PCD" \
      -v "${RUNTIME_ROOT}/data/logs:/root/.ros/log" \
      "$IMAGE" \
      roslaunch bringup slam.launch
    echo "[fastlio] rolled back to previous container"
  fi
  exit 1
fi
