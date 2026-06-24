import { $ } from "bun";
import {
  REGISTRY_PORT,
  REGISTRY_DIRECT_PORT,
  DOCKER_REGISTRY_IMAGE,
} from "../core/config";
import { getRepoRoot } from "../core/workspace";
import { getDevelHostLANIP } from "../core/network";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";

const CONTAINER = "loc-registry";
const PID_FILE = join(getRepoRoot(), "logs", "tracker.pid");

function dockerPs(filter: string): string {
  const proc = Bun.spawnSync(["docker", "ps", "-q", "--filter", filter]);
  return proc.stdout.toString().trim();
}

async function doStart() {
  // 1. Start registry:2
  const existing = dockerPs(`name=${CONTAINER}`);
  if (existing) {
    console.log(`[registry] ${CONTAINER} already running (${existing.slice(0, 12)})`);
  } else {
    console.log(`[registry] Starting ${CONTAINER} on 0.0.0.0:${REGISTRY_DIRECT_PORT} ...`);
    const proc = Bun.spawnSync([
      "docker", "run", "-d", "--restart=always",
      "--name", CONTAINER,
      "-p", `${REGISTRY_DIRECT_PORT}:5000`,
      DOCKER_REGISTRY_IMAGE,
    ], { stdio: ["inherit", "inherit", "inherit"] as const });
    if (proc.exitCode !== 0) {
      throw new Error(`docker run ${CONTAINER} failed (exit ${proc.exitCode})`);
    }
    console.log(`[registry] ${CONTAINER} started.`);
  }

  // 2. Start tracker proxy
  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
    try {
      process.kill(oldPid, 0);
      console.log(`[registry] Tracker already running (pid ${oldPid})`);
      printInfo();
      return;
    } catch {
      unlinkSync(PID_FILE);
    }
  }

  const proc = Bun.spawn(["bun", "src/web/tracker-server.ts"], {
    stdio: ["ignore", "inherit", "inherit"] as const,
    env: { ...process.env },
  });
  writeFileSync(PID_FILE, String(proc.pid));
  console.log(`[registry] Tracker started (pid ${proc.pid})`);
  printInfo();
}

function doStop() {
  // Stop tracker
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
    try {
      process.kill(pid, "SIGTERM");
      console.log(`[registry] Tracker (pid ${pid}) stopped.`);
    } catch {
      console.log(`[registry] Tracker (pid ${pid}) not running.`);
    }
    unlinkSync(PID_FILE);
  } else {
    console.log("[registry] No tracker PID file found.");
  }

  // Stop registry
  const existing = dockerPs(`name=${CONTAINER}`);
  if (existing) {
    console.log(`[registry] Stopping ${CONTAINER} ...`);
    Bun.spawnSync(["docker", "stop", CONTAINER], { stdio: ["inherit", "inherit", "inherit"] as const });
    Bun.spawnSync(["docker", "rm", CONTAINER], { stdio: ["inherit", "inherit", "inherit"] as const });
    console.log(`[registry] ${CONTAINER} stopped and removed.`);
  } else {
    console.log(`[registry] ${CONTAINER} not running.`);
  }
}

function doStatus() {
  const existing = dockerPs(`name=${CONTAINER}`);
  console.log("[registry] Status:");
  console.log(`  Container: ${existing ? `running (${existing.slice(0, 12)})` : "stopped"}`);

  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
    try {
      process.kill(pid, 0);
      console.log(`  Tracker:   running (pid ${pid})`);
    } catch {
      console.log("  Tracker:   stopped (stale PID file)");
    }
  } else {
    console.log("  Tracker:   not running");
  }

  const lanIP = getDevelHostLANIP();
  if (lanIP) {
    console.log(`  Endpoint:  ${lanIP}:${REGISTRY_PORT}`);
  }
}

function printInfo() {
  const lanIP = getDevelHostLANIP();
  if (lanIP) {
    console.log(`\n  Registry:  ${lanIP}:${REGISTRY_PORT}`);
    console.log(`  Tracker:   http://${lanIP}:${REGISTRY_PORT}/tracker`);
  }
}

export async function cmdRegistry(args: string[]) {
  const cmd = args[0];
  switch (cmd) {
    case "start":
      await doStart();
      break;
    case "stop":
      doStop();
      break;
    case "status":
      doStatus();
      break;
    default:
      console.log("Usage: bun run registry <start|stop|status>");
      process.exit(cmd ? 1 : 0);
  }
}
