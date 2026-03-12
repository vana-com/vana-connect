"use client";

import { useCallback, useEffect, useState } from "react";

interface DataScope {
  scope: string;
  collectedAt: string;
}

interface Grant {
  id: string;
  granteeAddress: string;
  scopes: string[];
  status: string;
  createdAt?: string;
  appName?: string;
  appUrl?: string;
}

interface DashboardData {
  dataScopes: DataScope[];
  grants: Grant[];
}

export function useDashboard(serverUrl: string) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch data scopes and grants in parallel from the Personal Server
      const [scopesRes, grantsRes] = await Promise.all([
        fetch(`${serverUrl}/v1/data`).catch(() => null),
        fetch(`${serverUrl}/v1/grants`).catch(() => null),
      ]);

      const dataScopes: DataScope[] = [];
      if (scopesRes?.ok) {
        const scopesJson = (await scopesRes.json()) as
          | { scopes?: DataScope[] }
          | DataScope[];
        if (Array.isArray(scopesJson)) {
          dataScopes.push(...scopesJson);
        } else if (Array.isArray(scopesJson?.scopes)) {
          dataScopes.push(...scopesJson.scopes);
        }
      }

      const grants: Grant[] = [];
      if (grantsRes?.ok) {
        const grantsJson = (await grantsRes.json()) as
          | { grants?: Grant[] }
          | Grant[];
        if (Array.isArray(grantsJson)) {
          grants.push(...grantsJson);
        } else if (Array.isArray(grantsJson?.grants)) {
          grants.push(...grantsJson.grants);
        }
      }

      setData({ dataScopes, grants });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard data",
      );
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  return { data, loading, error, refresh: fetchDashboard };
}
