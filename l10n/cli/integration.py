"""CI/CD commands: sync, build, increment, full, check, paths, build-pkg."""

import argparse
import shlex
import sys

from l10n.core.workspace import get_repo_root
from l10n.core.ssh import run_ssh, run_rsync, _ssh_target
from l10n.schema import REMOTE_PATH, ROS_DISTRO, WORKSPACE_PKGS


def _stage(n: int, total: int, msg: str) -> str:
    return f"[l10n] Stage {n}/{total}: {msg}"


def cmd_sync(_args):
    """rsync workspace to Jetson (incremental)."""
    print("[l10n] sync via USB (192.168.55.1)")
    check = run_ssh("echo SSH_OK", check=False)
    if check.returncode != 0:
        print("[l10n] SSH check failed. Aborting sync.")
        sys.exit(1)

    repo_root = get_repo_root()
    src = f"{repo_root}/"
    dst = f"{_ssh_target()}:{REMOTE_PATH}/"
    print(f"[l10n] Rsync {repo_root} -> {dst}")
    run_rsync(src, dst)
    print("[l10n] Sync complete.")


def cmd_build(_args):
    """Remote catkin build (clean rebuild)."""
    print(f"[l10n] Clean build on {REMOTE_PATH} ...")
    build_cmd = (
        f"source /opt/ros/{ROS_DISTRO}/setup.bash && "
        f"cd {shlex.quote(REMOTE_PATH)} && "
        f"catkin config --init --source-space . && "
        f"rm -rf build devel && "
        f"catkin build --no-status"
    )
    run_ssh(build_cmd)
    print("[l10n] Build complete.")


def cmd_increment(_args):
    """Rsync + remote catkin build (incremental, no clean)."""
    repo_root = get_repo_root()
    src = f"{repo_root}/"
    dst = f"{_ssh_target()}:{REMOTE_PATH}/"

    print(_stage(1, 2, f"Rsync {repo_root} -> {dst}"))
    run_rsync(src, dst)

    print(_stage(2, 2, "catkin build (incremental) ..."))
    build_cmd = (
        f"source /opt/ros/{ROS_DISTRO}/setup.bash && "
        f"cd {shlex.quote(REMOTE_PATH)} && "
        f"catkin config --init --source-space . && "
        f"catkin build --no-status"
    )
    run_ssh(build_cmd)
    print("[l10n] Increment complete.")


def cmd_full(_args):
    """Rsync + remote clean catkin build."""
    repo_root = get_repo_root()
    src = f"{repo_root}/"
    dst = f"{_ssh_target()}:{REMOTE_PATH}/"

    print(_stage(1, 2, f"Full rsync {repo_root} -> {dst}"))
    run_rsync(src, dst)

    print(_stage(2, 2, "catkin build (clean rebuild) ..."))
    build_cmd = (
        f"source /opt/ros/{ROS_DISTRO}/setup.bash && "
        f"cd {shlex.quote(REMOTE_PATH)} && "
        f"catkin config --init --source-space . && "
        f"rm -rf build devel && "
        f"catkin build --no-status"
    )
    run_ssh(build_cmd)
    print("[l10n] Full pipeline complete.")


def cmd_build_pkg(args):
    """Build a single package on the remote."""
    if args.package not in WORKSPACE_PKGS:
        print(f"[l10n] Unknown package: {args.package}")
        print(f"  Known: {', '.join(WORKSPACE_PKGS)}")
        sys.exit(1)

    check = run_ssh("echo SSH_OK", check=False)
    if check.returncode != 0:
        print("[l10n] SSH check failed. Run 'uv run integration sync' first.")
        sys.exit(1)

    build_cmd = (
        f"source /opt/ros/{ROS_DISTRO}/setup.bash && "
        f"cd {shlex.quote(REMOTE_PATH)} && "
        f"catkin build {args.package} --no-status"
    )
    run_ssh(build_cmd)
    print(f"[l10n] Build {args.package} complete.")


def cmd_check(_args):
    """Verify SSH connectivity and remote toolchain."""
    print("[l10n] Checking SSH to nv@192.168.55.1 (USB) ...")
    result = run_ssh("echo SSH_OK", check=False)
    if result.returncode != 0:
        print("[l10n] SSH failed. Check SSHPASS env, host, and network.")
        sys.exit(1)
    print("[l10n] SSH OK")

    checks = {
        "catkin_tools": "which catkin",
        "ROS setup": f"test -f /opt/ros/{ROS_DISTRO}/setup.bash",
        "python3": "which python3",
    }
    print("[l10n] Remote toolchain:")
    for label, cmd in checks.items():
        result = run_ssh(cmd, check=False)
        print(f"  {label}: {'OK' if result.returncode == 0 else 'MISSING'}")
    print("[l10n] Check complete.")


def cmd_paths(_args):
    """Print workspace package paths."""
    print("[l10n] Local workspace packages:")
    repo_root = get_repo_root()
    for pkg in sorted(WORKSPACE_PKGS):
        pkg_dir = repo_root / pkg
        print(f"  {pkg:30s} {pkg_dir}")
    print(f"\n[l10n] Remote target: {REMOTE_PATH}")


def main(argv: list = None):
    parser = argparse.ArgumentParser(
        prog="integration",
        description="l10n CI/CD: sync, build, increment, full, check, paths, build-pkg",
    )
    sub = parser.add_subparsers(dest="command", help="subcommands")

    sub.add_parser("sync", help="rsync workspace to Jetson")
    sub.add_parser("build", help="remote catkin build (clean rebuild)")
    sub.add_parser("increment", help="rsync + remote catkin build (no clean)")
    sub.add_parser("full", help="rsync + remote clean catkin build")
    sub.add_parser("check", help="verify SSH connectivity and remote tools")
    sub.add_parser("paths", help="print workspace package paths")

    pkg = sub.add_parser("build-pkg", help="build a single package")
    pkg.add_argument("package", type=str, help="package name")

    args = parser.parse_args(argv)

    dispatch = {
        "sync": cmd_sync,
        "build": cmd_build,
        "increment": cmd_increment,
        "full": cmd_full,
        "check": cmd_check,
        "paths": cmd_paths,
        "build-pkg": cmd_build_pkg,
    }

    if args.command in dispatch:
        dispatch[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
