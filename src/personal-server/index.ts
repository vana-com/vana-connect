import fs from "node:fs/promises";

import type { CliEvent, PersonalServerState } from "../core/cli-types.js";
import { readCliConfig } from "../core/state-store.js";
import { resolveScopes } from "./scope-resolver.js";
import { createPersonalServerClient } from "./client.js";
import { readCachedConnectorMetadata } from "../connectors/registry.js";
import { getConnectorCacheDir } from "../core/paths.js";
import { loadCredentials } from "../cli/auth.js";

export { createPersonalServerClient } from "./client.js";
export type {
  PersonalServerClient,
  IngestScopeResult,
  ScopeSummary,
} from "./client.js";

const DEFAULT_PORTS = [8080, 8081, 8082, 8083, 8084, 8085];

export interface PersonalServerHealth {
  status: string;
  version: string;
  uptime: number;
  owner: string | null;
}

export interface PersonalServerTarget {
  state: PersonalServerState;
  url: string | null;
  source: "config" | "auth" | "env" | "scan" | null;
  health: PersonalServerHealth | null;
}

export type PersonalServerAuthConfig =
  | { type: "bearerToken"; token: string }
  | { type: "none" }
  | undefined;

export async function detectPersonalServerTarget(): Promise<PersonalServerTarget> {
  // 1. Persisted config (highest priority)
  const config = await readCliConfig();
  if (config.personalServerUrl) {
    const health = await fetchHealth(config.personalServerUrl);
    return {
      state: health ? "available" : "unavailable",
      url: config.personalServerUrl,
      source: "config",
      health,
    };
  }

  // 2. Auth credentials (from `vana login`)
  const authCreds = loadCredentials();
  if (authCreds?.personal_server?.url) {
    const health = await fetchHealth(authCreds.personal_server.url);
    return {
      state: health ? "available" : "unavailable",
      url: authCreds.personal_server.url,
      source: "auth",
      health,
    };
  }

  // 3. Environment variable
  const explicitUrl = process.env.VANA_PERSONAL_SERVER_URL;
  if (explicitUrl) {
    const health = await fetchHealth(explicitUrl);
    return {
      state: health ? "available" : "unavailable",
      url: explicitUrl,
      source: "env",
      health,
    };
  }

  // 3. Localhost port scan
  for (const port of DEFAULT_PORTS) {
    const url = `http://localhost:${port}`;
    const health = await fetchHealth(url);
    if (health) {
      return { state: "available", url, source: "scan", health };
    }
  }

  return { state: "unavailable", url: null, source: null, health: null };
}

export async function ingestResult(
  source: string,
  resultPath: string,
  target: PersonalServerTarget,
): Promise<CliEvent[]> {
  if (target.state !== "available" || !target.url) {
    return [
      {
        type: "ingest-skipped",
        source,
        reason: "personal_server_unavailable",
      },
    ];
  }

  const raw = await fs.readFile(resultPath, "utf8");
  const result = JSON.parse(raw) as Record<string, unknown>;
  const metadata = await readCachedConnectorMetadata(
    source,
    getConnectorCacheDir(),
  );
  const scopeMappings = resolveScopes(source, result, metadata);

  if (scopeMappings.length === 0) {
    return [
      {
        type: "ingest-skipped",
        source,
        reason: "no_scopes_resolved",
      },
    ];
  }

  const client = createPersonalServerClient({
    url: target.url,
    auth: resolvePersonalServerAuthConfig(target.url),
  });
  const events: CliEvent[] = [
    { type: "ingest-started", source, target: target.url },
  ];
  const scopeResults = [];

  for (const mapping of scopeMappings) {
    const scopeResult = await client.ingestScope(mapping.scope, mapping.data);
    scopeResults.push(scopeResult);
  }

  const allStored = scopeResults.every((r) => r.status === "stored");
  const allFailed = scopeResults.every((r) => r.status === "failed");

  if (allStored) {
    events.push({
      type: "ingest-complete",
      source,
      target: target.url,
      scopeResults,
    });
  } else if (allFailed) {
    events.push({
      type: "ingest-failed",
      source,
      target: target.url,
      message: scopeResults.map((r) => `${r.scope}: ${r.error}`).join("; "),
      scopeResults,
    });
  } else {
    events.push({
      type: "ingest-partial",
      source,
      target: target.url,
      scopeResults,
    });
  }

  return events;
}

export function resolvePersonalServerAuthConfig(
  serverUrl: string,
): PersonalServerAuthConfig {
  const isRemote =
    !serverUrl.includes("localhost") && !serverUrl.includes("127.0.0.1");
  if (!isRemote) {
    return undefined;
  }

  const psToken = process.env.VANA_PS_TOKEN;
  if (psToken) {
    return { type: "bearerToken", token: psToken };
  }

  const creds = loadCredentials();
  if (creds?.personal_server?.session_token) {
    return { type: "bearerToken", token: creds.personal_server.session_token };
  }

  return undefined;
}

async function fetchHealth(
  baseUrl: string,
): Promise<PersonalServerHealth | null> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return {
      status: typeof body.status === "string" ? body.status : "unknown",
      version: typeof body.version === "string" ? body.version : "unknown",
      uptime: typeof body.uptime === "number" ? body.uptime : 0,
      owner: typeof body.owner === "string" ? body.owner : null,
    };
  } catch {
    return null;
  }
}
