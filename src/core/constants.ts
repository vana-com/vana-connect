/** SDK environment selector. */
export type VanaEnvironment = "dev" | "prod";

/** URL configuration for each SDK environment. */
export const ENV_CONFIG = {
  dev: {
    sessionRelayUrl: "https://session-relay-git-dev-opendatalabs.vercel.app",
    gatewayUrl: "https://data-gateway-env-dev-opendatalabs.vercel.app",
  },
  prod: {
    // TODO: Replace with actual production URLs
    sessionRelayUrl: "https://session-relay-git-dev-opendatalabs.vercel.app",
    gatewayUrl: "https://data-gateway-env-dev-opendatalabs.vercel.app",
  },
} as const;

/** Default environment used when none is specified. */
export const DEFAULT_ENVIRONMENT: VanaEnvironment = "prod";

/**
 * Returns the URL configuration for the given environment.
 *
 * @param environment - `"dev"` or `"prod"`. Defaults to {@link DEFAULT_ENVIRONMENT}.
 * @returns An object with `sessionRelayUrl` and `gatewayUrl`.
 */
export function getEnvConfig(environment?: VanaEnvironment) {
  return ENV_CONFIG[environment ?? DEFAULT_ENVIRONMENT];
}
