/** URL configuration for the SDK. */
export const ENV_CONFIG = {
  sessionRelayUrl: "https://session-relay.vana.org",
  gatewayUrl: "https://data-gateway.vana.org",
  accountUrl: "https://account.vana.org",
} as const;

/**
 * Returns the SDK URL configuration.
 *
 * @returns An object with `sessionRelayUrl`, `gatewayUrl`, and `accountUrl`.
 */
export function getEnvConfig() {
  return ENV_CONFIG;
}
