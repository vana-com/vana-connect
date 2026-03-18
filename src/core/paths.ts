import os from "node:os";
import path from "node:path";

export function getVanaHome(): string {
  return path.join(os.homedir(), ".vana");
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

/** Internal temp path for connector output. Use getSourceResultPath() for storage. */
export function getLastResultPath(): string {
  return path.join(getVanaHome(), "last-result.json");
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
