/**
 * Wallet custody adapter contract.
 *
 * Adapters are the only files in the codebase permitted to import a wallet
 * provider SDK for SIGNING. (The Privy bridge route at
 * `/api/auth/session` may also import @privy-io/node, but only for
 * verifyIdentityToken.)
 *
 * The contract is intentionally narrow: input is "opaque provider wallet id +
 * typed data"; output is a signature. The orchestrator (`wallet.signTypedData`)
 * is responsible for wallet resolution, purpose validation, payload hashing,
 * confirmation gating, and atomic authority bookkeeping.
 */

import type { TypedDataDefinition } from "../signing-purposes";

export type Hex = `0x${string}`;

export interface CustodyAdapter {
  signTypedData(args: {
    /** Opaque provider wallet id (Privy walletId, Para walletId, etc.). */
    walletProviderId: string;
    typedData: TypedDataDefinition;
  }): Promise<{ signature: Hex }>;
}
