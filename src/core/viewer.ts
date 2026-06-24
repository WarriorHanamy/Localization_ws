import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { $ } from "bun";

const NOMACHINE_HOST = "192.168.55.1";
const NOMACHINE_WORKSPACE = "9";
const NOMACHINE_CLASS = "Nxplayer.bin";

function findNoMachinePlayer(): string | null {
  const configured = process.env.NOMACHINE_PLAYER;
  if (configured) return existsSync(configured) ? configured : null;
  return Bun.which("nxplayer") ||
    (existsSync("/usr/NX/bin/nxplayer") ? "/usr/NX/bin/nxplayer" : null);
}

function findNoMachineSession(): string | null {
  const configured = process.env.NOMACHINE_SESSION;
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`NOMACHINE_SESSION does not exist: ${configured}`);
    }
    return configured;
  }

  const roots = [
    join(homedir(), "Documents", "NoMachine"),
    join(homedir(), "NoMachine"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).filter((item) => item.endsWith(".nxs")).sort()) {
      const path = join(root, name);
      try {
        if (readFileSync(path, "utf8").includes(NOMACHINE_HOST)) return path;
      } catch {
        // Ignore unreadable profiles and continue looking for a usable one.
      }
    }
  }
  return null;
}

function routeNoMachineOnArchWayland(): void {
  if (!existsSync("/etc/arch-release") || process.env.XDG_SESSION_TYPE !== "wayland") return;

  const desktop = `${process.env.XDG_CURRENT_DESKTOP || ""} ${process.env.XDG_SESSION_DESKTOP || ""}`;
  if (!desktop.toLowerCase().includes("hyprland") || !Bun.which("hyprctl")) {
    console.warn("[viewer] Arch + Wayland detected, but automatic workspace routing requires Hyprland.");
    return;
  }

  const rule = `workspace ${NOMACHINE_WORKSPACE} silent, match:class ^(${NOMACHINE_CLASS.replace(".", "\\.")})$`;
  const route = Bun.spawnSync(["hyprctl", "keyword", "windowrule", rule], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (route.exitCode !== 0) {
    throw new Error(`failed to route NoMachine to workspace ${NOMACHINE_WORKSPACE}: ${route.stderr.toString().trim()}`);
  }
  console.log(`[viewer] Arch/Wayland route active: NoMachine -> workspace ${NOMACHINE_WORKSPACE}`);
}

export function launchNoMachineViewer(): void {
  const player = findNoMachinePlayer();
  if (!player) {
    throw new Error(
      "NoMachine client is required. Install it and ensure /usr/NX/bin/nxplayer exists " +
      "(Arch: yay -S nomachine).",
    );
  }

  routeNoMachineOnArchWayland();
  const session = findNoMachineSession();
  const args = session ? [player, "--session", session] : [player];
  Bun.spawn(args, { stdout: "ignore", stderr: "inherit" });

  if (session) {
    console.log(`[viewer] NoMachine session opened: ${session}`);
  } else {
    console.log(`[viewer] NoMachine opened. First-time setup: connect to ${NOMACHINE_HOST}:4000 and save the profile.`);
  }
}

/** Launch RViz on the Jetson, then maximize its GNOME window without hiding docks. */
export function deviceRvizMaximizedCommand(
  rvizConfig: string,
  rosDistro: string,
  workspaceSetup?: string,
): string {
  const maximizeScript =
    "const w = global.get_window_actors().map(a => a.meta_window)" +
    ".find(w => w.get_pid() === $rviz_pid); " +
    "if (w) { w.maximize(3); true; } else false;";

  const commands = [
    "export DISPLAY=:0",
    "export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus",
    "export DISABLE_ROS1_EOL_WARNINGS=1",
    `source /opt/ros/${rosDistro}/setup.bash`,
  ];
  if (workspaceSetup) commands.push(`source ${$.escape(workspaceSetup)}`);
  const launch = commands.join("; ");
  const maximize =
    `gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell ` +
    `--method org.gnome.Shell.Eval "${maximizeScript}" 2>/dev/null | grep -q "'true'"`;
  return `${launch}; rviz -d ${$.escape(rvizConfig)} & rviz_pid=$!; ` +
    `for _ in $(seq 1 40); do if ${maximize}; then break; fi; sleep 0.25; done; ` +
    `wait "$rviz_pid"`;
}
