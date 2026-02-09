import { ConnectError } from "../core/errors.js";
import type {
  SessionRelayConfig,
  SessionInitParams,
  SessionInitResult,
  SessionPollResult,
} from "../core/types.js";
import { createRequestSigner } from "./request-signer.js";

export interface SessionRelay {
  initSession(params: SessionInitParams): Promise<SessionInitResult>;
  pollSession(sessionId: string): Promise<SessionPollResult>;
  pollUntilComplete(
    sessionId: string,
    opts?: { interval?: number; timeout?: number },
  ): Promise<SessionPollResult>;
}

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
            ?.errorCode as string) ?? "SESSION_INIT_FAILED",
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
            ?.errorCode as string) ?? "POLL_FAILED",
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

      throw new ConnectError("Polling timed out", "POLL_TIMEOUT");
    },
  };
}
