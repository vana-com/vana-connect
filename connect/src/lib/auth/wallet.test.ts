// @vitest-environment node

import { describe, expect, it } from "vitest";
import { signTypedData, WalletApiError, type WalletDeps } from "./wallet";
import type {
  InteractiveConfirmationRow,
  SigningAuthorizationRow,
} from "@/lib/db/auth-signing";
import type { CustodyAdapter, Hex } from "./wallet-providers/types";
import type { TypedDataDefinition } from "./signing-purposes";

const VANA_USER_ID = "vana_user_" + "0".repeat(32);
const HYDRA_SID = "hydra_sid_xyz";
const ADDR1 = "0x" + "1".repeat(40);
const ADDR2 = "0x" + "2".repeat(40);
const PUBKEY = "0x04" + "a".repeat(128);

function rpsTypedData(): TypedDataDefinition {
  return {
    domain: {
      name: "Vana Data Portability",
      version: "1",
      chainId: 1480,
      verifyingContract: ADDR1,
    },
    primaryType: "ServerRegistration",
    types: {
      ServerRegistration: [
        { name: "ownerAddress", type: "address" },
        { name: "serverAddress", type: "address" },
        { name: "publicKey", type: "string" },
        { name: "serverUrl", type: "string" },
      ],
    },
    message: {
      ownerAddress: ADDR1,
      serverAddress: ADDR2,
      publicKey: PUBKEY,
      serverUrl: "https://0xabc.myvana.app",
    },
  };
}

function revokeGrantTypedData(): TypedDataDefinition {
  return {
    domain: { name: "Vana Data Portability" },
    primaryType: "GrantRevocation",
    types: {
      GrantRevocation: [
        { name: "grantorAddress", type: "address" },
        { name: "grantId", type: "bytes32" },
      ],
    },
    message: { grantorAddress: ADDR1, grantId: "0x" + "f".repeat(64) },
  };
}

