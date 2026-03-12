import fs from "node:fs/promises";
import path from "node:path";

import { getCliStatePath, getDataConnectHome } from "./paths.js";

export interface StoredSourceState {
  connectorInstalled?: boolean;
  sessionPresent?: boolean;
  lastRunAt?: string | null;
  lastRunOutcome?: string | null;
  dataState?: string | null;
  lastError?: string | null;
}

export interface CliStateFile {
  version: 1;
  sources: Record<string, StoredSourceState>;
}

export async function readCliState(): Promise<CliStateFile> {
  try {
    const raw = await fs.readFile(getCliStatePath(), "utf8");
    return JSON.parse(raw) as CliStateFile;
  } catch {
    return { version: 1, sources: {} };
  }
}

export async function updateSourceState(
  source: string,
  patch: StoredSourceState,
): Promise<void> {
  const state = await readCliState();
  const current = state.sources[source] ?? {};
  state.sources[source] = { ...current, ...patch };

  await fs.mkdir(getDataConnectHome(), { recursive: true });
  await fs.writeFile(
    getCliStatePath(),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}
