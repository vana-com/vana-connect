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

export interface IngestResultOptions {
  scopes?: string[];
}

async function detectTargetAt(
  url: string,
  source: PersonalServerTarget["source"],
): Promise<PersonalServerTarget | null> {
  const health = await fetchHealth(url);
  if (!health) {
    return null;
  }

  return {
    state: "available",
    url,
    source,
    health,
  };
}

export async function detectPersonalServerTarget(): Promise<PersonalServerTarget> {
  // 1. Persisted config (highest priority)
  const config = await readCliConfig();
  if (config.personalServerUrl) {
    const target = await detectTargetAt(config.personalServerUrl, "config");
    if (target) {
      return target;
    }
  }

  // 2. Auth credentials (from `vana login`)
  const authCreds = loadCredentials();
  if (authCreds?.personal_server?.url) {
    const target = await detectTargetAt(authCreds.personal_server.url, "auth");
    if (target) {
      return target;
    }
  }

  // 3. Environment variable
  const explicitUrl = process.env.VANA_PERSONAL_SERVER_URL;
  if (explicitUrl) {
    const target = await detectTargetAt(explicitUrl, "env");
    if (target) {
      return target;
    }
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
  options?: IngestResultOptions,
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
  const selectedScopes = options?.scopes ? new Set(options.scopes) : null;
  const scopeMappings = resolveScopes(source, result, metadata).filter(
    (mapping) => !selectedScopes || selectedScopes.has(mapping.scope),
  );

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
  const psToken = process.env.VANA_PS_TOKEN;
  if (psToken) {
    return { type: "bearerToken", token: psToken };
  }

  const creds = loadCredentials();
  if (
    creds?.personal_server?.session_token &&
    urlsMatch(creds.personal_server.url, serverUrl)
  ) {
    return { type: "bearerToken", token: creds.personal_server.session_token };
  }

  return undefined;
}

function urlsMatch(left: string, right: string): boolean {
  return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
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
