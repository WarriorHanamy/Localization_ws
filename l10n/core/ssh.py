import os
import shlex
import subprocess
import sys
import time

from l10n.schema import REMOTE_HOST_USB, REMOTE_USER, SSH_OPTS, RSYNC_EXCLUDES


def _env() -> dict:
    return os.environ.copy()


def _ssh_target() -> str:
    return f"{REMOTE_USER}@{REMOTE_HOST_USB}"


def _is_usb_reachable() -> bool:
    result = subprocess.run(
        ["ping", "-c1", "-W1", REMOTE_HOST_USB],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def _ssh_cmd(remote_cmd: str) -> list:
    passwd = _env().get("SSHPASS", "")
    prefix = ["sshpass", "-e"] if passwd else []
    return [
        *prefix,
        "ssh",
        *shlex.split(SSH_OPTS),
        _ssh_target(),
        remote_cmd,
    ]


def _rsync_cmd(src: str, dst: str, extra_excludes=None) -> list:
    passwd = _env().get("SSHPASS", "")
    prefix = ["sshpass", "-e"] if passwd else []
    cmd = [
        *prefix,
        "rsync",
        "-avz",
        "--delete",
        "--partial",
        "--timeout=60",
        "--rsh=ssh {}".format(SSH_OPTS),
    ]
    for exc in RSYNC_EXCLUDES:
        cmd.extend(["--exclude", exc])
    if extra_excludes:
        for exc in extra_excludes:
            cmd.extend(["--exclude", exc])
    cmd.extend([src, dst])
    return cmd


def _run(cmd: list, check: bool = True) -> subprocess.CompletedProcess:
    print(f"  {' '.join(cmd)}")
    result = subprocess.run(cmd, env=_env())
    if check and result.returncode != 0:
        sys.exit(result.returncode)
    return result


def run_ssh(remote_cmd: str, check: bool = True) -> subprocess.CompletedProcess:
    wrapped = f"bash -c {shlex.quote(remote_cmd)}"
    return _run(_ssh_cmd(wrapped), check=check)


def run_rsync(
    src: str, dst: str, extra_excludes=None, check: bool = True
) -> subprocess.CompletedProcess:
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        result = _run(_rsync_cmd(src, dst, extra_excludes), check=False)
        if result.returncode == 0:
            return result
        if attempt < max_attempts:
            print(f"[l10n] rsync failed (attempt {attempt}), retrying in 3s ...")
            time.sleep(3)
    if check:
        sys.exit(result.returncode)
    return result
