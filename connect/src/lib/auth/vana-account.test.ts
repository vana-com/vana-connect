import { describe, expect, it } from "vitest";
import {
  buildAccountClaims,
  generateLinkedWalletId,
  generateProviderLinkId,
  generateVanaUserId,
  isVanaUserId,
  normalizeWalletAddress,
  toLinkedWalletRow,
  toProviderLinkRow,
} from "./vana-account";

describe("generateVanaUserId", () => {
  it("returns a vana_user_-prefixed opaque id", () => {
    const id = generateVanaUserId();
    expect(id).toMatch(/^vana_user_[a-f0-9]{32}$/);
    expect(isVanaUserId(id)).toBe(true);
  });

  it("does not derive the id from any wallet address, provider id, or email", () => {
    const wallet = "0xAbCdEf0000000000000000000000000000000001";
    const privySubject = "did:privy:cln1234567890abcdef";
    const email = "user@example.com";

    const ids = new Set<string>();
    for (let i = 0; i < 64; i++) {
      ids.add(generateVanaUserId());
    }

    // 64 fresh ids must all be distinct — proves non-deterministic generation.
    expect(ids.size).toBe(64);

    // None of the generated ids may contain or echo wallet/provider/email evidence.
    for (const id of ids) {
      expect(id.toLowerCase()).not.toContain(wallet.toLowerCase());
      expect(id).not.toContain(privySubject);
      expect(id).not.toContain(email);
      expect(id).not.toContain("@");
      expect(id).not.toContain("0x");
      expect(id).not.toContain("did:privy");
    }
  });
});

describe("normalizeWalletAddress", () => {
  it("lowercases EVM addresses", () => {
    expect(
      normalizeWalletAddress(
        "evm",
        "0xAbCdEf0000000000000000000000000000000001",
      ),
    ).toBe("0xabcdef0000000000000000000000000000000001");
  });

  it("trims whitespace but preserves case for non-EVM chains", () => {
    expect(normalizeWalletAddress("solana", "  Abc123XYZ  ")).toBe("Abc123XYZ");
  });
});

describe("toLinkedWalletRow", () => {
  it("stores wallet address as a linked-wallet claim, not as an account id", () => {
    const userId = generateVanaUserId();
    const row = toLinkedWalletRow({
      id: generateLinkedWalletId(),
      vanaUserId: userId,
      createdAt: new Date("2026-04-28T00:00:00.000Z"),
      wallet: {
        provider: "privy",
        providerWalletId: "privy_wallet_abc",
        chainType: "evm",
        address: "0xAbCdEf0000000000000000000000000000000001",
        isPrimary: true,
        verifiedAt: new Date("2026-04-28T00:00:00.000Z"),
      },
    });

    expect(row.vana_user_id).toBe(userId);
    expect(row.address).toBe("0xabcdef0000000000000000000000000000000001");
    expect(row.provider).toBe("privy");
    expect(row.provider_wallet_id).toBe("privy_wallet_abc");
    expect(row.is_primary).toBe(true);
    expect(row.verified_at).toBe("2026-04-28T00:00:00.000Z");

    // The vana_user_id is the account subject; it must not be the wallet itself.
    expect(row.vana_user_id).not.toBe(row.address);
    expect(row.vana_user_id).not.toContain(row.address);
    expect(row.id).toMatch(/^vana_wallet_[a-f0-9]{32}$/);
  });
});

describe("toProviderLinkRow", () => {
  it("stores provider subject and email as evidence rather than a merge key", () => {
    const userId = generateVanaUserId();
    const row = toProviderLinkRow({
      id: generateProviderLinkId(),
      vanaUserId: userId,
      createdAt: new Date("2026-04-28T00:00:00.000Z"),
      link: {
        provider: "privy",
        providerSubject: "did:privy:cln1234567890abcdef",
        email: "user@example.com",
        metadata: { source: "transitional-privy-native" },
      },
    });

    // Provider id and email live on the provider link. The vana_user_id does
    // not contain them — those values must never be the OIDC subject.
    expect(row.vana_user_id).toBe(userId);
    expect(row.provider_subject).toBe("did:privy:cln1234567890abcdef");
    expect(row.email).toBe("user@example.com");
    expect(row.metadata).toEqual({ source: "transitional-privy-native" });

    expect(row.vana_user_id).not.toBe(row.provider_subject);
    expect(row.vana_user_id).not.toContain(row.provider_subject);
    expect(row.vana_user_id).not.toContain("@");
    expect(row.id).toMatch(/^vana_plink_[a-f0-9]{32}$/);
  });
});

describe("buildAccountClaims", () => {
  it("uses vana_user_id as sub and exposes wallets as linked claims", () => {
    const sub = generateVanaUserId();
    const claims = buildAccountClaims({
      vanaUserId: sub,
      linkedWallets: [
        {
          provider: "privy",
          chainType: "evm",
          address: "0xAbCdEf0000000000000000000000000000000001",
          isPrimary: true,
        },
        {
          provider: "injected",
          chainType: "evm",
          address: "0x0000000000000000000000000000000000000002",
        },
      ],
    });

    expect(claims.sub).toBe(sub);
    expect(claims.sub).toMatch(/^vana_user_/);

    // Wallets must surface as linked-wallet claims, not as the subject.
    expect(claims.linked_wallets).toHaveLength(2);
    expect(claims.linked_wallets[0]).toEqual({
      chain_type: "evm",
      address: "0xabcdef0000000000000000000000000000000001",
      provider: "privy",
      is_primary: true,
    });
    expect(claims.linked_wallets.map((w) => w.address)).not.toContain(
      claims.sub,
    );
  });

  it("only includes email when explicitly provided (no auto-merge by email)", () => {
    const sub = generateVanaUserId();
    const without = buildAccountClaims({
      vanaUserId: sub,
      linkedWallets: [],
    });
    expect(without.email).toBeUndefined();

    const withEmail = buildAccountClaims({
      vanaUserId: sub,
      linkedWallets: [],
      email: "user@example.com",
    });
    expect(withEmail.email).toBe("user@example.com");
    expect(withEmail.sub).toBe(sub);
    expect(withEmail.sub).not.toContain("@");
  });

  it("rejects a non-vana_user_id sub so wallet/provider/email cannot leak in", () => {
    expect(() =>
      buildAccountClaims({
        vanaUserId: "0xAbCdEf0000000000000000000000000000000001",
        linkedWallets: [],
      }),
    ).toThrow(/sub must be a vana_user_id/);

    expect(() =>
      buildAccountClaims({
        vanaUserId: "did:privy:cln1234567890abcdef",
        linkedWallets: [],
      }),
    ).toThrow(/sub must be a vana_user_id/);

    expect(() =>
      buildAccountClaims({
        vanaUserId: "user@example.com",
        linkedWallets: [],
      }),
    ).toThrow(/sub must be a vana_user_id/);
  });
});
