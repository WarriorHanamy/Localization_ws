import {
  DOCKER_IMAGES,
  REGISTRY_PORT,
  REGISTRY_INTERNAL_PORT,
  TRACKER_LOG,
  MAX_TRACKER_ENTRIES,
} from "../core/config";
import { getDevelHostLANIP } from "../core/network";
import { getRepoRoot } from "../core/workspace";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const LOG_FILE = join(getRepoRoot(), TRACKER_LOG);
const HTML_FILE = join(dirname(fileURLToPath(import.meta.url)), "tracker.html");
const UPSTREAM = `https://127.0.0.1:${REGISTRY_INTERNAL_PORT}`;
const UPSTREAM_HOST = `127.0.0.1:${REGISTRY_INTERNAL_PORT}`;
const REGISTRY_CONTAINER = "loc-registry";

interface PullEntry {
  timestamp: string;
  ip: string;
  method: string;
  path: string;
}

let pullLog: PullEntry[] = [];
let trackerHtml = "";

function loadLog() {
  if (existsSync(LOG_FILE)) {
    try {
      pullLog = JSON.parse(readFileSync(LOG_FILE, "utf-8"));
    } catch { /* corrupt log file, start fresh */ }
  }
}

function saveLog() {
  mkdirSync(join(getRepoRoot(), "logs"), { recursive: true });
  writeFileSync(LOG_FILE, JSON.stringify(pullLog, null, 2));
}

function addEntry(entry: PullEntry) {
  pullLog.push(entry);
  if (pullLog.length > MAX_TRACKER_ENTRIES) {
    pullLog = pullLog.slice(-MAX_TRACKER_ENTRIES);
  }
  saveLog();
}

function isLoggable(method: string, path: string): boolean {
  // Log GET/HEAD manifest and tag-list requests = pull events
  if (method !== "GET" && method !== "HEAD") return false;
  if (/^\/v2\/.+\/manifests\//.test(path)) return true;
  if (/^\/v2\/.+\/tags\/list/.test(path)) return true;
  return false;
}

function loadHtml() {
  if (existsSync(HTML_FILE)) {
    trackerHtml = readFileSync(HTML_FILE, "utf-8");
  } else {
    trackerHtml = "<h1>tracker.html not found</h1>";
  }
}

function dockerContainerStatus() {
  const proc = Bun.spawnSync([
    "docker", "ps",
    "--filter", `name=${REGISTRY_CONTAINER}`,
    "--format", "{{.ID}} {{.Status}}",
  ]);
  const text = proc.stdout.toString().trim();
  if (proc.exitCode !== 0) {
    return { ok: false, detail: "docker unavailable" };
  }
  if (!text) {
    return { ok: false, detail: "container stopped" };
  }
  return { ok: true, detail: text };
}

async function registryStatus() {
  const lanIP = getDevelHostLANIP();
  const container = dockerContainerStatus();
  const status = {
    timestamp: new Date().toISOString(),
    endpoints: {
      fleet: lanIP ? `http://${lanIP}:${REGISTRY_PORT}` : null,
      tracker: lanIP ? `http://${lanIP}:${REGISTRY_PORT}/tracker` : null,
      registry: lanIP ? `https://${lanIP}:${REGISTRY_INTERNAL_PORT}` : null,
    },
    images: DOCKER_IMAGES,
    components: {
      tracker: { ok: true, detail: `listening on :${REGISTRY_PORT}` },
      registryContainer: container,
      upstream: { ok: false, detail: "" },
      images: { ok: false, detail: "" },
    },
  };

  try {
    const res = await fetch(`${UPSTREAM}/v2/`);
    status.components.upstream = {
      ok: res.ok,
      detail: res.ok ? `HTTP ${res.status}` : `HTTP ${res.status}`,
    };
  } catch (err) {
    status.components.upstream = {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const results = await Promise.all(DOCKER_IMAGES.map(async ({ image }) => {
      const name = image.split(":")[0];
      const tag = image.split(":")[1] || "latest";
      const res = await fetch(`${UPSTREAM}/v2/${name}/tags/list`);
      if (!res.ok) return { image, ok: false, detail: `HTTP ${res.status}` };
      const body = await res.json() as { tags?: string[] };
      const tags = body.tags || [];
      return { image, ok: tags.includes(tag), detail: tags.length ? tags.join(", ") : "no tags" };
    }));
    status.components.images = {
      ok: results.every((result) => result.ok),
      detail: results.map((result) => `${result.ok ? "OK" : "missing"} ${result.image}`).join("; "),
    };
  } catch (err) {
    status.components.images = {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  return status;
}

async function main() {
  loadLog();
  loadHtml();

  const server = Bun.serve({
    port: REGISTRY_PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
          },
        });
      }

      // Tracker HTML
      if (path === "/tracker") {
        return new Response(trackerHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // API
      if (path === "/api/pulls") {
        return Response.json(pullLog);
      }

      if (path === "/api/status") {
        return Response.json(await registryStatus());
      }

      // Proxy to registry
      if (path.startsWith("/v2/")) {
        if (isLoggable(req.method, path)) {
          const ip = server.requestIP(req)?.address || "unknown";
          addEntry({
            timestamp: new Date().toISOString(),
            ip,
            method: req.method,
            path,
          });
        }

        try {
          const upstreamUrl = `${UPSTREAM}${path}${url.search}`;
          const headers = new Headers(req.headers);
          // Preserve original Host so the registry generates correct Location URLs

          const body = (req.method !== "GET" && req.method !== "HEAD" && req.body !== null)
            ? req.body
            : undefined;

          const upstreamRes = await fetch(upstreamUrl, {
            method: req.method,
            headers,
            body,
            ...(body ? { duplex: "half" } : {}),
          });

          const resHeaders = new Headers(upstreamRes.headers);
          resHeaders.set("Access-Control-Allow-Origin", "*");

          // Rewrite Location header: registry returns URLs pointing to its internal
          // address, but clients must talk through the proxy
          const loc = resHeaders.get("location");
          if (loc && loc.includes(UPSTREAM_HOST)) {
            resHeaders.set("location", loc.replace(UPSTREAM_HOST, req.headers.get("host") || "localhost:5000"));
          }

          return new Response(upstreamRes.body, {
            status: upstreamRes.status,
            statusText: upstreamRes.statusText,
            headers: resHeaders,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`[tracker] proxy error: ${msg}\n`);
          return new Response(`Proxy error: ${msg}`, { status: 502 });
        }
      }

      // Root redirect to tracker
      if (path === "/") {
        return Response.redirect("/tracker", 302);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`[tracker] Proxy on :${REGISTRY_PORT} → ${UPSTREAM}`);
  console.log(`[tracker] Tracker at /tracker`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[tracker] Shutting down ...");
    server.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server.stop();
    process.exit(0);
  });
}

main();
