import { ARTIFACT_SRV_DIR, ARTIFACT_PORT } from "../core/config";
import { getRepoRoot } from "../core/workspace";
import { getDevelHostLANIP } from "../core/network";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const PID_FILE = join(getRepoRoot(), "logs", "artifact-server.pid");

function generateBootstrapScript(): string {
  const lanIP = getDevelHostLANIP();
  const base = lanIP ? `http://${lanIP}:${ARTIFACT_PORT}` : "__ARTIFACT_BASE__";

  const templatePath =     join(getRepoRoot(), "dist", "artifacts", "bootstrap", "fastlio.template.sh");
  if (!existsSync(templatePath)) {
    throw new Error(`Bootstrap template not found: ${templatePath}`);
  }
  const template = readFileSync(templatePath, "utf-8");
  return template.replace(/__ARTIFACT_BASE__/g, base);
}

function ensureUFW() {
  const YELLOW = "\x1b[33m";
  const RESET = "\x1b[0m";

  const ufwStatus = Bun.spawnSync(["sudo", "ufw", "status"]);
  if (ufwStatus.exitCode !== 0) return;
  if (!ufwStatus.stdout.toString().includes("Status: active")) return;

  const ufwList = Bun.spawnSync(["sudo", "ufw", "status", "verbose"]);
  const has8080 = ufwList.stdout.toString().includes("8080");
  if (has8080) return;

  const proc = Bun.spawnSync(["sudo", "ufw", "allow", "8080/tcp"], {
    stdio: ["inherit", "inherit", "inherit"] as const,
  });
  if (proc.exitCode !== 0) return;

  console.warn(
    `${YELLOW}WARNING: UFW rule added for port 8080/tcp${RESET}`
  );
  console.warn(
    `${YELLOW}  Fleet devices on LAN must reach this artifact server via HTTP.${RESET}`
  );
  console.warn(
    `${YELLOW}  Without this rule, incoming curl/wget from other machines${RESET}`
  );
  console.warn(
    `${YELLOW}  on the network would be blocked by the default-deny policy.${RESET}`
  );
  console.warn(
    `${YELLOW}  To remove: sudo ufw delete allow 8080/tcp${RESET}`
  );
}

function doStart() {
  const destDir = join(ARTIFACT_SRV_DIR, "install");
  mkdirSync(destDir, { recursive: true });

  // Write bootstrap script with correct LAN IP
  const script = generateBootstrapScript();
  const scriptPath = join(destDir, "fastlio");
  writeFileSync(scriptPath, script, { mode: 0o755 });
  console.log(`[fleet-artifacts] Bootstrap script: ${scriptPath}`);

  // Ensure UFW allows 8080 for external clients
  ensureUFW();

  // Check if already running
  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    try {
      process.kill(oldPid, 0);
      console.log(`[fleet-artifacts] Server already running (pid ${oldPid})`);
      printInfo();
      return;
    } catch {
      unlinkSync(PID_FILE);
    }
  }

  // Start artifact server (Bun.serve)
  const proc = Bun.spawn(["bun", "src/web/artifact-server.ts"], {
    stdio: ["ignore", "ignore", "ignore"] as const,
    env: {
      ...process.env,
      ARTIFACT_PORT: String(ARTIFACT_PORT),
      ARTIFACT_ROOT: ARTIFACT_SRV_DIR,
    },
    detached: true,
  });
  proc.unref();
  writeFileSync(PID_FILE, String(proc.pid));
  console.log(`[fleet-artifacts] Server started (pid ${proc.pid}) on :${ARTIFACT_PORT}`);
  printInfo();
}

function doStop() {
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    try {
      process.kill(pid, "SIGTERM");
      console.log(`[fleet-artifacts] Server (pid ${pid}) stopped.`);
    } catch {
      console.log(`[fleet-artifacts] Server (pid ${pid}) not running.`);
    }
    unlinkSync(PID_FILE);
  } else {
    console.log("[fleet-artifacts] No PID file found.");
  }
}

function doStatus() {
  console.log("[fleet-artifacts] Status:");
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    try {
      process.kill(pid, 0);
      console.log(`  Server:  running (pid ${pid})`);
    } catch {
      console.log("  Server:  stopped (stale PID file)");
    }
  } else {
    console.log("  Server:  not running");
  }
  const installPath = join(ARTIFACT_SRV_DIR, "install", "fastlio");
  console.log(`  Script:  ${existsSync(installPath) ? "present" : "missing"}`);
  printInfo();
}

function printInfo() {
  const lanIP = getDevelHostLANIP();
  if (lanIP) {
    console.log(`\n  Install URL: http://${lanIP}:${ARTIFACT_PORT}/install/fastlio`);
    console.log(`  Artifacts:   http://${lanIP}:${ARTIFACT_PORT}/artifacts/fastlio/`);
  }
}

export async function cmdFleetArtifacts(args: string[]) {
  const cmd = args[0];
  switch (cmd) {
    case "start":
      doStart();
      break;
    case "stop":
      doStop();
      break;
    case "status":
      doStatus();
      break;
    default:
      console.log("Usage: bun run fleet-artifacts <start|stop|status>");
      process.exit(cmd ? 1 : 0);
  }
}
