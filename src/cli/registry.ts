import { $ } from "bun";
import {
  REGISTRY_PORT,
  REGISTRY_DIRECT_PORT,
  DOCKER_REGISTRY_IMAGE,
} from "../core/config";
import { getRepoRoot } from "../core/workspace";
import { getDevelHostLANIP, getDevelHostUSBIP } from "../core/network";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import {
  REGISTRY_CERT_DIR,
  REGISTRY_CERT,
  REGISTRY_KEY,
  REGISTRY_CONFIG,
} from "../core/registry-paths";

const CONTAINER = "loc-registry";
const PID_FILE = join(getRepoRoot(), "logs", "tracker.pid");
const DATA_VOLUME = `${CONTAINER}-data`;

function dockerPs(filter: string): string {
  const proc = Bun.spawnSync(["docker", "ps", "-q", "--filter", filter]);
  return proc.stdout.toString().trim();
}

function dockerCertMount(): string {
  const proc = Bun.spawnSync([
    "docker", "inspect", CONTAINER,
    "--format", "{{range .Mounts}}{{if eq .Destination \"/certs\"}}{{.Source}}{{end}}{{end}}",
  ]);
  return proc.exitCode === 0 ? proc.stdout.toString().trim() : "";
}

function registryIPs(): string[] {
  return [...new Set(["127.0.0.1", getDevelHostLANIP(), getDevelHostUSBIP()].filter(Boolean) as string[])];
}

function certCovers(ips: string[]): boolean {
  if (!existsSync(REGISTRY_CERT) || !existsSync(REGISTRY_KEY)) return false;
  const proc = Bun.spawnSync(["openssl", "x509", "-in", REGISTRY_CERT, "-noout", "-ext", "subjectAltName"]);
  if (proc.exitCode !== 0) return false;
  const text = proc.stdout.toString();
  return ips.every((ip) => text.includes(`IP Address:${ip}`));
}

function writeRegistryConfig() {
  mkdirSync(REGISTRY_CERT_DIR, { recursive: true });
  writeFileSync(REGISTRY_CONFIG, [
    "version: 0.1",
    "log:",
    "  fields:",
    "    service: registry",
    "storage:",
    "  filesystem:",
    "    rootdirectory: /var/lib/registry",
    "  delete:",
    "    enabled: true",
    "http:",
    "  addr: 0.0.0.0:5000",
    "  tls:",
    "    certificate: /certs/domain.crt",
    "    key: /certs/domain.key",
    "health:",
    "  storagedriver:",
    "    enabled: true",
    "    interval: 10s",
    "    threshold: 3",
    "",
  ].join("\n"));
}

function ensureRegistryFiles(): boolean {
  const ips = registryIPs();
  writeRegistryConfig();
  if (certCovers(ips)) return false;

  const san = ips.map((ip) => `IP:${ip}`).join(",");
  const proc = Bun.spawnSync([
    "openssl", "req",
    "-x509", "-newkey", "rsa:4096", "-sha256", "-days", "3650", "-nodes",
    "-keyout", REGISTRY_KEY,
    "-out", REGISTRY_CERT,
    "-subj", `/CN=${ips[0]}`,
    "-addext", `subjectAltName=${san}`,
  ], { stdio: ["ignore", "inherit", "inherit"] as const });
  if (proc.exitCode !== 0) {
    throw new Error(`failed to generate registry certificate (exit ${proc.exitCode})`);
  }
  chmodSync(REGISTRY_CERT, 0o644);
  chmodSync(REGISTRY_KEY, 0o600);
  return true;
}

async function doStart() {
  const certChanged = ensureRegistryFiles();

  // 1. Start registry:2
  let existing = dockerPs(`name=${CONTAINER}`);
  if (existing && (certChanged || dockerCertMount() !== REGISTRY_CERT_DIR)) {
    console.log(`[registry] Restarting ${CONTAINER} to apply registry TLS/config state ...`);
    Bun.spawnSync(["docker", "stop", CONTAINER], { stdio: ["inherit", "inherit", "inherit"] as const });
    Bun.spawnSync(["docker", "rm", CONTAINER], { stdio: ["inherit", "inherit", "inherit"] as const });
    existing = "";
  }
  if (existing) {
    console.log(`[registry] ${CONTAINER} already running (${existing.slice(0, 12)})`);
  } else {
    console.log(`[registry] Starting ${CONTAINER} on 0.0.0.0:${REGISTRY_DIRECT_PORT} ...`);
    // Ensure data volume exists
    const volCheck = Bun.spawnSync(["docker", "volume", "inspect", DATA_VOLUME]);
    if (volCheck.exitCode !== 0) {
      const volCreated = Bun.spawnSync(["docker", "volume", "create", DATA_VOLUME]);
      if (volCreated.exitCode !== 0) {
        throw new Error(`Failed to create volume ${DATA_VOLUME}`);
      }
    }
    const proc = Bun.spawnSync([
      "docker", "run", "-d", "--restart=always",
      "--name", CONTAINER,
      "-v", `${DATA_VOLUME}:/var/lib/registry`,
      "-v", `${REGISTRY_CONFIG}:/etc/docker/registry/config.yml:ro`,
      "-v", `${REGISTRY_CERT_DIR}:/certs:ro`,
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
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
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
    console.log(`  Fleet:     http://${lanIP}:${REGISTRY_PORT}`);
    console.log(`  Registry:  https://${lanIP}:${REGISTRY_DIRECT_PORT}`);
  }
}

function printInfo() {
  const lanIP = getDevelHostLANIP();
  if (lanIP) {
    console.log(`\n  Registry:   https://${lanIP}:${REGISTRY_DIRECT_PORT}`);
    console.log(`  Proxy:      http://${lanIP}:${REGISTRY_PORT}`);
    console.log(`  Tracker:    http://${lanIP}:${REGISTRY_PORT}/tracker`);
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
