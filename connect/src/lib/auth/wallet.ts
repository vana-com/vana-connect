/**
 * Vana wallet API: server-side typed-data signing on behalf of a user.
 *
 * See docs/auth-redesign/01-architecture.md §1.2 (SAI), §5.
 *
 * Single entry point for any code path that needs a signature on the user's
 * behalf. Enforces the SAI:
 *
 *   1. Wallet resolution (primary if not specified).
 *   2. user_controlled_eoa wallets are rejected (returned as
 *      not_supported_yet) — same response shape as "wallet not found" to
 *      prevent existence enumeration.
 *   3. Purpose validation against the closed enum + per-purpose typed-data
 *      validator.
 *   4. payload_hash = sha256(canonicalize(typedData)).
 *   5. payload_summary = validator.summarize(typedData) — every typed-data
 *      field appears in the summary.
 *   6. For HIGH_RISK_PURPOSES: confirmation_id is required and must match
 *      payload_hash + session + user.
 *   7. Atomic transaction: INSERT signing_authorization (max_uses=1,
 *      partial UNIQUE on payload_hash) → call provider adapter → UPDATE
 *      consumed_at. The partial UNIQUE rejects double-spend.
 *   8. Idempotency: if a confirmation_id has already been consumed AND has
 *      a corresponding consumed signing_authorization within the 30s grace
 *      window, return the cached signature instead of double-signing.
 *
 * Dependencies are injected so the orchestrator is unit-testable without
 * Postgres or a Privy account.
 */

import {
  consumeSigningAuthorization,
  findConfirmationById,
  findConsumedAuthorizationByConfirmationId,
  insertConfirmation,
  insertSigningAuthorization,
  type InteractiveConfirmationRow,
  type SigningAuthorizationRow,
  type SigningPurpose,
} from "@/lib/db/auth-signing";
import { findLinkedWalletsByUser } from "@/lib/db/account";
import { payloadHash } from "./payload-hash";
import {
  getValidator,
  isHighRisk,
  type TypedDataDefinition,
} from "./signing-purposes";
import type { CustodyAdapter, Hex } from "./wallet-providers/types";

// VanaUserId stub. Stage 6 will brand it; here it's a string alias.
type VanaUserId = string;

export type SigningRequest = {
  vanaUserId: VanaUserId;
  hydraSessionId: string;
  vanaWalletId?: string;
  purpose: SigningPurpose;
  typedData: TypedDataDefinition;
  /** Required for HIGH_RISK_PURPOSES; client sends after consuming an interactive_confirmations row. */
  confirmationId?: string;
};

export type SigningResult =
  | {
      kind: "signature";
      signature: Hex;
      authorizationId: string;
    }
  | {
      kind: "not_supported_yet";
      reason: "user_controlled_eoa";
    }
  | {
      kind: "confirmation_required";
      confirmationId: string;
      payloadSummary: Record<string, unknown>;
      expiresAt: string;
    };

// --- error class ------------------------------------------------------------

export class WalletApiError extends Error {
  readonly code: string;
  readonly detail?: string;
  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = "WalletApiError";
    this.code = code;
    this.detail = detail;
  }
}

// --- minimal LinkedWallet shape we depend on -------------------------------
// We don't import LinkedWalletRow directly because account.ts may not export
// it; instead we resolve through findLinkedWalletsByUser and depend on the
// shape the architecture doc specifies.
type WalletShape = {
  id: string;
  vana_user_id: string;
  provider: string;
  provider_wallet_id: string | null;
  chain_type: string;
  address: string;
  is_primary: boolean;
  /** Stage 2 migration adds this column with default 'provider_embedded'. */
  key_control_type?: string;
};

