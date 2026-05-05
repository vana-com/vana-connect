/**
 * Compile-time-enforced branded identifier types.
 *
 * See docs/auth-redesign/01-architecture.md §1.1 (PCI) and §11.
 *
 * The brand discriminator (`__brand`) exists only at the type level; at
 * runtime these are plain strings. The brand prevents accidental cross-
 * assignment from a raw `string` (e.g., a Privy DID like `did:privy:abc`)
 * into a `VanaUserId`-typed parameter.
 *
 * Construction goes through assert/coerce helpers that runtime-validate the
 * canonical shape. This is the only legitimate way to acquire a branded
 * value; downstream code consumes the brand and the compiler enforces that.
 *
 * Companion runtime defenses:
 *   - `tripwire.ts` middleware in dev/staging scans response bodies for
 *     `did:privy:` and fails loudly.
 *   - Code review checklist enforces "no provider IDs outside whitelisted
 *     boundaries."
 */

// --- VanaUserId -----------------------------------------------------------

export type VanaUserId = string & { readonly __brand: "VanaUserId" };

const VANA_USER_ID_RE = /^vana_user_[0-9a-f]{32}$/;

export function isVanaUserId(v: unknown): v is VanaUserId {
  return typeof v === "string" && VANA_USER_ID_RE.test(v);
}

export function assertVanaUserId(v: string): asserts v is VanaUserId {
  if (!VANA_USER_ID_RE.test(v)) {
    throw new Error(`assertVanaUserId: not a vana_user_id: ${v.slice(0, 24)}…`);
  }
}

export function asVanaUserId(v: string): VanaUserId {
  assertVanaUserId(v);
  return v;
}

// --- VanaWalletId ---------------------------------------------------------

export type VanaWalletId = string & { readonly __brand: "VanaWalletId" };

const VANA_WALLET_ID_RE = /^vana_wallet_[0-9a-f]{32}$/;

export function isVanaWalletId(v: unknown): v is VanaWalletId {
  return typeof v === "string" && VANA_WALLET_ID_RE.test(v);
}

export function assertVanaWalletId(v: string): asserts v is VanaWalletId {
  if (!VANA_WALLET_ID_RE.test(v)) {
    throw new Error(
      `assertVanaWalletId: not a vana_wallet_id: ${v.slice(0, 24)}…`,
    );
  }
}

export function asVanaWalletId(v: string): VanaWalletId {
  assertVanaWalletId(v);
  return v;
}
