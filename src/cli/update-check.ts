import fs from "node:fs/promises";
import path from "node:path";

import { getVanaHome } from "../core/paths.js";
import type { CliInstallMethod } from "../core/cli-types.js";

export interface UpdateCheckCache {
  lastCheckedAt: string;
  latestVersion: string;
  currentVersion: string;
}

const UPDATE_CHECK_FILE = "update-check.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CHECK_TIMEOUT_MS = 5_000;

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
 * Check for the latest CLI version and write the result to the cache file.
 * Runs inline with a short timeout — no child process needed.
 */
export async function checkForUpdate(
  currentVersion: string,
  installMethod: CliInstallMethod,
): Promise<void> {
  let latestVersion: string | null = null;

  switch (installMethod) {
    case "homebrew": {
      const res = await fetch(
        "https://formulae.brew.sh/api/formula/vana.json",
        { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) },
      );
      if (res.ok) {
        const data = (await res.json()) as { versions?: { stable?: string } };
        latestVersion = data.versions?.stable ?? null;
      }
      break;
    }
    case "installer": {
      const res = await fetch(
        "https://api.github.com/repos/vana-com/vana-connect/releases/latest",
        {
          headers: { "User-Agent": "@opendatalabs/connect" },
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { tag_name?: string };
        latestVersion = data.tag_name?.replace(/^v/, "") ?? null;
      }
      break;
    }
    default: {
      const res = await fetch(
        "https://registry.npmjs.org/@opendatalabs/connect/latest",
        { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) },
      );
      if (res.ok) {
        const data = (await res.json()) as { version?: string };
        latestVersion = data.version ?? null;
      }
    }
  }

  if (latestVersion) {
    const cachePath = getUpdateCheckPath();
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const cache = {
      lastCheckedAt: new Date().toISOString(),
      latestVersion,
      currentVersion,
    };
    await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  }
}

/**
 * Simple semver comparison: returns true if `latest` is newer than `current`.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, "").split("-")[0].split("+")[0].split(".").map(Number);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}
