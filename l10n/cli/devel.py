"""Local development commands: source."""

import argparse

from l10n.schema import ROS_DISTRO
from l10n.core.workspace import get_repo_root


def cmd_source(_args):
    """Print ROS source commands for eval."""
    ros_setup = f"/opt/ros/{ROS_DISTRO}/setup.bash"
    root = get_repo_root()
    devel_setup = root / "devel" / "setup.bash"
    lines = [
        f"source {ros_setup}",
        f"[ -f {devel_setup} ] && source {devel_setup}",
        f"cd {root}",
    ]
    print(" && ".join(lines))


def main(argv: list = None):
    parser = argparse.ArgumentParser(
        prog="devel",
        description="l10n: local development commands (source)",
    )
    sub = parser.add_subparsers(dest="command", help="subcommands")
    sub.add_parser("source", help="print ROS source commands for eval")

    args = parser.parse_args(argv)

    dispatch = {
        "source": cmd_source,
    }

    if args.command in dispatch:
        dispatch[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
