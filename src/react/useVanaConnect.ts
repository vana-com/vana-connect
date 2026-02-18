import { useState, useCallback, useRef, useEffect } from "react";
import { getEnvConfig } from "../core/constants.js";
import type {
  ConnectionStatus,
  GrantPayload,
  SessionPollResult,
} from "../core/types.js";

/** Configuration for the {@link useVanaConnect} hook. */
export interface UseVanaConnectConfig {
  /** Polling interval in milliseconds (default: 2000). */
  pollingInterval?: number;
  /** SDK environment (`"dev"` or `"prod"`). Defaults to `"prod"`. */
  environment?: "dev" | "prod";
}

/** Return value of the {@link useVanaConnect} hook. */
export interface UseVanaConnectResult {
  /** Starts polling the Session Relay for the given session. */
  connect: (params: { sessionId: string; connectUrl?: string }) => void;
  /** Current connection status. */
  status: ConnectionStatus;
  /** Grant payload after user approval, or `null`. */
  grant: GrantPayload | null;
  /** Error message, or `null`. */
  error: string | null;
  /** URL to account.vana.org where the user signs in and launches Data Connect, or `null`. */
  connectUrl: string | null;
  /** Resets all state back to idle and stops polling. */
  reset: () => void;
}

/**
 * React hook that polls the Session Relay and manages connection state.
 *
 * Call `connect()` with a session ID (from your server's `/api/connect` route)
 * to begin polling. The hook will update `status` through the lifecycle:
 * `idle` -> `connecting` -> `waiting` -> `approved` | `denied` | `expired` | `error`.
 *
 * @param config - Optional configuration for polling interval and environment.
 * @returns A {@link UseVanaConnectResult} with state and actions.
 *
 * @example
 * ```tsx
 * const { connect, status, grant, deepLinkUrl } = useVanaConnect();
 *
 * useEffect(() => {
 *   connect({ sessionId: "sess-123" });
 * }, []);
 *
 * if (status === "waiting") return <a href={deepLinkUrl!}>Open Vana</a>;
 * if (status === "approved") return <p>Connected! Grant: {grant!.grantId}</p>;
 * ```
 */
export function useVanaConnect(
  config?: UseVanaConnectConfig,
): UseVanaConnectResult {
  const envConfig = getEnvConfig(config?.environment);
  const baseUrl = envConfig.sessionRelayUrl;
  const accountUrl = envConfig.accountUrl;
  const interval = config?.pollingInterval ?? 2000;

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [grant, setGrant] = useState<GrantPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setStatus("idle");
    setGrant(null);
    setError(null);
    setConnectUrl(null);
  }, [stopPolling]);

  const connect = useCallback(
    (params: { sessionId: string; connectUrl?: string }) => {
      stopPolling();
      setStatus("connecting");
      setGrant(null);
      setError(null);
      setConnectUrl(
        params.connectUrl ??
          `${accountUrl}/connect?sessionId=${params.sessionId}`,
      );

      const pollUrl = `${baseUrl}/v1/session/${params.sessionId}/poll`;

      const poll = async () => {
        try {
          const res = await fetch(pollUrl);
          if (!res.ok) {
            // Try to extract structured error from response body
            const body = await res.json().catch(() => null);
            const errorCode =
              body && typeof body === "object"
                ? (body as Record<string, Record<string, unknown>>).error
                    ?.errorCode
                : undefined;

            if (res.status === 410 || errorCode === "SESSION_EXPIRED") {
              setStatus("expired");
              setError("Session expired");
            } else {
              setStatus("error");
              setError(`Poll failed: ${res.status}`);
            }
            stopPolling();
            return;
          }

          const result = (await res.json()) as SessionPollResult;

          switch (result.status) {
            case "pending":
            case "claimed":
              setStatus("waiting");
              break;
            case "approved":
              setStatus("approved");
              setGrant(result.grant ?? null);
              stopPolling();
              break;
            case "denied":
              setStatus("denied");
              setError(result.reason ?? "User denied the request");
              stopPolling();
              break;
            case "expired":
              setStatus("expired");
              setError("Session expired");
              stopPolling();
              break;
          }
        } catch (err) {
          setStatus("error");
          setError(
            err instanceof Error ? err.message : "Unknown polling error",
          );
          stopPolling();
        }
      };

      // First poll immediately, then at interval
      void poll();
      timerRef.current = setInterval(() => void poll(), interval);
    },
    [baseUrl, accountUrl, interval, stopPolling],
  );

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  return { connect, status, grant, error, connectUrl, reset };
}
