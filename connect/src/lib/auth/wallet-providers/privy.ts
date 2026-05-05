/**
 * Privy custody adapter.
 *
 * Per `docs/auth-redesign/01-architecture.md` §5.2 (Privy adapter contract)
 * and §1 (Provider Containment Invariant), this file is the SOLE place
 * outside `/api/auth/session` permitted to import `@privy-io/node` for
 * SIGNING. It receives an opaque `walletProviderId` (Privy walletId) and
 * never sees Privy DIDs, `VanaUserId`s, or any business identifiers.
 *
 * The orchestrator (`src/lib/auth/wallet.ts`) handles wallet resolution,
 * purpose validation, payload hashing, confirmation gating, and atomic
 * authority bookkeeping. This adapter is intentionally narrow.
 */

import { PrivyClient } from "@privy-io/node";
import type { TypedDataDefinition } from "../signing-purposes";
import type { CustodyAdapter, Hex } from "./types";

let _privy: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!_privy) {
    _privy = new PrivyClient({
      appId: requireEnv("PRIVY_APP_ID"),
      appSecret: requireEnv("PRIVY_APP_SECRET"),
    });
  }
  return _privy;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Reset the lazily-cached PrivyClient. Test-only seam — production code
 * relies on the module-level singleton.
 */
export function __resetPrivyClientForTests(): void {
  _privy = null;
}

export const privyAdapter: CustodyAdapter = {
  async signTypedData({
    walletProviderId,
    typedData,
  }: {
    walletProviderId: string;
    typedData: TypedDataDefinition;
  }): Promise<{ signature: Hex }> {
    const signerPrivateKey = requireEnv("PRIVY_SIGNER_PRIVATE_KEY");
    const privy = getPrivyClient();

    // Privy SDK expects snake_case `primary_type`; our internal
    // `TypedDataDefinition` (per signing-purposes.ts) uses camelCase
    // `primaryType`. Translate at the adapter boundary so the rest of the
    // codebase stays in idiomatic camelCase.
    const sdkTypedData = {
      domain: typedData.domain as Record<string, unknown>,
      message: typedData.message,
      primary_type: typedData.primaryType,
      types: typedData.types as Record<
        string,
        Array<{ name: string; type: string }>
      >,
    };

    try {
      const result = await privy
        .wallets()
        .ethereum()
        .signTypedData(walletProviderId, {
          params: { typed_data: sdkTypedData },
          authorization_context: {
            authorization_private_keys: [signerPrivateKey],
          },
        });

      return { signature: result.signature as Hex };
    } catch (err) {
      // Redact any Privy SDK error: do NOT include `walletProviderId`,
      // signer keys, or raw Privy error bodies (which may echo identifiers
      // back). The orchestrator wraps this in
      // `WalletApiError(provider_sign_failed)`.
      const errorName = err instanceof Error ? err.name : "Error";
      throw new Error(`Privy signTypedData failed: ${errorName}`);
    }
  },
};
