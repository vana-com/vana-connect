/**
 * Target-state Privy custom JWT auth integration seam.
 *
 * This module models the direction the account domain is moving toward: Vana
 * (`account.vana.org`) owns primary auth, issues a Vana-signed JWT whose `sub`
 * is the opaque `vana_user_id`, and Privy is configured as a custom-auth
 * provider that trusts that JWT. Privy's durable user identifier in this mode
 * is the Vana account id carried in the configured JWT ID claim — not Privy's
 * native DID, not an email, not a wallet address.
 *
 * Status: this is a contract/seam only. No Privy SDK is invoked here, no
 * network calls are made, and no app routes are wired to it. The existing
 * transitional Privy-native session in {@link ./login-session-adapter} remains
 * the live login path. When the cutover happens, only the boundary types and
 * a small client implementation in this file change; OIDC routes continue to
 * receive a {@link LoginEvidence}-shaped value from a {@link LoginSessionAdapter}.
 *
 * Migration uncertainty (recorded deliberately, not as a TODO):
 *
 *   Privy-native-first users are NOT automatically proven migratable to a
 *   Vana custom-auth identity without a confirmed link/migration path. Privy
 *   documents that recreating users mints new ids and new embedded wallet
 *   addresses, so a delete/recreate strategy is not acceptable. Until a tested
 *   migration is in place — either an existing Privy-native user gaining a
 *   `custom_auth` linked account that preserves the Privy user id and
 *   embedded wallet, or a managed bulk migration through Privy — this seam
 *   refuses to silently coerce a Privy-native session into a custom-auth
 *   identity. See {@link assertCustomAuthMigrationConfirmed}.
 *
 * See: openspec/changes/account-oidc-privy-actions/design-notes/provider-issuer-source-check-2026-04-29.md
 */

import crypto from "node:crypto";
import type { LoginEvidence } from "./login-session-adapter";
import { isVanaUserId } from "./vana-account";

/**
 * Claims Vana puts into the JWT it issues for Privy custom auth.
 *
 * Privy's custom-auth setup verifies the JWT through a JWKS or static public
 * key and reads the configured JWT ID claim (default `sub`) as the durable
 * Privy custom-auth user id. To keep Vana the source of truth for identity,
 * `sub` MUST be the opaque `vana_user_id` — never the Privy native subject,
 * never the user's email, never a wallet address.
 */
export type VanaCustomAuthClaims = {
  /** OIDC subject. Always the opaque `vana_user_id`. */
  sub: string;
  /** Issuer. Expected to match the account domain's published OIDC issuer. */
  iss: string;
  /** Audience. The Privy app id this token is intended for. */
  aud: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiration, seconds since epoch. */
  exp: number;
};

export type VanaCustomAuthJwtConfig = {
  privateKeyPem: string;
  keyId: string;
  issuer: string;
  audience: string;
  ttlSeconds?: number;
};

export type VanaCustomAuthPublicJwk = crypto.JsonWebKey & {
  kid: string;
  alg: typeof VANA_CUSTOM_AUTH_ALG;
  use: typeof VANA_CUSTOM_AUTH_USE;
};

export type JsonWebKeySet = {
  keys: VanaCustomAuthPublicJwk[];
};

const VANA_CUSTOM_AUTH_ALG = "RS256";
const VANA_CUSTOM_AUTH_USE = "sig";
const DEFAULT_VANA_CUSTOM_AUTH_TTL_SECONDS = 5 * 60;

/**
 * Input shape for asking the Privy custom-auth boundary to authenticate a
 * user. The caller hands over a Vana-signed JWT whose `sub` is the Vana
 * account id; Privy treats that subject as its custom-auth user identifier.
 */
export type PrivyCustomAuthInput = {
  /** Vana-signed JWT. Tests pass the encoded form; production passes whatever
   *  the signer produced. The signer is out of scope for this module. */
  vanaJwt: string;
  /** The Vana account id that the JWT's `sub` claim must equal. Carried
   *  separately so callers can assert the binding without re-parsing the JWT. */
  vanaUserId: string;
};

