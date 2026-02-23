import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus, GrantPayload } from "../core/types.js";
import { useVanaConnect } from "./useVanaConnect.js";

async function parseResponseBody(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

/**
 * Configuration for the {@link useVanaData} hook.
 */
export interface UseVanaDataConfig {
  /** URL of the connect API route (default: `"/api/connect"`). */
  connectUrl?: string;
  /** URL of the data API route (default: `"/api/data"`). */
  dataUrl?: string;
  /** Polling interval in ms passed to {@link useVanaConnect} (default: 2000). */
  pollingInterval?: number;
  /** SDK environment passed through to {@link useVanaConnect}. */
  environment?: "dev" | "prod";
  /** When true, automatically fetches data after grant approval (default: `true`). */
  autoFetch?: boolean;
}

/**
 * Return value of the {@link useVanaData} hook.
 */
export interface UseVanaDataResult {
  /** Current connection status. */
  status: ConnectionStatus;
  /** Grant payload after user approval, or `null`. */
  grant: GrantPayload | null;
  /** Fetched data after calling the data route, or `null`. */
  data: unknown;
  /** Error message, or `null`. */
  error: string | null;
  /** URL to account.vana.org where the user signs in and launches Data Connect, or `null`. */
  connectUrl: string | null;
  /** Opens the connect URL in a new tab. Use this instead of rendering the URL directly to avoid navigating away from your app. */
  openConnect: () => void;
  /** Starts the connect flow by calling the connect API route. */
  initConnect: () => Promise<void>;
  /** Manually fetches data using the current grant. */
  fetchData: () => Promise<void>;
  /** Resets all state back to idle. */
  reset: () => void;
  /** `true` while any async operation is in progress. */
  isLoading: boolean;
  /** `true` when status is `"approved"`. */
  isConnected: boolean;
}

/**
 * Full-flow hook that orchestrates the entire Vana Connect lifecycle:
 * session init, polling, and data fetching.
 *
 * Composes {@link useVanaConnect} internally and adds automatic
 * calls to your app's `/api/connect` and `/api/data` routes.
 *
 * @param config - Optional configuration.
 * @returns A {@link UseVanaDataResult} with state and actions.
 *
 * @example
 * ```tsx
 * import { useVanaData } from "@opendatalabs/connect/react";
 *
 * function MyComponent() {
 *   const { status, data, deepLinkUrl, initConnect, isLoading } = useVanaData();
 *
 *   if (status === "idle") return <button onClick={initConnect}>Connect</button>;
 *   if (status === "waiting") return <a href={deepLinkUrl!}>Open Vana</a>;
 *   if (data) return <pre>{JSON.stringify(data, null, 2)}</pre>;
 *   return <p>{isLoading ? "Loading..." : status}</p>;
 * }
 * ```
 */
export function useVanaData(config?: UseVanaDataConfig): UseVanaDataResult {
  const connectApiUrl = config?.connectUrl ?? "/api/connect";
  const dataUrl = config?.dataUrl ?? "/api/data";
  const autoFetch = config?.autoFetch ?? true;

  const {
    connect,
    status: pollStatus,
    grant: pollGrant,
    error: pollError,
    connectUrl,
    reset: resetPoll,
  } = useVanaConnect({
    pollingInterval: config?.pollingInterval,
    environment: config?.environment,
  });

  const [data, setData] = useState<unknown>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const autoFetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!pollGrant) return;
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(dataUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant: pollGrant }),
      });
      const json = await parseResponseBody(res);
      if (!res.ok) {
        setFetchError(
          json?.error ? String(json.error) : `Data fetch failed: ${res.status}`,
        );
        return;
      }
      setData(json ?? {});
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Unknown data fetch error",
      );
    } finally {
      setFetching(false);
    }
  }, [pollGrant, dataUrl]);

  // Auto-fetch on approval
  useEffect(() => {
    if (
      pollStatus === "approved" &&
      pollGrant &&
      autoFetch &&
      !autoFetchedRef.current
    ) {
      autoFetchedRef.current = true;
      void fetchData();
    }
  }, [pollStatus, pollGrant, autoFetch, fetchData]);

  const initConnect = useCallback(async () => {
    setData(null);
    setFetchError(null);
    autoFetchedRef.current = false;
    setInitLoading(true);
    try {
      const res = await fetch(connectApiUrl, { method: "POST" });
      const json = await parseResponseBody(res);
      if (!res.ok) {
        setFetchError(
          json?.error ? String(json.error) : `Connect failed: ${res.status}`,
        );
        return;
      }
      if (!json?.sessionId || typeof json.sessionId !== "string") {
        setFetchError("Connect failed: missing sessionId in response");
        return;
      }
      connect({
        sessionId: json.sessionId,
        connectUrl: (json?.connectUrl as string) || undefined,
      });
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Unknown connect error",
      );
    } finally {
      setInitLoading(false);
    }
  }, [connectApiUrl, connect]);

  const reset = useCallback(() => {
    resetPoll();
    setData(null);
    setFetchError(null);
    setFetching(false);
    setInitLoading(false);
    autoFetchedRef.current = false;
  }, [resetPoll]);

  const openConnect = useCallback(() => {
    if (connectUrl) {
      window.open(connectUrl, "_blank", "noopener,noreferrer");
    }
  }, [connectUrl]);

  const error = pollError ?? fetchError;
  const isLoading = initLoading || fetching || pollStatus === "connecting";
  const isConnected = pollStatus === "approved";

  return {
    status: pollStatus,
    grant: pollGrant,
    data,
    error,
    connectUrl,
    openConnect,
    initConnect,
    fetchData,
    reset,
    isLoading,
    isConnected,
  };
}
