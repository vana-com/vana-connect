import crypto from "node:crypto";

/**
 * Pure helpers for the Vana account identity model.
 *
 * The OIDC `sub` is always a freshly-generated, opaque `vana_user_id`. Wallet
 * addresses, Privy ids, OAuth provider subjects, and email addresses are
 * stored as evidence/metadata via {@link LinkedWalletInput} and
 * {@link ProviderLinkInput}, never as the subject and never as a merge key.
 *
 * These functions are intentionally side-effect-free so they can be tested
 * without a database.
 */

export type ChainType = "evm" | "solana" | string;

export type LinkedWalletInput = {
  provider: string;
  providerWalletId?: string | null;
  chainType: ChainType;
  address: string;
  isPrimary?: boolean;
  verifiedAt?: Date | null;
};

export type LinkedWalletRow = {
  id: string;
  vana_user_id: string;
  provider: string;
  provider_wallet_id: string | null;
  chain_type: string;
  address: string;
  is_primary: boolean;
  verified_at: string | null;
  created_at: string;
};

export type ProviderLinkInput = {
  provider: string;
  providerSubject: string;
  email?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ProviderLinkRow = {
  id: string;
  vana_user_id: string;
  provider: string;
  provider_subject: string;
  email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type VanaUserRow = {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type VanaAccountClaims = {
  sub: string;
  linked_wallets: Array<{
    chain_type: string;
    address: string;
    provider: string;
    is_primary: boolean;
  }>;
  email?: string;
};

const VANA_USER_PREFIX = "vana_user_";
const VANA_WALLET_PREFIX = "vana_wallet_";
const VANA_PROVIDER_LINK_PREFIX = "vana_plink_";

/**
 * Generate a new opaque `vana_user_id`. The id is independent of any wallet
 * address, provider subject, or email — those are evidence, never the subject.
 */
export function generateVanaUserId(): string {
  return `${VANA_USER_PREFIX}${crypto.randomBytes(16).toString("hex")}`;
}

export function generateLinkedWalletId(): string {
  return `${VANA_WALLET_PREFIX}${crypto.randomBytes(16).toString("hex")}`;
}

export function generateProviderLinkId(): string {
  return `${VANA_PROVIDER_LINK_PREFIX}${crypto.randomBytes(16).toString("hex")}`;
}

export function isVanaUserId(value: string): boolean {
  return /^vana_user_[a-f0-9]{32}$/.test(value);
}

/**
 * Normalize a wallet address for storage. EVM (and EVM-shaped) addresses are
 * lowercased so they can be uniquely indexed; other chains are passed through
 * with surrounding whitespace stripped.
 */
export function normalizeWalletAddress(
  chainType: ChainType,
  address: string,
): string {
  const trimmed = address.trim();
  if (chainType === "evm") {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

/**
 * Build the claims payload for an OIDC ID/userinfo response.
 *
 * `sub` is always the `vana_user_id`. Wallet addresses surface as
 * `linked_wallets` claims so a relying party can read them, but they are never
 * the subject. Email is included only if the caller passes it explicitly —
 * the function does not pull it from provider links because email is not a
 * merge key.
 */
export function buildAccountClaims(input: {
  vanaUserId: string;
  linkedWallets: Array<
    Pick<LinkedWalletInput, "chainType" | "address" | "provider"> & {
      isPrimary?: boolean;
    }
  >;
  email?: string | null;
}): VanaAccountClaims {
  if (!isVanaUserId(input.vanaUserId)) {
    throw new Error(
      `buildAccountClaims: sub must be a vana_user_id, got ${input.vanaUserId}`,
    );
  }
  const claims: VanaAccountClaims = {
    sub: input.vanaUserId,
    linked_wallets: input.linkedWallets.map((w) => ({
      chain_type: w.chainType,
      address: normalizeWalletAddress(w.chainType, w.address),
      provider: w.provider,
      is_primary: Boolean(w.isPrimary),
    })),
  };
  if (input.email) {
    claims.email = input.email;
  }
  return claims;
}

/**
 * Map the input shape used by callers into the row shape that the persistence
 * layer writes. Pure: no IO, no id generation surprises beyond the
 * dependency-injected `id` and `createdAt`.
 */
export function toLinkedWalletRow(input: {
  id: string;
  vanaUserId: string;
  createdAt: Date;
  wallet: LinkedWalletInput;
}): LinkedWalletRow {
  return {
    id: input.id,
    vana_user_id: input.vanaUserId,
    provider: input.wallet.provider,
    provider_wallet_id: input.wallet.providerWalletId ?? null,
    chain_type: input.wallet.chainType,
    address: normalizeWalletAddress(
      input.wallet.chainType,
      input.wallet.address,
    ),
    is_primary: Boolean(input.wallet.isPrimary),
    verified_at: input.wallet.verifiedAt
      ? input.wallet.verifiedAt.toISOString()
      : null,
    created_at: input.createdAt.toISOString(),
  };
}

export function toProviderLinkRow(input: {
  id: string;
  vanaUserId: string;
  createdAt: Date;
  link: ProviderLinkInput;
}): ProviderLinkRow {
  return {
    id: input.id,
    vana_user_id: input.vanaUserId,
    provider: input.link.provider,
    provider_subject: input.link.providerSubject,
    email: input.link.email ?? null,
    metadata: input.link.metadata ?? null,
    created_at: input.createdAt.toISOString(),
  };
}
