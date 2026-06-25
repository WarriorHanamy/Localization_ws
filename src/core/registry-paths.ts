import { join } from "path";
import { getRepoRoot } from "./workspace";

export const REGISTRY_STATE_DIR = join(getRepoRoot(), "logs", "registry");
export const REGISTRY_CERT_DIR = join(REGISTRY_STATE_DIR, "certs");
export const REGISTRY_CERT = join(REGISTRY_CERT_DIR, "domain.crt");
export const REGISTRY_KEY = join(REGISTRY_CERT_DIR, "domain.key");
export const REGISTRY_CONFIG = join(REGISTRY_STATE_DIR, "config.yml");
