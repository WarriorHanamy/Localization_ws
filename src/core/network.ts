import { LAN_HOST } from "./config";

/**
 * IPv4 of the dev-host on the USB RNDIS link (reachable from dev-device).
 */
export function getDevelHostUSBIP(): string | null {
  const proc = Bun.spawnSync(["ip", "route", "get", "192.168.55.1"]);
  if (proc.exitCode !== 0) return null;
  const m = proc.stdout.toString().match(/src\s+([\d.]+)/);
  return m?.[1] ?? null;
}

/**
 * All IPv4 addresses of the dev-host on the 192.168.55.0/24 USB subnet.
 *
 * Uses three-tier fallback so the registry TLS certificate always includes
 * the USB-side IP even when the RNDIS link is not yet active:
 *   1. Active route lookup (ip route get 192.168.55.1)
 *   2. Interface scan (ip -4 -o addr show)
 *   3. Hardcoded well-known RNDIS gadget address 192.168.55.100
 *
 * Used by registryIPs() in registry.ts for certificate SAN generation.
 */
export function getAllHostUSBIPs(): string[] {
  const ips: string[] = [];

  // 1. Active route — works when RNDIS link is up
  const routeProc = Bun.spawnSync(["ip", "route", "get", "192.168.55.1"]);
  if (routeProc.exitCode === 0) {
    const m = routeProc.stdout.toString().match(/src\s+([\d.]+)/);
    if (m?.[1]) ips.push(m[1]);
  }

  // 2. Interface scan — works when the interface exists even without a route
  const addrProc = Bun.spawnSync(["ip", "-4", "-o", "addr", "show"]);
  if (addrProc.exitCode === 0) {
    for (const line of addrProc.stdout.toString().split("\n")) {
      const m = line.match(/inet\s+(192\.168\.55\.\d+)/);
      if (m?.[1]) ips.push(m[1]);
    }
  }

  // 3. Well-known RNDIS gadget address (always added as safety net)
  ips.push("192.168.55.100");

  return [...new Set(ips)];
}

/**
 * IPv4 of the dev-host on the fleet LAN.
 *
 * Fleet devices share the Diff* Wi-Fi network, so prefer an active wireless
 * default route over a lower-metric wired route. The explicit environment
 * override remains available for hosts with non-standard interface names.
 */
export function getDevelHostLANIP(): string | null {
  if (LAN_HOST) return LAN_HOST;

  const proc = Bun.spawnSync(["ip", "route", "show", "default"]);
  if (proc.exitCode !== 0) return null;

  const routes = proc.stdout.toString().split("\n").flatMap((line) => {
    const dev = line.match(/\bdev\s+(\S+)/)?.[1];
    const src = line.match(/\bsrc\s+([\d.]+)/)?.[1];
    return dev && src ? [{ dev, src }] : [];
  });
  return routes.find(({ dev }) => /^wl/.test(dev))?.src ?? routes[0]?.src ?? null;
}
