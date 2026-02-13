import { ConnectError, ConnectErrorCode } from "../core/errors.js";

/**
 * Verifies a webhook payload signature.
 *
 * @param payload - The raw request body as a string or Buffer.
 * @param signature - The signature from the webhook request header.
 * @param secret - The shared secret used to verify the signature.
 * @returns The verified payload.
 * @throws {@link ConnectError} with code `WEBHOOK_INVALID` — this function is not yet implemented.
 */
export function verifyWebhook(
  payload: string | Buffer,
  signature: string,
  secret: string,
): unknown {
  void payload;
  void signature;
  void secret;

  // TODO: Implement when Data Portability Protocol webhook signing spec is available
  throw new ConnectError(
    "verifyWebhook() is not yet implemented. Webhook signing scheme is pending protocol specification.",
    ConnectErrorCode.WEBHOOK_INVALID,
  );
}