export type WalletDeps = {
  /** Provider adapter. Defaults to the live Privy adapter. */
  adapter: CustodyAdapter;
  /** Override for tests. */
  findLinkedWalletsByUser?: (vanaUserId: VanaUserId) => Promise<WalletShape[]>;
  /** Override for tests. */
  insertConfirmation?: typeof insertConfirmation;
  /** Override for tests. */
  findConfirmationById?: typeof findConfirmationById;
  /** Override for tests. */
  insertSigningAuthorization?: typeof insertSigningAuthorization;
  /** Override for tests. */
  consumeSigningAuthorization?: typeof consumeSigningAuthorization;
  /** Override for tests. */
  findConsumedAuthorizationByConfirmationId?: typeof findConsumedAuthorizationByConfirmationId;
};

const IDEMPOTENCY_GRACE_MS = 30_000;

// --- main orchestrator ------------------------------------------------------

export async function signTypedData(
  req: SigningRequest,
  deps: WalletDeps,
): Promise<SigningResult> {
  const findWallets = deps.findLinkedWalletsByUser ?? findLinkedWalletsByUser;
  const insertConfirm = deps.insertConfirmation ?? insertConfirmation;
  const findConfirm = deps.findConfirmationById ?? findConfirmationById;
  const insertAuth =
    deps.insertSigningAuthorization ?? insertSigningAuthorization;
  const consumeAuth =
    deps.consumeSigningAuthorization ?? consumeSigningAuthorization;
  const findCachedAuth =
    deps.findConsumedAuthorizationByConfirmationId ??
    findConsumedAuthorizationByConfirmationId;

  // 1. Wallet resolution.
  const wallets = (await findWallets(req.vanaUserId)) as WalletShape[];
  const wallet = req.vanaWalletId
    ? wallets.find((w) => w.id === req.vanaWalletId)
    : wallets.find((w) => w.is_primary);

  // 2. user_controlled_eoa or wallet not found → identical response shape.
  if (!wallet) {
    return { kind: "not_supported_yet", reason: "user_controlled_eoa" };
  }
  const keyControlType = wallet.key_control_type ?? "provider_embedded";
  if (keyControlType !== "provider_embedded") {
    return { kind: "not_supported_yet", reason: "user_controlled_eoa" };
  }
  if (!wallet.provider_wallet_id) {
    // Embedded wallet without a provider id is unsignable — treat as the
    // same not-supported-yet leaf to avoid leaking detail.
    return { kind: "not_supported_yet", reason: "user_controlled_eoa" };
  }

  // 3. Purpose validation.
  const validator = getValidator(req.purpose);
  const validation = validator.validate(req.typedData);
  if (!validation.ok) {
    throw new WalletApiError(
      "invalid_typed_data",
      `typed data does not match purpose ${req.purpose}`,
      validation.reason,
    );
  }

  // 4 + 5. Hash + summary.
  const hash = payloadHash(req.typedData);
  const summary = validator.summarize(req.typedData);

  // 6. High-risk gate.
  let confirmationRowId: string | null = null;
  if (isHighRisk(req.purpose)) {
    if (!req.confirmationId) {
      const fresh = await insertConfirm({
        vanaUserId: req.vanaUserId,
        hydraSessionId: req.hydraSessionId,
        vanaWalletId: wallet.id,
        purpose: req.purpose,
        payloadHash: hash,
        payloadSummary: summary,
      });
      return {
        kind: "confirmation_required",
        confirmationId: fresh.id,
        payloadSummary: summary,
        expiresAt: fresh.expires_at,
      };
    }

    const confirm = await findConfirm(req.confirmationId);
    if (!confirmationMatches(confirm, req, hash)) {
      const fresh = await insertConfirm({
        vanaUserId: req.vanaUserId,
        hydraSessionId: req.hydraSessionId,
        vanaWalletId: wallet.id,
        purpose: req.purpose,
        payloadHash: hash,
        payloadSummary: summary,
      });
      return {
        kind: "confirmation_required",
        confirmationId: fresh.id,
        payloadSummary: summary,
        expiresAt: fresh.expires_at,
      };
    }
    if (!confirm.consumed_at) {
      const fresh = await insertConfirm({
        vanaUserId: req.vanaUserId,
        hydraSessionId: req.hydraSessionId,
        vanaWalletId: wallet.id,
        purpose: req.purpose,
        payloadHash: hash,
        payloadSummary: summary,
      });
      return {
        kind: "confirmation_required",
        confirmationId: fresh.id,
        payloadSummary: summary,
        expiresAt: fresh.expires_at,
      };
    }

    // 8. Idempotency: confirmation already used for an authority?
    const cached = await findCachedAuth(req.confirmationId);
    if (cached && isWithinGrace(cached.consumed_at)) {
      return cachedSignatureResult(cached);
    }

    confirmationRowId = req.confirmationId;
  }

  // 7. Atomic authority insert + provider sign + consume.
  // The partial UNIQUE on signing_authorizations(payload_hash) rejects a
  // concurrent unconsumed row; UNIQUE failure surfaces as a thrown error,
  // which the caller may retry after backoff (the in-flight authority will
  // commit/abort within 60s).
  let authority: SigningAuthorizationRow;
  try {
    authority = await insertAuth({
      vanaUserId: req.vanaUserId,
      vanaWalletId: wallet.id,
      hydraSessionId: req.hydraSessionId,
      purpose: req.purpose,
      payloadHash: hash,
      payloadSummary: summary,
      confirmationId: confirmationRowId,
    });
  } catch (err) {
    throw new WalletApiError(
      "concurrent_in_flight",
      "another tx is mid-sign for this payload",
      err instanceof Error ? err.message : String(err),
    );
  }

  let signature: Hex;
  try {
    const result = await deps.adapter.signTypedData({
      walletProviderId: wallet.provider_wallet_id,
      typedData: req.typedData,
    });
    signature = result.signature;
  } catch (err) {
    // Provider failed. The authority row never gets consumed_at set; it
    // expires in 60s and the partial UNIQUE allows a fresh authority for
    // the same payload after that.
    throw new WalletApiError(
      "provider_sign_failed",
      "wallet provider failed to sign",
      err instanceof Error ? err.message : String(err),
    );
  }

  const consumed = await consumeAuth(authority.id, signature);
  if (!consumed) {
    // Should be impossible given the partial UNIQUE — defense in depth.
    throw new WalletApiError(
      "authority_consume_race",
      "authority row was claimed by a concurrent caller",
    );
  }

  return {
    kind: "signature",
    signature,
    authorizationId: authority.id,
  };
}

