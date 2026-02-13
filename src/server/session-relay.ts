import { ConnectError, ConnectErrorCode } from "../core/errors.js";
import type {
  SessionRelayConfig,
  SessionInitParams,
  SessionInitResult,
  SessionPollResult,
} from "../core/types.js";
import { createRequestSigner } from "./request-signer.js";

/**
 * Low-level client for the Session Relay service.
 *
 * @see {@link createSessionRelay} to create an instance.
 */
export interface SessionRelay {
  /** Creates a new session and returns the session ID and deep link URL. */
  initSession(params: SessionInitParams): Promise<SessionInitResult>;
  /** Polls the session status once. */
  pollSession(sessionId: string): Promise<SessionPollResult>;
  /**
   * Polls until the session reaches a terminal state (`approved`, `denied`, or `expired`).
   *
   * @param sessionId - The session to poll.
   * @param opts - Optional polling interval (default 2 s) and timeout (default 15 min).
   * @throws {@link ConnectError} with code `POLL_TIMEOUT` if the timeout is exceeded.
   */
  pollUntilComplete(
    sessionId: string,
    opts?: { interval?: number; timeout?: number },
  ): Promise<SessionPollResult>;
}

/**
 * Creates a low-level Session Relay client.
 *
 * Prefer the high-level {@link connect} function for most use cases.
 *
 * @param config - Session Relay configuration.
 * @returns A {@link SessionRelay} instance.
 */
export function createSessionRelay(config: SessionRelayConfig): SessionRelay {
  const baseUrl = config.sessionRelayUrl.replace(/\/+$/, "");
  const signer = createRequestSigner({ privateKey: config.privateKey });

  return {
    async initSession(params: SessionInitParams): Promise<SessionInitResult> {
      const body = JSON.stringify({
        granteeAddress: config.granteeAddress,
        scopes: params.scopes,
        ...(params.webhookUrl && { webhookUrl: params.webhookUrl }),
        ...(params.appUserId && { app_user_id: params.appUserId }),
      });

      const authHeader = await signer.signRequest({
        aud: baseUrl,
        method: "POST",
        uri: "/v1/session/init",
        body,
      });

      const res = await fetch(`${baseUrl}/v1/session/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body,
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        const errorMsg =
          (errorBody as Record<string, unknown>).error &&
          typeof (errorBody as Record<string, unknown>).error === "object"
            ? ((errorBody as Record<string, Record<string, unknown>>).error
                .message as string)
            : `Session init failed: ${res.status}`;
        throw new ConnectError(
          errorMsg,
          ((errorBody as Record<string, Record<string, unknown>>).error
            ?.errorCode as string) ?? ConnectErrorCode.SESSION_INIT_FAILED,
          res.status,
        );
      }

      return (await res.json()) as SessionInitResult;
    },

    async pollSession(sessionId: string): Promise<SessionPollResult> {
      const res = await fetch(`${baseUrl}/v1/session/${sessionId}/poll`);

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new ConnectError(
          `Poll failed: ${res.status}`,
          ((errorBody as Record<string, Record<string, unknown>>).error
            ?.errorCode as string) ?? ConnectErrorCode.POLL_FAILED,
          res.status,
        );
      }

      return (await res.json()) as SessionPollResult;
    },

    async pollUntilComplete(
      sessionId: string,
      opts?: { interval?: number; timeout?: number },
    ): Promise<SessionPollResult> {
      const interval = opts?.interval ?? 2000;
      const timeout = opts?.timeout ?? 900_000; // 15 minutes
      const deadline = Date.now() + timeout;

      while (Date.now() < deadline) {
        const result = await this.pollSession(sessionId);

        if (
          result.status === "approved" ||
          result.status === "denied" ||
          result.status === "expired"
        ) {
          return result;
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      throw new ConnectError(
        "Polling timed out",
        ConnectErrorCode.POLL_TIMEOUT,
      );
    },
  };
}
