/**
 * Closed signing-purpose enum + per-purpose typed-data validators + summary
 * templates.
 *
 * See docs/auth-redesign/01-architecture.md §3 and §5.
 *
 * Each purpose maps to:
 *   - validate(typedData): asserts the EIP-712 shape (domain, primaryType,
 *     types, message fields). Failure → throw at call site; never reaches
 *     the Privy SDK.
 *   - summarize(typedData): deterministic JSON summary the user reviews
 *     in the inline confirmation modal. Every typed-data field must
 *     appear in the summary (a unit test asserts this on a fixture
 *     payload).
 *
 * `register_builder` is intentionally NOT in this enum. It uses a server-
 * generated EOA (the builder's identity, not the user's wallet) and goes
 * through `src/app/admin/_lib/register-builder.ts`, which signs locally
 * with a private key generated for the builder.
 */

export type SigningPurpose =
  | "register_personal_server"
  | "register_personal_server_deregistration"
  | "create_grant"
  | "revoke_grant";

/**
 * High-risk purposes require an inline user confirmation modal before the
 * server signs. We exclude `register_personal_server` and its deregistration
 * counterpart from the set: the server signs with the PS's own derived
 * keypair (not the user's wallet), so the cryptographic risk is bounded to
 * a single PS lifecycle action that the user already initiated by clicking
 * "Provision" / "Remove server" in the UI. Re-adding a confirmation here is
 * legitimate as defense-in-depth and should be considered once the modal
 * flow is robust; tracked separately.
 *
 * `create_grant` stays high-risk: it authorizes data access by a third
 * party and is the load-bearing user-consent moment in the protocol.
 */
export const HIGH_RISK_PURPOSES: ReadonlySet<SigningPurpose> =
  new Set<SigningPurpose>(["create_grant"]);

export function isSigningPurpose(v: unknown): v is SigningPurpose {
  return (
    typeof v === "string" &&
    (v === "register_personal_server" ||
      v === "register_personal_server_deregistration" ||
      v === "create_grant" ||
      v === "revoke_grant")
  );
}

export type TypedDataDomain = {
  name?: string;
  version?: string;
  chainId?: number | string | bigint;
  verifyingContract?: string;
};

export type TypedDataDefinition = {
  domain: TypedDataDomain;
  primaryType: string;
  types: Record<string, ReadonlyArray<{ name: string; type: string }>>;
  message: Record<string, unknown>;
};

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export interface PurposeValidator {
  /** Verify the typed data matches the expected EIP-712 shape for this purpose. */
  validate(typedData: TypedDataDefinition): ValidationResult;
  /**
   * Build a deterministic summary of the typed data for the user-facing
   * confirmation modal. Every typed-data message field must appear here
   * (validated by tests). The returned object is the verbatim payload_summary
   * stored alongside the authority and confirmation rows.
   */
  summarize(typedData: TypedDataDefinition): Record<string, unknown>;
}

// --- helpers ---------------------------------------------------------------

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