/**
 * Output shape returned by Privy after a successful custom-auth exchange.
 * Modeled here as a contract; the real SDK call is intentionally not invoked.
 */
export type PrivyCustomAuthResult = {
  /** Privy's own user id for this Vana account. Stored as provider metadata
   *  on the corresponding `vana_provider_links` row, never used as OIDC `sub`. */
  privyUserId: string;
  /** The custom-auth user id Privy recorded — must equal the Vana account id
   *  carried in the JWT's `sub` claim. Verifying this round-trip catches
   *  config drift between Vana's signer and Privy's verifier. */
  customAuthUserId: string;
};

/**
 * Boundary interface for the Privy custom-auth call. Implementations wrap the
 * relevant Privy SDK method when one is chosen; tests inject a fake. The
 * production wiring is deferred — adding a real implementation does not
 * require changing OIDC routes.
 */
export type PrivyCustomAuthClient = {
  authenticate(input: PrivyCustomAuthInput): Promise<PrivyCustomAuthResult>;
};

/**
 * Validate that a candidate value is acceptable as the OIDC subject. Rejects
 * Privy native DIDs, raw EVM addresses, and email addresses so they cannot be
 * confused with a Vana account id at any boundary.
 */
export function assertVanaCustomAuthSubject(value: string): void {
  if (!isVanaUserId(value)) {
    throw new Error(
      `Privy custom-auth sub must be an opaque vana_user_id, got ${describeRejectedSubject(value)}`,
    );
  }
}

function describeRejectedSubject(value: string): string {
  if (value.startsWith("did:privy:")) return "Privy native subject";
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return "EVM wallet address";
  if (value.includes("@")) return "email address";
  return JSON.stringify(value);
}

/**
 * Build the JWT claim payload Vana will sign for Privy custom auth. Pure: no
 * IO, no signing, no key handling. Validates that `sub` is a `vana_user_id`
 * before returning.
 */
export function buildVanaCustomAuthClaims(input: {
  vanaUserId: string;
  issuer: string;
  audience: string;
  issuedAt: Date;
  expiresAt: Date;
}): VanaCustomAuthClaims {
  assertVanaCustomAuthSubject(input.vanaUserId);
  if (!input.issuer) {
    throw new Error("Privy custom-auth issuer is required");
  }
  if (!input.audience) {
    throw new Error("Privy custom-auth audience is required");
  }
  const iat = Math.floor(input.issuedAt.getTime() / 1000);
  const exp = Math.floor(input.expiresAt.getTime() / 1000);
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp <= iat) {
    throw new Error("Privy custom-auth exp must be after iat");
  }
  return {
    sub: input.vanaUserId,
    iss: input.issuer,
    aud: input.audience,
    iat,
    exp,
  };
}

export function resolveVanaCustomAuthJwtConfig(
  env: NodeJS.ProcessEnv = process.env,
): VanaCustomAuthJwtConfig {
  const privateKeyPem = readRequiredEnv(env, "VANA_AUTH_JWT_PRIVATE_KEY");
  const keyId = readRequiredEnv(env, "VANA_AUTH_JWT_KEY_ID");
  const issuer = readRequiredEnv(env, "VANA_AUTH_JWT_ISSUER");
  const audience = readRequiredEnv(env, "PRIVY_CUSTOM_AUTH_AUDIENCE");
  return { privateKeyPem, keyId, issuer, audience };
}

export function createVanaCustomAuthJwt(input: {
  vanaUserId: string;
  config: VanaCustomAuthJwtConfig;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const ttlSeconds =
    input.config.ttlSeconds ?? DEFAULT_VANA_CUSTOM_AUTH_TTL_SECONDS;
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Privy custom-auth token ttlSeconds must be positive");
  }

  const claims = buildVanaCustomAuthClaims({
    vanaUserId: input.vanaUserId,
    issuer: input.config.issuer,
    audience: input.config.audience,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
  });
  return signVanaCustomAuthJwt({
    claims,
    privateKeyPem: input.config.privateKeyPem,
    keyId: input.config.keyId,
  });
}