// --- helpers ----------------------------------------------------------------

function confirmationMatches(
  confirm: InteractiveConfirmationRow | null,
  req: SigningRequest,
  hash: string,
): confirm is InteractiveConfirmationRow {
  if (!confirm) return false;
  if (confirm.vana_user_id !== req.vanaUserId) return false;
  if (confirm.hydra_session_id !== req.hydraSessionId) return false;
  if (confirm.purpose !== req.purpose) return false;
  if (confirm.payload_hash !== hash) return false;
  if (new Date(confirm.expires_at).getTime() <= Date.now()) return false;
  return true;
}

function isWithinGrace(consumedAt: string | null): boolean {
  if (!consumedAt) return false;
  const consumedMs = new Date(consumedAt).getTime();
  return Date.now() - consumedMs <= IDEMPOTENCY_GRACE_MS;
}

function cachedSignatureResult(
  authority: SigningAuthorizationRow,
): SigningResult {
  if (!authority.signature_hex) {
    // Defensive: a consumed authority must have a signature. If it doesn't,
    // something corrupted the row; refuse to proceed rather than silently
    // re-sign.
    throw new WalletApiError(
      "missing_cached_signature",
      "authority is consumed but signature_hex is null",
    );
  }
  return {
    kind: "signature",
    signature: authority.signature_hex as Hex,
    authorizationId: authority.id,
  };
}
