import { ConnectError, ConnectErrorCode } from "../core/errors.js";

export interface VanaConfig {
  privateKey: `0x${string}`;
  scopes: string[];
  appUrl: string;
}

/**
 * Creates a validated SDK configuration.
 *
 * All values must be passed explicitly — the SDK does not read
 * environment variables. The calling application is responsible
 * for sourcing config values (e.g. from `process.env`).
 *
 * @param config - Required configuration fields.
 * @returns A validated {@link VanaConfig} object.
 * @throws {@link ConnectError} with code `CONFIG_INVALID` if any required field is missing or invalid.
 *
 * @example
 * ```typescript
 * import { createVanaConfig } from "@opendatalabs/connect/server";
 *
 * const config = createVanaConfig({
 *   privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
 *   scopes: ["chatgpt.conversations"],
 *   appUrl: process.env.APP_URL!,
 * });
 * ```
 */
export function createVanaConfig(config: {
  privateKey: `0x${string}`;
  scopes: string[];
  appUrl: string;
}): VanaConfig {
  if (!config.privateKey) {
    throw new ConnectError(
      "Missing privateKey. Pass a 0x-prefixed private key.",
      ConnectErrorCode.CONFIG_INVALID,
    );
  }

  if (!config.privateKey.startsWith("0x")) {
    throw new ConnectError(
      "privateKey must start with 0x.",
      ConnectErrorCode.CONFIG_INVALID,
    );
  }

  if (!Array.isArray(config.scopes) || config.scopes.length === 0) {
    throw new ConnectError(
      "Missing scopes. Pass a non-empty array of scope strings.",
      ConnectErrorCode.CONFIG_INVALID,
    );
  }

  if (!config.appUrl) {
    throw new ConnectError(
      "Missing appUrl. Pass the public URL of your deployed app.",
      ConnectErrorCode.CONFIG_INVALID,
    );
  }

  return {
    privateKey: config.privateKey,
    scopes: config.scopes,
    appUrl: config.appUrl,
  };
}