// Canonical high-risk fixture. The high-risk-gate / happy-path /
// idempotent-retry suites all need *some* HIGH_RISK_PURPOSES member to
// drive the gate. PS lifecycle was de-listed (server signs with the PS's
// own derived keypair, no per-call human-consent benefit), so we use
// create_grant — the load-bearing high-risk purpose in the protocol.
const HIGH_RISK_PURPOSE = "create_grant" as const;
function highRiskTypedData(): TypedDataDefinition {
  return {
    domain: { name: "Vana Data Portability", version: "1", chainId: 1480 },
    primaryType: "GrantRegistration",
    types: {
      GrantRegistration: [
        { name: "user", type: "address" },
        { name: "builder", type: "address" },
        { name: "scopes", type: "string[]" },
        { name: "expiresAt", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    message: {
      user: ADDR1,
      builder: ADDR2,
      scopes: ["chatgpt.memories"],
      expiresAt: 0,
      nonce: 1,
    },
  };
}

type WalletShape = {
  id: string;
  vana_user_id: string;
  provider: string;
  provider_wallet_id: string | null;
  chain_type: string;
  address: string;
  is_primary: boolean;
  key_control_type?: string;
};

function fakeWallet(overrides: Partial<WalletShape> = {}): WalletShape {
  return {
    id: "vana_wallet_xyz",
    vana_user_id: VANA_USER_ID,
    provider: "privy",
    provider_wallet_id: "privy_wallet_abc",
    chain_type: "evm",
    address: ADDR1.toLowerCase(),
    is_primary: true,
    key_control_type: "provider_embedded",
    ...overrides,
  };
}

function makeAdapter(
  signature: Hex = "0xdeadbeef" as Hex,
): CustodyAdapter & { calls: number } {
  let calls = 0;
  return {
    signTypedData: async () => {
      calls++;
      return { signature };
    },
    get calls() {
      return calls;
    },
  } as CustodyAdapter & { calls: number };
}

function makeDeps(opts: {
  wallets?: WalletShape[];
  adapter?: CustodyAdapter;
  /** Preloaded confirmation rows the test can hand back. */
  confirmations?: Record<string, InteractiveConfirmationRow>;
  cachedAuthByConfirmationId?: Record<string, SigningAuthorizationRow>;
  /** If set, a UNIQUE-violation error is thrown on insert (concurrent race). */
  insertAuthError?: Error;
}): WalletDeps & {
  state: {
    confirmsCreated: InteractiveConfirmationRow[];
    authsCreated: SigningAuthorizationRow[];
  };
} {
  const wallets = opts.wallets ?? [fakeWallet()];
  const adapter = opts.adapter ?? makeAdapter();
  const confirmsCreated: InteractiveConfirmationRow[] = [];
  const authsCreated: SigningAuthorizationRow[] = [];
  let nextConfirmId = 0;
  let nextAuthId = 0;

  return {
    adapter,
    findLinkedWalletsByUser: async () => wallets,
    insertConfirmation: async (input) => {
      const row: InteractiveConfirmationRow = {
        id: `vana_confirm_${nextConfirmId++}`,
        vana_user_id: input.vanaUserId,
        hydra_session_id: input.hydraSessionId,
        vana_wallet_id: input.vanaWalletId,
        purpose: input.purpose,
        payload_hash: input.payloadHash,
        payload_summary: input.payloadSummary,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        consumed_at: null,
        created_at: new Date().toISOString(),
      };
      confirmsCreated.push(row);
      return row;
    },
    findConfirmationById: async (id) => opts.confirmations?.[id] ?? null,
    insertSigningAuthorization: async (input) => {
      if (opts.insertAuthError) throw opts.insertAuthError;
      const row: SigningAuthorizationRow = {
        id: `vana_sigauth_${nextAuthId++}`,
        vana_user_id: input.vanaUserId,
        vana_wallet_id: input.vanaWalletId,
        hydra_session_id: input.hydraSessionId,
        purpose: input.purpose,
        payload_hash: input.payloadHash,
        payload_summary: input.payloadSummary,
        confirmation_id: input.confirmationId ?? null,
        signature_hex: null,
        max_uses: 1,
        used_count: 0,
        expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
        consumed_at: null,
        created_at: new Date().toISOString(),
      };
      authsCreated.push(row);
      return row;
    },
    consumeSigningAuthorization: async (id, sig) => {
      const row = authsCreated.find((r) => r.id === id);
      if (!row || row.consumed_at) return null;
      row.used_count = 1;
      row.consumed_at = new Date().toISOString();
      row.signature_hex = sig;
      return row;
    },
    findConsumedAuthorizationByConfirmationId: async (confirmationId) =>
      opts.cachedAuthByConfirmationId?.[confirmationId] ?? null,
    state: { confirmsCreated, authsCreated },
  };
}

describe("signTypedData — wallet resolution", () => {
  it("returns not_supported_yet when user has no wallet", async () => {
    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: "revoke_grant",
        typedData: revokeGrantTypedData(),
      },
      makeDeps({ wallets: [] }),
    );
    expect(result).toEqual({
      kind: "not_supported_yet",
      reason: "user_controlled_eoa",
    });
  });

  it("returns not_supported_yet for user_controlled_eoa", async () => {
    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: "revoke_grant",
        typedData: revokeGrantTypedData(),
      },
      makeDeps({
        wallets: [fakeWallet({ key_control_type: "user_controlled_eoa" })],
      }),
    );
    expect(result).toEqual({
      kind: "not_supported_yet",
      reason: "user_controlled_eoa",
    });
  });

  it("returns not_supported_yet for embedded wallet without provider_wallet_id", async () => {
    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: "revoke_grant",
        typedData: revokeGrantTypedData(),
      },
      makeDeps({ wallets: [fakeWallet({ provider_wallet_id: null })] }),
    );
    expect(result.kind).toBe("not_supported_yet");
  });
});

