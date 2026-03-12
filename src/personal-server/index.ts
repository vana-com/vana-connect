import fs from "node:fs/promises";

import type { CliEvent, PersonalServerState } from "../core/cli-types.js";

const DEFAULT_PORTS = [8080, 8081, 8082, 8083, 8084, 8085];

export interface PersonalServerTarget {
  state: PersonalServerState;
  url: string | null;
}

export async function detectPersonalServerTarget(): Promise<PersonalServerTarget> {
  const explicitUrl = process.env.VANA_PERSONAL_SERVER_URL;
  if (explicitUrl) {
    return (await canReachPersonalServer(explicitUrl))
      ? { state: "available", url: explicitUrl }
      : { state: "unavailable", url: explicitUrl };
  }

  for (const port of DEFAULT_PORTS) {
    const url = `http://localhost:${port}`;
    if (await canReachPersonalServer(url)) {
      return { state: "available", url };
    }
  }

  return { state: "unavailable", url: null };
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

async function canReachPersonalServer(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}
