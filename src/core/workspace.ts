import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export function getRepoRoot(): string {
  return resolve(currentDir, "..", "..");
}
