import { $ } from "bun";
import { getRepoRoot } from "../core/workspace";
import { RELEASE_CONFIGS } from "../core/config";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { cmdFleetBundle } from "./fleet-bundle";
import * as readline from "readline";

const VALID_CONFIG_RE = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*){2,}$/;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function copyBringupToRelease(repo: string, config: string) {
  const src = join(repo, "bringup");
  const dst = join(repo, "releases", config);

  mkdirSync(dst, { recursive: true });

  const subs = [
    { b: "launch",   r: "launch" },
    { b: "config",   r: "config" },
    { b: "scripts",  r: "scripts" },
    { b: "rviz_cfg", r: "rviz" },
    { b: "PCD",      r: "PCD" },
  ];

  for (const { b, r } of subs) {
    const s = join(src, b);
    if (existsSync(s)) {
      const d = join(dst, r);
      mkdirSync(d, { recursive: true });
      Bun.spawnSync(["cp", "-r", `${s}/.`, d]);
    }
  }

  console.log(`[release] releases/${config}/ ← bringup/`);
}

async function promptConfigFromUser(): Promise<string> {
  const platform = await ask("[release] platform: ");
  if (!platform) {
    console.error("[release] platform cannot be empty.");
    process.exit(1);
  }
  const lidar = await ask("[release] lidar:    ");
  if (!lidar) {
    console.error("[release] lidar cannot be empty.");
    process.exit(1);
  }
  const imu = await ask("[release] imu src:  ");
  if (!imu) {
    console.error("[release] imu src cannot be empty.");
    process.exit(1);
  }
  const name = `${platform}-${lidar}-${imu}`;
  console.log(`[release] config: ${name}`);
  if (!VALID_CONFIG_RE.test(name)) {
    console.error(`[release] Invalid config name: "${name}"`);
    console.error("  Must match {platform}-{lidar}-{imu_src}");
    console.error("  lowercase alphanumeric, hyphen-separated, >=3 segments.");
    process.exit(1);
  }
  const proceed = await ask("Proceed? [Y/n] ");
  if (proceed.toLowerCase() === "n" || proceed.toLowerCase() === "no") {
    console.log("[release] Aborted.");
    process.exit(0);
  }
  return name;
}

export async function cmdRelease(config?: string) {
  if (!config) {
    config = await promptConfigFromUser();
  } else {
    const known = (RELEASE_CONFIGS as readonly string[]).includes(config);
    if (!known) {
      console.log(`[release] "${config}" is not a known release config.`);
      const answer = await ask("Create new release config? [y/N] ");
      if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
        console.log("[release] Aborted.");
        process.exit(0);
      }

      if (!VALID_CONFIG_RE.test(config)) {
        console.error(`[release] Invalid config name: "${config}"`);
        console.error(`  Must match {platform}-{lidar}-{imu_source}`);
        console.error("  lowercase alphanumeric, hyphen-separated, >=3 segments.");
        process.exit(1);
      }
    }
  }

  const repo = getRepoRoot();
  const dst = join(repo, "releases", config);
  if (existsSync(dst)) {
    const answer = await ask(`Overwrite existing releases/${config}/? [y/N] `);
    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
      console.log("[release] Aborted.");
      process.exit(0);
    }
    await $`rm -rf ${dst}`;
  }
  copyBringupToRelease(repo, config);

  console.log(`[release] Chaining: fleet-bundle ${config} ...`);
  await cmdFleetBundle(config);

  console.log(`[release] Complete: releases/${config}/ packaged.`);
}
