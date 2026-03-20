import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { getVanaHome } from "../core/paths.js";
import type { CliInstallMethod } from "../core/cli-types.js";

export interface UpdateCheckCache {
  lastCheckedAt: string;
  latestVersion: string;
  currentVersion: string;
}

const UPDATE_CHECK_FILE = "update-check.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getUpdateCheckPath(): string {
  return path.join(getVanaHome(), UPDATE_CHECK_FILE);
}

/**
 * Read cached update check result. Returns null if missing or expired.
 */
export async function readUpdateCheck(
  maxAgeMs = MAX_AGE_MS,
): Promise<UpdateCheckCache | null> {
  try {
    const raw = await fs.readFile(getUpdateCheckPath(), "utf8");
    const cache = JSON.parse(raw) as UpdateCheckCache;
    const age = Date.now() - new Date(cache.lastCheckedAt).getTime();
    if (age > maxAgeMs || Number.isNaN(age)) return null;
    return cache;
  } catch {
    return null;
  }
}

/**
 * Spawn a detached background process to check for the latest CLI version
 * and write the result to the cache file.
 */
export function spawnUpdateCheck(
  currentVersion: string,
  installMethod: CliInstallMethod,
): void {
  const workerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "update-check-worker.js",
  );
  const child = spawn(
    process.execPath,
    [workerPath, currentVersion, installMethod],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
}

/**
 * Simple semver comparison: returns true if `latest` is newer than `current`.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, "").split(".").map(Number);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}
