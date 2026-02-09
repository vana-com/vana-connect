import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ConnectionStatus,
  GrantPayload,
  SessionPollResult,
} from "../core/types.js";

export interface UseVanaConnectConfig {
  sessionRelayUrl: string;
  pollingInterval?: number;
}

export interface UseVanaConnectResult {
  connect: (params: { sessionId: string }) => void;
  status: ConnectionStatus;
  grant: GrantPayload | null;
  error: string | null;
  deepLinkUrl: string | null;
  reset: () => void;
}

export function useVanaConnect(
  config: UseVanaConnectConfig,
): UseVanaConnectResult {
  const baseUrl = config.sessionRelayUrl.replace(/\/+$/, "");
  const interval = config.pollingInterval ?? 2000;

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [grant, setGrant] = useState<GrantPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);
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
    setDeepLinkUrl(null);
  }, [stopPolling]);

  const connect = useCallback(
    (params: { sessionId: string }) => {
      stopPolling();
      setStatus("connecting");
      setGrant(null);
      setError(null);
      setDeepLinkUrl(`vana://connect?sessionId=${params.sessionId}`);

      const pollUrl = `${baseUrl}/v1/session/${params.sessionId}/poll`;

      const poll = async () => {
        try {
          const res = await fetch(pollUrl);
          if (!res.ok) {
            setStatus("error");
            setError(`Poll failed: ${res.status}`);
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
    [baseUrl, interval, stopPolling],
  );

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  return { connect, status, grant, error, deepLinkUrl, reset };
}
