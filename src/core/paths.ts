import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function getVanaHome(): string {
  return path.join(os.homedir(), ".vana");
}

/**
 * Ensure ~/.vana and ~/.dataconnect both resolve to the same directory.
 *
 * Cases:
 * 1. ~/.dataconnect exists, ~/.vana doesn't → rename + symlink old path
 * 2. ~/.vana exists, ~/.dataconnect doesn't → create symlink at old path
 * 3. Both exist (no symlink) → leave as-is (user manages manually)
 *
 * The symlink at ~/.dataconnect ensures vana-com/data-connect (DataConnect
 * desktop app) keeps working. DataConnect hardcodes ~/.dataconnect in
 * src-tauri/src/commands/connector.rs:66. It should adopt ~/.vana upstream.
 *
 * Returns true if any migration or symlink was performed.
 */
export function migrateLegacyDataHome(): boolean {
  const vanaHome = getVanaHome();
  const oldHome = path.join(os.homedir(), ".dataconnect");

  // Case 1: old exists, new doesn't → migrate
  if (!fs.existsSync(vanaHome) && fs.existsSync(oldHome)) {
    try {
      fs.renameSync(oldHome, vanaHome);
      fs.symlinkSync(vanaHome, oldHome);
      return true;
    } catch {
      return false;
    }
  }

  // Case 2: new exists, old doesn't → create compat symlink
  // so DataConnect (which hardcodes ~/.dataconnect) finds the data
  if (fs.existsSync(vanaHome) && !fs.existsSync(oldHome)) {
    try {
      fs.symlinkSync(vanaHome, oldHome);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function getConnectorCacheDir(): string {
  return path.join(getVanaHome(), "connectors");
}

export function getBrowserProfilesDir(): string {
  return path.join(getVanaHome(), "browser-profiles");
}

export function getCliStatePath(): string {
  return path.join(getVanaHome(), "vana-connect-state.json");
}

export function getResultsDir(): string {
  return path.join(getVanaHome(), "results");
}

export function getSourceResultPath(source: string): string {
  const safe = source.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return path.join(getResultsDir(), `${safe}.json`);
}

export function getPreviousResultPath(source: string): string {
  const safe = source.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return path.join(getResultsDir(), `${safe}.previous.json`);
}

/** Rotate current result to .previous before overwriting. */
export async function rotateResult(source: string): Promise<void> {
  const current = getSourceResultPath(source);
  const previous = getPreviousResultPath(source);
  try {
    await fs.promises.rename(current, previous);
  } catch {
    // No existing result to rotate — that's fine
  }
}

export function getSessionsDir(): string {
  return path.join(getVanaHome(), "sessions");
}

export function getLogsDir(): string {
  return path.join(getVanaHome(), "logs");
}

export function getTimestampedLogPath(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return path.join(
    getLogsDir(),
    `${safePrefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
  );
}