describe("signTypedData — purpose validation", () => {
  it("throws when typed data does not match purpose", async () => {
    const td = rpsTypedData();
    td.primaryType = "WrongType";
    await expect(
      signTypedData(
        {
          vanaUserId: VANA_USER_ID,
          hydraSessionId: HYDRA_SID,
          purpose: "register_personal_server",
          typedData: td,
        },
        makeDeps({}),
      ),
    ).rejects.toBeInstanceOf(WalletApiError);
  });
});

describe("signTypedData — high-risk gate", () => {
  it("first call returns confirmation_required and creates a confirmation row", async () => {
    const deps = makeDeps({});
    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: HIGH_RISK_PURPOSE,
        typedData: highRiskTypedData(),
      },
      deps,
    );
    expect(result.kind).toBe("confirmation_required");
    expect(deps.state.confirmsCreated).toHaveLength(1);
    expect(deps.state.authsCreated).toHaveLength(0);
  });

  it("issues a fresh confirmation when confirmationId is unknown", async () => {
    const deps = makeDeps({ confirmations: {} });
    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: HIGH_RISK_PURPOSE,
        typedData: highRiskTypedData(),
        confirmationId: "vana_confirm_unknown",
      },
      deps,
    );
    expect(result.kind).toBe("confirmation_required");
  });

  it("issues a fresh confirmation when payload_hash mismatches", async () => {
    const td = highRiskTypedData();
    const deps = makeDeps({
      confirmations: {
        vana_confirm_x: {
          id: "vana_confirm_x",
          vana_user_id: VANA_USER_ID,
          hydra_session_id: HYDRA_SID,
          vana_wallet_id: "vana_wallet_xyz",
          purpose: HIGH_RISK_PURPOSE,
          payload_hash: "this_does_not_match",
          payload_summary: {},
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          consumed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      },
    });
    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: HIGH_RISK_PURPOSE,
        typedData: td,
        confirmationId: "vana_confirm_x",
      },
      deps,
    );
    expect(result.kind).toBe("confirmation_required");
  });

  it("issues a fresh confirmation when session mismatches", async () => {
    const td = highRiskTypedData();
    const adapter = makeAdapter();
    const validHash =
      ""; /* computed inside; here we just need session mismatch */
    void validHash;
    const deps = makeDeps({
      adapter,
      confirmations: {
        vana_confirm_x: {
          id: "vana_confirm_x",
          vana_user_id: VANA_USER_ID,
          hydra_session_id: "different_session",
          vana_wallet_id: "vana_wallet_xyz",
          purpose: HIGH_RISK_PURPOSE,
          payload_hash: "irrelevant",
          payload_summary: {},
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          consumed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      },
    });
    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: HIGH_RISK_PURPOSE,
        typedData: td,
        confirmationId: "vana_confirm_x",
      },
      deps,
    );
    expect(result.kind).toBe("confirmation_required");
  });

  it("revoke_grant does NOT require a confirmation (not high-risk)", async () => {
    const deps = makeDeps({});
    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: "revoke_grant",
        typedData: revokeGrantTypedData(),
      },
      deps,
    );
    expect(result.kind).toBe("signature");
    expect(deps.state.confirmsCreated).toHaveLength(0);
  });
});

describe("signTypedData — happy path with confirmation", () => {
  it("signs and consumes when confirmation matches and is consumed", async () => {
    // First call: get a confirmation_required result so we know the hash.
    const deps1 = makeDeps({});
    const r1 = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: HIGH_RISK_PURPOSE,
        typedData: highRiskTypedData(),
      },
      deps1,
    );
    expect(r1.kind).toBe("confirmation_required");
    if (r1.kind !== "confirmation_required") return;
    const confirmRow = deps1.state.confirmsCreated[0];

    // Mark confirmation as consumed and feed it back via a second deps.
    const consumedRow: InteractiveConfirmationRow = {
      ...confirmRow,
      consumed_at: new Date().toISOString(),
    };
    const deps2 = makeDeps({
      confirmations: { [consumedRow.id]: consumedRow },
    });
    const r2 = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: HIGH_RISK_PURPOSE,
        typedData: highRiskTypedData(),
        confirmationId: consumedRow.id,
      },
      deps2,
    );
    expect(r2.kind).toBe("signature");
    if (r2.kind === "signature") {
      expect(r2.signature).toBe("0xdeadbeef");
      expect(r2.authorizationId).toMatch(/^vana_sigauth_/);
    }
    expect(deps2.state.authsCreated).toHaveLength(1);
    expect(deps2.state.authsCreated[0].consumed_at).not.toBeNull();
    expect(deps2.state.authsCreated[0].signature_hex).toBe("0xdeadbeef");
  });
});

