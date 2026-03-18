import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { getCliStatePath, getVanaHome } from "./paths.js";

const STATE_LOCK_TIMEOUT_MS = 5_000;
const STATE_LOCK_RETRY_MS = 25;
const STATE_LOCK_STALE_MS = 30_000;

let testHooks:
  | {
      beforeRead?: () => Promise<void> | void;
      beforeWrite?: () => Promise<void> | void;
    }
  | undefined;

export interface StoredSourceState {
  connectorInstalled?: boolean;
  connectorVersion?: string;
  exportFrequency?: string;
  sessionPresent?: boolean;
  lastRunAt?: string | null;
  lastRunOutcome?: string | null;
  lastCollectedAt?: string;
  dataState?: string | null;
  lastError?: string | null;
  lastResultPath?: string | null;
  lastLogPath?: string | null;
  ingestScopes?: Array<{
    scope: string;
    status: "stored" | "failed";
    syncedAt?: string;
    error?: string;
  }>;
}

export interface CliConfig {
  personalServerUrl?: string;
}

export interface CliStateFile {
  version: 1;
  config?: CliConfig;
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
  await fs.mkdir(getVanaHome(), { recursive: true });
  await withStateFileLock(async () => {
    await testHooks?.beforeRead?.();
    const state = await readCliState();
    const current = state.sources[source] ?? {};
    state.sources[source] = { ...current, ...patch };
    await testHooks?.beforeWrite?.();
    await atomicWriteFile(
      getCliStatePath(),
      `${JSON.stringify(state, null, 2)}\n`,
    );
  });
}

export async function readCliConfig(): Promise<CliConfig> {
  const state = await readCliState();
  return state.config ?? {};
}

export async function updateCliConfig(
  patch: Partial<CliConfig>,
): Promise<void> {
  await fs.mkdir(getVanaHome(), { recursive: true });
  await withStateFileLock(async () => {
    await testHooks?.beforeRead?.();
    const state = await readCliState();
    state.config = { ...(state.config ?? {}), ...patch };
    await testHooks?.beforeWrite?.();
    await atomicWriteFile(
      getCliStatePath(),
      `${JSON.stringify(state, null, 2)}\n`,
    );
  });
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function __setStateStoreTestHooks(
  hooks:
    | {
        beforeRead?: () => Promise<void> | void;
        beforeWrite?: () => Promise<void> | void;
      }
    | undefined,
): void {
  testHooks = hooks;
}

async function withStateFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockPath = `${getCliStatePath()}.lock`;
  const start = Date.now();

  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        return await fn();
      } finally {
        await handle.close();
        await fs.rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!isLockAlreadyHeld(error)) {
        throw error;
      }

      if (await isStaleLock(lockPath)) {
        await fs.rm(lockPath, { force: true });
        continue;
      }

      if (Date.now() - start >= STATE_LOCK_TIMEOUT_MS) {
        throw new Error(
          "Timed out waiting for the Vana Connect state file lock.",
        );
      }

      await sleep(STATE_LOCK_RETRY_MS);
    }
  }
}

async function atomicWriteFile(
  filePath: string,
  contents: string,
): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(lockPath);
    return Date.now() - stats.mtimeMs > STATE_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

function isLockAlreadyHeld(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
