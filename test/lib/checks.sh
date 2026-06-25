#!/usr/bin/env bash
# test/lib/checks.sh — passive check primitives for the test runner.
# Source this file, then call the check_* functions.
# Globals used: IMU_TOPIC (set by runner.sh from config)

set -euo pipefail

RESULT_PASS=0
RESULT_FAIL=0

_ts() { date '+%H:%M:%S'; }

# ── helpers ──────────────────────────────────────────────────────────────────

_pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; ((RESULT_PASS++)) || true; }
_fail() { printf "  \033[31m✗\033[0m %s\n" "$1" >&2;   ((RESULT_FAIL++)) || true; }

_rostopic_type() {
    rostopic type "$1" 2>/dev/null || true
}

_rosnode_exists() {
    rosnode list 2>/dev/null | grep -qF "$1"
}

# ── startup wait ─────────────────────────────────────────────────────────────

wait_for_roscore() {
    local timeout="${1:-30}"
    local elapsed=0
    while (( elapsed < timeout )); do
        if rosnode list &>/dev/null; then
            return 0
        fi
        sleep 1
        ((elapsed++))
    done
    return 1
}

wait_for_node() {
    local node="$1" timeout="${2:-60}" elapsed=0
    while (( elapsed < timeout )); do
        if _rosnode_exists "$node"; then
            return 0
        fi
        sleep 1
        ((elapsed++))
    done
    return 1
}

# ── check primitives ─────────────────────────────────────────────────────────

check_container_alive() {
    echo "[$(_ts)] container_alive"
    _pass "container alive"
}

check_node() {
    local node="$1"
    echo "[$(_ts)] node ${node}"
    if _rosnode_exists "$node"; then
        _pass "node ${node}"
    else
        _fail "node ${node} NOT FOUND"
    fi
}

check_topic_type() {
    local topic="$1" expected="$2"
    echo "[$(_ts)] topic_type ${topic}"
    local actual
    actual=$(_rostopic_type "$topic")
    if [[ "$actual" == "$expected" ]]; then
        _pass "topic ${topic} = ${expected}"
    else
        _fail "topic ${topic} expected ${expected} got [${actual}]"
    fi
}

check_topic_hz() {
    local topic="$1" min_hz="${2:-5}" sample_secs="${3:-10}"
    echo "[$(_ts)] topic_hz ${topic} (≥ ${min_hz} Hz, ${sample_secs}s window)"
    local hz_line
    hz_line=$(timeout "${sample_secs}" rostopic hz "${topic}" --window=20 2>/dev/null \
               | grep -E 'average rate:' | tail -1) || true
    if [[ -z "$hz_line" ]]; then
        _fail "${topic} hz: no data in ${sample_secs}s"
        return
    fi
    local hz
    hz=$(echo "$hz_line" | sed 's/.*average rate: *\([0-9.]*\).*/\1/')
    if [[ -z "$hz" ]]; then
        _fail "${topic} hz: could not parse [${hz_line}]"
        return
    fi
    if awk "BEGIN { exit ($hz >= $min_hz ? 0 : 1) }"; then
        _pass "${topic} hz = ${hz} (≥ ${min_hz})"
    else
        _fail "${topic} hz = ${hz} (< ${min_hz})"
    fi
}

# ── summary ──────────────────────────────────────────────────────────────────

print_summary() {
    echo ""
    echo "─────────────────────────────────────────"
    if (( RESULT_FAIL == 0 )); then
        echo -e "\033[32mALL ${RESULT_PASS} PASSED\033[0m"
    else
        echo -e "\033[31mPASS ${RESULT_PASS} / FAIL ${RESULT_FAIL}\033[0m"
    fi
    echo "─────────────────────────────────────────"
}