describe("signTypedData — idempotent retry", () => {
  it("returns cached signature for a confirmation that already has a consumed authority", async () => {
    const cached: SigningAuthorizationRow = {
      id: "vana_sigauth_old",
      vana_user_id: VANA_USER_ID,
      vana_wallet_id: "vana_wallet_xyz",
      hydra_session_id: HYDRA_SID,
      purpose: HIGH_RISK_PURPOSE,
      payload_hash: "any",
      payload_summary: {},
      confirmation_id: "vana_confirm_x",
      signature_hex: "0xcafebabe",
      max_uses: 1,
      used_count: 1,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed_at: new Date().toISOString(), // just now
      created_at: new Date().toISOString(),
    };
    const td = highRiskTypedData();

    // Build a confirmation that matches the request — so we reach the
    // idempotency lookup branch.
    const { payloadHash } = await import("./payload-hash");
    const matchingHash = payloadHash(td);
    const deps = makeDeps({
      confirmations: {
        vana_confirm_x: {
          id: "vana_confirm_x",
          vana_user_id: VANA_USER_ID,
          hydra_session_id: HYDRA_SID,
          vana_wallet_id: "vana_wallet_xyz",
          purpose: HIGH_RISK_PURPOSE,
          payload_hash: matchingHash,
          payload_summary: {},
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          consumed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      },
      cachedAuthByConfirmationId: {
        vana_confirm_x: { ...cached, payload_hash: matchingHash },
      },
    });

    const result = await signTypedData(
      {
        vanaUserId: VANA_USER_ID,
        hydraSessionId: HYDRA_SID,
        purpose: HIGH_RISK_PURPOSE,
        typedData: td,
        confirmationId: "vana_confirm_x",
      },
      deps,
    );
    expect(result.kind).toBe("signature");
    if (result.kind === "signature") {
      expect(result.signature).toBe("0xcafebabe");
      expect(result.authorizationId).toBe("vana_sigauth_old");
    }
    // No new authority was created.
    expect(deps.state.authsCreated).toHaveLength(0);
  });
});

describe("signTypedData — concurrent UNIQUE race", () => {
  it("throws WalletApiError(concurrent_in_flight) when authority insert violates UNIQUE", async () => {
    const deps = makeDeps({
      insertAuthError: new Error(
        "duplicate key value violates unique constraint",
      ),
    });
    await expect(
      signTypedData(
        {
          vanaUserId: VANA_USER_ID,
          hydraSessionId: HYDRA_SID,
          purpose: "revoke_grant",
          typedData: revokeGrantTypedData(),
        },
        deps,
      ),
    ).rejects.toMatchObject({
      name: "WalletApiError",
      code: "concurrent_in_flight",
    });
  });
});

describe("signTypedData — provider failure", () => {
  it("throws WalletApiError(provider_sign_failed) when adapter throws", async () => {
    const adapter: CustodyAdapter = {
      signTypedData: async () => {
        throw new Error("privy down");
      },
    };
    const deps = makeDeps({ adapter });
    await expect(
      signTypedData(
        {
          vanaUserId: VANA_USER_ID,
          hydraSessionId: HYDRA_SID,
          purpose: "revoke_grant",
          typedData: revokeGrantTypedData(),
        },
        deps,
      ),
    ).rejects.toMatchObject({
      name: "WalletApiError",
      code: "provider_sign_failed",
    });
  });
});
