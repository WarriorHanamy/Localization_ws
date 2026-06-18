import { $ } from "bun";
import {
  REMOTE_HOST_USB,
  REMOTE_USER,
  SSH_OPTS,
  RSYNC_EXCLUDES,
} from "./config";

const SSHPASS_EXE = process.env.SSHPASS || "";

function prefix(): string[] {
  return SSHPASS_EXE ? ["sshpass", "-e"] : [];
}

export function sshTarget(): string {
  return `${REMOTE_USER}@${REMOTE_HOST_USB}`;
}

export async function runSSH(
  remoteCmd: string,
  check = true,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const target = sshTarget();
  const opts = SSH_OPTS;
  const wrapped = `bash -c ${$.escape(remoteCmd)}`;
  const cmd = [...prefix(), "ssh", ...opts.split(/\s+/), target, wrapped];
  const proc = Bun.spawnSync(cmd, {
    env: { ...process.env },
  });
  const result = {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
  };
  if (check && result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
  return result;
}

export async function runSSHDetached(remoteCmd: string): Promise<number> {
  const target = sshTarget();
  const opts = SSH_OPTS;
  const wrapped = `nohup bash -c ${$.escape(remoteCmd)} > /dev/null 2>&1 &`;
  const cmd = [...prefix(), "ssh", ...opts.split(/\s+/), target, wrapped];
  const proc = Bun.spawnSync(cmd, {
    env: { ...process.env },
  });
  return proc.exitCode;
}

export async function runRSync(
  src: string,
  dst: string,
  extraExcludes?: string[],
  check = true,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const target = sshTarget();
  const rsh = `--rsh=ssh ${SSH_OPTS}`;
  const cmd: string[] = [
    ...prefix(),
    "rsync",
    "-avz",
    "--delete",
    "--partial",
    "--timeout=60",
    `${rsh}`,
  ];
  for (const exc of RSYNC_EXCLUDES) {
    cmd.push("--exclude", exc);
  }
  if (extraExcludes) {
    for (const exc of extraExcludes) {
      cmd.push("--exclude", exc);
    }
  }
  cmd.push(src, dst);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const proc = Bun.spawnSync(cmd, { env: { ...process.env } });
    if (proc.exitCode === 0) {
      return {
        stdout: proc.stdout.toString(),
        stderr: proc.stderr.toString(),
        exitCode: proc.exitCode,
      };
    }
    if (attempt < maxAttempts) {
      console.log(`[l10n] rsync failed (attempt ${attempt}), retrying in 3s ...`);
      await Bun.sleep(3000);
    } else {
      if (check) process.exit(proc.exitCode);
      return {
        stdout: proc.stdout.toString(),
        stderr: proc.stderr.toString(),
        exitCode: proc.exitCode,
      };
    }
  }
  throw new Error("unreachable");
}

export async function isUSBReachable(): Promise<boolean> {
  const proc = Bun.spawnSync(["ping", "-c1", "-W1", REMOTE_HOST_USB], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return proc.exitCode === 0;
}

export async function checkSSH(): Promise<boolean> {
  const result = await runSSH("echo SSH_OK", false);
  return result.exitCode === 0;
}
