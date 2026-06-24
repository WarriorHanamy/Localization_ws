import { LAN_HOST } from "./config";

/**
 * IPv4 of the devel-host on the USB RNDIS link (reachable from golden Jetson).
 */
export function getDevelHostUSBIP(): string | null {
  const proc = Bun.spawnSync(["ip", "route", "get", "192.168.55.1"]);
  if (proc.exitCode !== 0) return null;
  const m = proc.stdout.toString().match(/src\s+([\d.]+)/);
  return m?.[1] ?? null;
}

/**
 * IPv4 of the devel-host on the fleet LAN.
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