function isBytes32(v: unknown): boolean {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

function isHttpsUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function expectMessageFields(
  typedData: TypedDataDefinition,
  required: ReadonlyArray<string>,
): { ok: true } | { ok: false; reason: string } {
  const keys = Object.keys(typedData.message);
  for (const k of required) {
    if (!Object.hasOwn(typedData.message, k)) {
      return { ok: false, reason: `missing message field: ${k}` };
    }
  }
  for (const k of keys) {
    if (!required.includes(k)) {
      return {
        ok: false,
        reason: `unexpected message field: ${k} (purpose template does not cover it)`,
      };
    }
  }
  return { ok: true };
}

// --- register_personal_server ---------------------------------------------

const REGISTER_PERSONAL_SERVER_FIELDS = [
  "ownerAddress",
  "serverAddress",
  "publicKey",
  "serverUrl",
] as const;

const registerPersonalServerValidator: PurposeValidator = {
  validate(typedData) {
    if (typedData.primaryType !== "ServerRegistration") {
      return {
        ok: false,
        reason: `expected primaryType=ServerRegistration, got ${typedData.primaryType}`,
      };
    }
    if (typedData.domain.name !== "Vana Data Portability") {
      return { ok: false, reason: "domain.name mismatch" };
    }
    if (typedData.domain.version !== "1") {
      return { ok: false, reason: "domain.version mismatch" };
    }
    if (typedData.domain.chainId === undefined) {
      return { ok: false, reason: "domain.chainId missing" };
    }
    if (!isAddress(typedData.domain.verifyingContract)) {
      return { ok: false, reason: "domain.verifyingContract invalid" };
    }
    const fieldsOk = expectMessageFields(
      typedData,
      REGISTER_PERSONAL_SERVER_FIELDS,
    );
    if (!fieldsOk.ok) return fieldsOk;
    if (!isAddress(typedData.message.ownerAddress)) {
      return { ok: false, reason: "ownerAddress invalid" };
    }
    if (!isAddress(typedData.message.serverAddress)) {
      return { ok: false, reason: "serverAddress invalid" };
    }
    if (
      typeof typedData.message.publicKey !== "string" ||
      !/^0x04[0-9a-fA-F]{128}$/.test(typedData.message.publicKey)
    ) {
      return {
        ok: false,
        reason: "publicKey must be 0x04-prefixed uncompressed (130 hex chars)",
      };
    }
    if (!isHttpsUrl(typedData.message.serverUrl)) {
      return { ok: false, reason: "serverUrl must be https" };
    }
    return { ok: true };
  },
  summarize(typedData) {
    return {
      purpose: "register_personal_server",
      ownerAddress: typedData.message.ownerAddress,
      serverAddress: typedData.message.serverAddress,
      publicKey: typedData.message.publicKey,
      serverUrl: typedData.message.serverUrl,
    };
  },
};

// --- register_personal_server_deregistration -----------------------------

const DEREGISTER_FIELDS = ["ownerAddress", "serverAddress"] as const;

const deregisterValidator: PurposeValidator = {
  validate(typedData) {
    if (typedData.primaryType !== "ServerDeregistration") {
      return {
        ok: false,
        reason: `expected primaryType=ServerDeregistration, got ${typedData.primaryType}`,
      };
    }
    if (typedData.domain.name !== "Vana Data Portability") {
      return { ok: false, reason: "domain.name mismatch" };
    }
    const fieldsOk = expectMessageFields(typedData, DEREGISTER_FIELDS);
    if (!fieldsOk.ok) return fieldsOk;
    if (!isAddress(typedData.message.ownerAddress)) {
      return { ok: false, reason: "ownerAddress invalid" };
    }
    if (!isAddress(typedData.message.serverAddress)) {
      return { ok: false, reason: "serverAddress invalid" };
    }
    return { ok: true };
  },
  summarize(typedData) {
    return {
      purpose: "register_personal_server_deregistration",
      ownerAddress: typedData.message.ownerAddress,
      serverAddress: typedData.message.serverAddress,
    };
  },
};

// --- create_grant ----------------------------------------------------------

const CREATE_GRANT_FIELDS = [
  "user",
  "builder",
  "scopes",
  "expiresAt",
  "nonce",
] as const;

const createGrantValidator: PurposeValidator = {
  validate(typedData) {
    if (typedData.primaryType !== "GrantRegistration") {
      return {
        ok: false,
        reason: `expected primaryType=GrantRegistration, got ${typedData.primaryType}`,
      };
    }
    if (typedData.domain.name !== "Vana Data Portability") {
      return { ok: false, reason: "domain.name mismatch" };
    }
    const fieldsOk = expectMessageFields(typedData, CREATE_GRANT_FIELDS);
    if (!fieldsOk.ok) return fieldsOk;
    if (!isAddress(typedData.message.user)) {
      return { ok: false, reason: "user must be an address" };
    }
    if (!isAddress(typedData.message.builder)) {
      return { ok: false, reason: "builder must be an address" };
    }
    if (
      !Array.isArray(typedData.message.scopes) ||
      typedData.message.scopes.length === 0 ||
      !typedData.message.scopes.every(
        (s: unknown) => typeof s === "string" && s.length > 0,
      )
    ) {
      return { ok: false, reason: "scopes must be non-empty string array" };
    }
    if (typeof typedData.message.expiresAt !== "number") {
      return {
        ok: false,
        reason: "expiresAt must be a number (0 = no expiry)",
      };
    }
    if (typeof typedData.message.nonce !== "number") {
      return { ok: false, reason: "nonce must be a number" };
    }
    return { ok: true };
  },
  summarize(typedData) {
    return {
      purpose: "create_grant",
      user: typedData.message.user,
      builder: typedData.message.builder,
      scopes: typedData.message.scopes,
      expiresAt: typedData.message.expiresAt,
      nonce: typedData.message.nonce,
    };
  },
};

// --- revoke_grant ----------------------------------------------------------

const REVOKE_GRANT_FIELDS = ["grantorAddress", "grantId"] as const;

const revokeGrantValidator: PurposeValidator = {
  validate(typedData) {
    if (typedData.primaryType !== "GrantRevocation") {
      return {
        ok: false,
        reason: `expected primaryType=GrantRevocation, got ${typedData.primaryType}`,
      };
    }
    const fieldsOk = expectMessageFields(typedData, REVOKE_GRANT_FIELDS);
    if (!fieldsOk.ok) return fieldsOk;
    if (!isAddress(typedData.message.grantorAddress)) {
      return { ok: false, reason: "grantorAddress invalid" };
    }
    if (!isBytes32(typedData.message.grantId)) {
      return { ok: false, reason: "grantId must be 32-byte hex" };
    }
    return { ok: true };
  },
  summarize(typedData) {
    return {
      purpose: "revoke_grant",
      grantorAddress: typedData.message.grantorAddress,
      grantId: typedData.message.grantId,
    };
  },
};

// --- registry --------------------------------------------------------------

const VALIDATORS: Record<SigningPurpose, PurposeValidator> = {
  register_personal_server: registerPersonalServerValidator,
  register_personal_server_deregistration: deregisterValidator,
  create_grant: createGrantValidator,
  revoke_grant: revokeGrantValidator,
};

export function getValidator(purpose: SigningPurpose): PurposeValidator {
  return VALIDATORS[purpose];
}

export function isHighRisk(purpose: SigningPurpose): boolean {
  return HIGH_RISK_PURPOSES.has(purpose);
}
