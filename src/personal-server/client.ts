import type { PersonalServerHealth } from "./index.js";

export interface IngestScopeResult {
  scope: string;
  status: "stored" | "failed";
  collectedAt?: string;
  error?: string;
}

export interface ScopeSummary {
  scope: string;
  count: number;
}

function parseScopeSummary(raw: unknown): ScopeSummary | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const scope = typeof record.scope === "string" ? record.scope : null;
  const count =
    typeof record.count === "number"
      ? record.count
      : typeof record.versionCount === "number"
        ? record.versionCount
        : typeof record.version_count === "number"
          ? record.version_count
          : null;

  if (!scope || count === null) {
    return null;
  }

  return { scope, count };
}

export interface PersonalServerClient {
  health(): Promise<PersonalServerHealth>;
  ingestScope(scope: string, data: unknown): Promise<IngestScopeResult>;
  listScopes(prefix?: string): Promise<ScopeSummary[]>;
}

/**
 * Create an HTTP client for a Vana personal server.
 *
 * @param config - Connection configuration
 * @param config.url - Base URL of the personal server
 * @param config.auth - Optional authentication configuration
 * @returns A PersonalServerClient instance
 */
export function createPersonalServerClient(config: {
  url: string;
  auth?: { type: "bearerToken"; token: string } | { type: "none" };
}): PersonalServerClient {
  const baseUrl = config.url.replace(/\/+$/, "");

  function authHeaders(): Record<string, string> {
    if (config.auth?.type === "bearerToken") {
      return { Authorization: `Bearer ${config.auth.token}` };
    }
    return {};
  }

  return {
    async health(): Promise<PersonalServerHealth> {
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const body = (await response.json()) as Record<string, unknown>;
      return {
        status: typeof body.status === "string" ? body.status : "unknown",
        version: typeof body.version === "string" ? body.version : "unknown",
        uptime: typeof body.uptime === "number" ? body.uptime : 0,
        owner: typeof body.owner === "string" ? body.owner : null,
      };
    },

    async ingestScope(
      scope: string,
      data: unknown,
    ): Promise<IngestScopeResult> {
      try {
        const response = await fetch(`${baseUrl}/v1/data/${scope}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify(data),
        });

        if (response.status === 201 || (response.ok && response.status < 300)) {
          const body = (await response.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          return {
            scope,
            status: "stored",
            collectedAt:
              typeof body.collectedAt === "string"
                ? body.collectedAt
                : new Date().toISOString(),
          };
        }

        const errorText = await response.text().catch(() => "Unknown error");
        return {
          scope,
          status: "failed",
          error: `HTTP ${response.status}: ${errorText}`,
        };
      } catch (error) {
        return {
          scope,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },

    async listScopes(prefix?: string): Promise<ScopeSummary[]> {
      // This endpoint requires auth — if no auth configured, return empty.
      if (!config.auth || config.auth.type === "none") {
        return [];
      }

      const params = prefix ? `?scopePrefix=${encodeURIComponent(prefix)}` : "";
      const response = await fetch(`${baseUrl}/v1/data${params}`, {
        method: "GET",
        headers: authHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Scope listing failed: HTTP ${response.status}: ${errorText}`,
        );
      }

      const body = (await response.json()) as { scopes?: unknown[] };
      return (body.scopes ?? [])
        .map(parseScopeSummary)
        .filter((scope): scope is ScopeSummary => scope !== null);
    },
  };
}
