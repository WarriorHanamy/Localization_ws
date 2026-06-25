#!/bin/bash
# fastlio bootstrap installer
# Usage: curl -fsSL http://<ARTIFACT_SERVER>/install/fastlio | bash -s -- [VERSION]
set -euo pipefail

readonly ARTIFACT_BASE="__ARTIFACT_BASE__"
readonly RUNTIME_ROOT="/opt/fastlio/runtime"
readonly DEVICE_CONFIG="/opt/fastlio/etc/device.yaml"
readonly CONTAINER_NAME="fastlio-runtime"

# ── 1. Check dependencies ────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[fastlio] ERROR: docker not found (pre-installed requirement)"
  exit 1
fi

# ── 2. Read device config ────────────────────────────────────────────────
if [[ ! -f "$DEVICE_CONFIG" ]]; then
  echo "[fastlio] First-time setup required:"
  echo "  mkdir -p /opt/fastlio/etc"
  echo "  cat > $DEVICE_CONFIG << 'EOF'"
  echo "  hardware: c5v1"
  echo "  imu_src: livox"
  echo "  EOF"
  exit 1
fi

HARDWARE=$(grep -E '^hardware:' "$DEVICE_CONFIG" | awk '{print $2}')
IMU_SRC=$(grep -E '^imu_src:' "$DEVICE_CONFIG" | awk '{print $2}')
if [[ -z "$HARDWARE" || -z "$IMU_SRC" ]]; then
  echo "[fastlio] ERROR: $DEVICE_CONFIG missing hardware or imu_src"
  exit 1
fi
echo "[fastlio] device config: hardware=$HARDWARE imu_src=$IMU_SRC"

# ── 3. Resolve version ───────────────────────────────────────────────────
VERSION="${1:-latest}"
if [[ "$VERSION" == "latest" ]]; then
  echo "[fastlio] resolving latest version..."
  VERSION=$(curl -fsSL "${ARTIFACT_BASE}/artifacts/fastlio/latest.txt" 2>/dev/null || \
            wget -qO- "${ARTIFACT_BASE}/artifacts/fastlio/latest.txt" 2>/dev/null)
  if [[ -z "$VERSION" ]]; then
    echo "[fastlio] ERROR: cannot resolve latest version"
    exit 1
  fi
fi
echo "[fastlio] installing version: $VERSION"

# ── 4. Download + verify ─────────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

BUNDLE_NAME="fastlio-runtime-${VERSION}"
BUNDLE_URL="${ARTIFACT_BASE}/artifacts/fastlio/${BUNDLE_NAME}.tar.gz"
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

# ── 5. Extract to releases/ ──────────────────────────────────────────────
RELEASE_DIR="${RUNTIME_ROOT}/releases/${VERSION}"
mkdir -p "$RUNTIME_ROOT/releases"
tar xzf "$TMP_DIR/$BUNDLE_NAME.tar.gz" -C "$RUNTIME_ROOT/releases/"
echo "[fastlio] extracted to $RELEASE_DIR"

# ── 6. Switch current symlink ────────────────────────────────────────────
PREVIOUS=$(readlink -f "$RUNTIME_ROOT/current" 2>/dev/null || echo "")
ln -sfn "$RELEASE_DIR" "$RUNTIME_ROOT/current"
if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$RELEASE_DIR" ]]; then
  ln -sfn "$PREVIOUS" "${RUNTIME_ROOT}/previous" 2>/dev/null || true
fi
echo "[fastlio] current -> $VERSION"

# ── 7. Read manifest ─────────────────────────────────────────────────────
MANIFEST="${RUNTIME_ROOT}/current/manifest.yaml"
if [[ ! -f "$MANIFEST" ]]; then
  echo "[fastlio] ERROR: manifest.yaml not found in bundle"
  exit 1
fi

IMAGE=$(grep -E '^\s*image:' "$MANIFEST" | awk '{print $2}')
ENTRYPOINT_TEMPLATE=$(grep -E '^\s*entrypoint:' "$MANIFEST" | head -1 | sed 's/.*entrypoint: //')
FLAGS=$(awk '/^  flags:/{f=1;next} f{ if(/^    - /){print $2} else {exit} }' "$MANIFEST")
VOLUMES=$(awk '/^  volumes:/{f=1;next} f{ if(/^    - /){print $2} else {exit} }' "$MANIFEST")

# Substitute template vars
ENTRYPOINT=$(echo "$ENTRYPOINT_TEMPLATE" | sed "s/{hardware}/$HARDWARE/g; s/{imu_src}/$IMU_SRC/g")
echo "[fastlio] image:       $IMAGE"
echo "[fastlio] entrypoint:  $ENTRYPOINT"

# ── 8. Docker pull ───────────────────────────────────────────────────────
echo "[fastlio] pulling image..."
docker pull "$IMAGE"

# ── 9. Stop old container ────────────────────────────────────────────────
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[fastlio] stopping old container..."
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

# ── 10. Start new container ──────────────────────────────────────────────
echo "[fastlio] starting container..."
# shellcheck disable=SC2086
docker run -d \
  --name "$CONTAINER_NAME" \
  $FLAGS \
  $VOLUMES \
  -v "$(dirname "$RUNTIME_ROOT/current")/$(readlink "$RUNTIME_ROOT/current")/config:/catkin_ws/src/bringup/config:ro" \
  -v "$(dirname "$RUNTIME_ROOT/current")/$(readlink "$RUNTIME_ROOT/current")/launch:/catkin_ws/src/bringup/launch:ro" \
  -v "$(dirname "$RUNTIME_ROOT/current")/$(readlink "$RUNTIME_ROOT/current")/scripts:/catkin_ws/src/bringup/scripts:ro" \
  -v "/opt/fastlio/data/PCD:/catkin_ws/src/fast_lio/PCD" \
  -v "/opt/fastlio/data/logs:/root/.ros/log" \
  "$IMAGE" \
  $ENTRYPOINT

CID=$(docker ps -lq)
echo "[fastlio] container started: ${CID:0:12}"

# ── 11. Health check ─────────────────────────────────────────────────────
echo "[fastlio] waiting for SLAM ready signal..."
HEALTH_OK=0
for i in $(seq 1 10); do
  if docker exec "$CONTAINER_NAME" test -f /tmp/slam_ready 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 3
done

# ── 12. Summary ──────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo " fastlio deployment summary"
echo "============================================"
echo " version:     $VERSION"
echo " image:       $IMAGE"
echo " container:   $CONTAINER_NAME (${CID:0:12})"
echo " hardware:    $HARDWARE"
echo " imu_src:     $IMU_SRC"
if [[ "$HEALTH_OK" == "1" ]]; then
  echo " health:      OK"
else
  echo " health:      WARNING (timeout)"
fi
echo " config:      $DEVICE_CONFIG"
echo " runtime:     $RELEASE_DIR"
echo "============================================"
echo ""

if [[ "$HEALTH_OK" != "1" ]]; then
  echo "[fastlio] WARNING: health check timed out. Last log lines:"
  docker logs --tail 30 "$CONTAINER_NAME"
  exit 1
fi

docker logs --tail 10 "$CONTAINER_NAME"
