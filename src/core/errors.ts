/**
 * Known error codes thrown by the SDK.
 *
 * Use these constants for typed `catch` handling instead of comparing raw strings.
 *
 * @example
 * ```typescript
 * import { ConnectError, ConnectErrorCode } from "@opendatalabs/connect/core";
 *
 * try {
 *   await getData({ privateKey, grant });
 * } catch (err) {
 *   if (err instanceof ConnectError && err.code === ConnectErrorCode.SERVER_NOT_FOUND) {
 *     // handle missing server
 *   }
 * }
 * ```
 */
export const ConnectErrorCode = {
  SESSION_INIT_FAILED: "SESSION_INIT_FAILED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  POLL_FAILED: "POLL_FAILED",
  POLL_TIMEOUT: "POLL_TIMEOUT",
  SERVER_NOT_FOUND: "SERVER_NOT_FOUND",
  GATEWAY_ERROR: "GATEWAY_ERROR",
  DATA_FETCH_FAILED: "DATA_FETCH_FAILED",
  LIST_SCOPES_FAILED: "LIST_SCOPES_FAILED",
  LIST_VERSIONS_FAILED: "LIST_VERSIONS_FAILED",
  CONFIG_INVALID: "CONFIG_INVALID",
  WEBHOOK_INVALID: "WEBHOOK_INVALID",
} as const;

/** Union type of all known error code string values. */
export type ConnectErrorCode =
  (typeof ConnectErrorCode)[keyof typeof ConnectErrorCode];

/**
 * Error class thrown by all SDK operations.
 *
 * Includes a typed {@link code} for programmatic handling and an optional
 * {@link statusCode} from HTTP responses.
 */
export class ConnectError extends Error {
  /** Machine-readable error code. One of {@link ConnectErrorCode} or an arbitrary server-returned string. */
  readonly code: ConnectErrorCode | (string & {});
  /** HTTP status code from the upstream response, if applicable. */
  readonly statusCode?: number;

  constructor(
    message: string,
    code: ConnectErrorCode | (string & {}),
    statusCode?: number,
  ) {
    super(message);
    this.name = "ConnectError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
