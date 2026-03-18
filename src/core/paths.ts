import os from "node:os";
import path from "node:path";

export function getDataConnectHome(): string {
  return path.join(os.homedir(), ".dataconnect");
}

export function getConnectorCacheDir(): string {
  return path.join(getDataConnectHome(), "connectors");
}

export function getBrowserProfilesDir(): string {
  return path.join(getDataConnectHome(), "browser-profiles");
}

export function getCliStatePath(): string {
  return path.join(getDataConnectHome(), "vana-connect-state.json");
}

export function getResultsDir(): string {
  return path.join(getDataConnectHome(), "results");
}

export function getSourceResultPath(source: string): string {
  const safe = source.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return path.join(getResultsDir(), `${safe}.json`);
}

/** Internal temp path for connector output. Use getSourceResultPath() for storage. */
export function getLastResultPath(): string {
  return path.join(getDataConnectHome(), "last-result.json");
}

export function getLogsDir(): string {
  return path.join(getDataConnectHome(), "logs");
}

export function getTimestampedLogPath(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return path.join(
    getLogsDir(),
    `${safePrefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
  );
}
