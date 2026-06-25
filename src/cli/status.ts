import { cmdRegistryStatus, getFleetTrackerUrl } from "./registry";

const USAGE = `
Usage: bun run status <target> [--no-open]

Targets:
  fleet    show fleet registry/tracker status and open tracker
`;

function openUrl(url: string): boolean {
  const cmd = process.platform === "darwin"
    ? ["open", url]
    : process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : ["xdg-open", url];

  const proc = Bun.spawnSync(cmd, {
    stdout: "ignore",
    stderr: "ignore",
  });
  return proc.exitCode === 0;
}

export async function cmdStatus(args: string[]) {
  const target = args[0];
  const noOpen = args.includes("--no-open");

  switch (target) {
    case "fleet": {
      cmdRegistryStatus();
      const url = getFleetTrackerUrl();
      if (!url) {
        console.log("[status] Cannot detect LAN IP for fleet tracker.");
        process.exit(1);
      }

      console.log(`  Tracker:   ${url}`);
      if (!noOpen) {
        if (openUrl(url)) {
          console.log("[status] Opened fleet tracker in browser.");
        } else {
          console.log(`[status] Could not auto-open browser. Open manually: ${url}`);
        }
      }
      break;
    }
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(USAGE);
      process.exit(target ? 0 : 1);
    default:
      console.log(`[status] Unknown target: ${target}`);
      console.log(USAGE);
      process.exit(1);
  }
}
