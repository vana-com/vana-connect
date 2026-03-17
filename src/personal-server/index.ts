import fs from "node:fs/promises";

import type { CliEvent, PersonalServerState } from "../core/cli-types.js";
import { readCliConfig } from "../core/state-store.js";

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
  source: "config" | "env" | "scan" | null;
  health: PersonalServerHealth | null;
}

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

  // 2. Environment variable
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
  const scopes = Object.keys(result).filter(
    (key) =>
      key.includes(".") &&
      !["exportSummary", "timestamp", "version", "platform"].includes(key),
  );

  const events: CliEvent[] = [
    {
      type: "ingest-started",
      source,
      target: target.url,
    },
  ];

  try {
    for (const scope of scopes) {
      const response = await fetch(`${target.url}/v1/data/${scope}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result[scope]),
      });
      if (!response.ok) {
        throw new Error(`Ingest failed for ${scope}: ${response.status}`);
      }
    }

    events.push({
      type: "ingest-complete",
      source,
      target: target.url,
    });
    return events;
  } catch (error) {
    events.push({
      type: "ingest-failed",
      source,
      target: target.url,
      message: error instanceof Error ? error.message : "Ingest failed.",
    });
    return events;
  }
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