export function signVanaCustomAuthJwt(input: {
  claims: VanaCustomAuthClaims;
  privateKeyPem: string;
  keyId: string;
}): string {
  assertVanaCustomAuthSubject(input.claims.sub);
  if (input.claims.exp <= input.claims.iat) {
    throw new Error("Privy custom-auth exp must be after iat");
  }
  if (!input.keyId) {
    throw new Error("Privy custom-auth JWT kid is required");
  }
  const header = {
    alg: VANA_CUSTOM_AUTH_ALG,
    typ: "JWT",
    kid: input.keyId,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(input.claims)}`;
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    crypto.createPrivateKey(input.privateKeyPem),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

export function buildVanaCustomAuthJwks(input: {
  privateKeyPem: string;
  keyId: string;
}): JsonWebKeySet {
  if (!input.keyId) {
    throw new Error("Privy custom-auth JWKS kid is required");
  }
  const publicKey = crypto.createPublicKey(
    crypto.createPrivateKey(input.privateKeyPem),
  );
  const jwk = publicKey.export({ format: "jwk" });
  return {
    keys: [
      {
        ...jwk,
        kid: input.keyId,
        alg: VANA_CUSTOM_AUTH_ALG,
        use: VANA_CUSTOM_AUTH_USE,
      } as VanaCustomAuthPublicJwk,
    ],
  };
}

function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value.replaceAll("\\n", "\n");
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

/**
 * Verify that a Privy custom-auth result is consistent with the request: the
 * `customAuthUserId` Privy returned must equal the Vana account id carried in
 * the JWT, and the Vana account id must itself be a `vana_user_id`. Catches
 * silent provider/issuer drift at the boundary.
 */
export function assertPrivyCustomAuthBinding(input: {
  expectedVanaUserId: string;
  result: PrivyCustomAuthResult;
}): void {
  assertVanaCustomAuthSubject(input.expectedVanaUserId);
  if (input.result.customAuthUserId !== input.expectedVanaUserId) {
    throw new Error(
      "Privy custom-auth response did not echo the Vana account id as customAuthUserId",
    );
  }
  if (!input.result.privyUserId) {
    throw new Error("Privy custom-auth response is missing privyUserId");
  }
}

/**
 * Migration-uncertainty guard. Until Vana has a confirmed migration path from
 * Privy-native users to custom-auth users that preserves the Privy user id
 * and embedded wallet, this seam refuses to silently treat a Privy-native
 * `LoginEvidence` as a custom-auth identity.
 *
 * Callers that have an explicitly migrated user pass `migrationConfirmed:
 * true` after their migration record-keeping has run. Until then the function
 * throws — it is intentional that this surfaces loudly rather than being
 * skipped, because a quiet skip would risk minting a fresh Privy user with a
 * new embedded wallet address.
 */
export function assertCustomAuthMigrationConfirmed(input: {
  evidence: LoginEvidence;
  migrationConfirmed: boolean;
}): void {
  if (input.migrationConfirmed) return;
  throw new Error(
    "Privy-native LoginEvidence cannot be used as Privy custom-auth identity " +
      "without a confirmed migration: existing Privy-native users must be " +
      "linked to a custom_auth account that preserves the Privy user id and " +
      "embedded wallet. Pass migrationConfirmed: true once that record exists.",
  );
}

/**
 * Compose target-state `PrivyCustomAuthInput` from a resolved Vana account id
 * plus a Vana-signed JWT. This is the seam OIDC code will eventually call
 * instead of `createPrivyLoginSessionAdapter`. Today it only validates the
 * binding; no network call is made.
 *
 * Note: `LoginEvidence.privySubject` (the Privy native DID) is intentionally
 * NOT forwarded as the custom-auth identifier. In target state the Vana
 * account id is the durable Privy custom-auth id; the Privy native DID is
 * legacy provider metadata.
 */
export function buildPrivyCustomAuthInput(input: {
  vanaUserId: string;
  vanaJwt: string;
}): PrivyCustomAuthInput {
  assertVanaCustomAuthSubject(input.vanaUserId);
  if (!input.vanaJwt) {
    throw new Error("Privy custom-auth requires a signed Vana JWT");
  }
  return {
    vanaJwt: input.vanaJwt,
    vanaUserId: input.vanaUserId,
  };
}
