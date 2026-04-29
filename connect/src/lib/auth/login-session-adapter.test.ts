import { describe, expect, it, vi } from "vitest";
import {
  createPrivyLoginSessionAdapter,
  type PrivyVerifiedUser,
  pickEmbeddedEvmWallet,
  pickVerifiedEmail,
  readPrivyIdentityToken,
} from "./login-session-adapter";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("https://account.vana.test/auth/oidc/login", { headers });
}

describe("readPrivyIdentityToken", () => {
  it("prefers Authorization Bearer over cookie", () => {
    const request = makeRequest({
      authorization: "Bearer header-token",
      cookie: "privy-id-token=cookie-token",
    });
    expect(readPrivyIdentityToken(request, "privy-id-token")).toBe(
      "header-token",
    );
  });

  it("falls back to the configured cookie", () => {
    const request = makeRequest({
      cookie: "other=junk; privy-id-token=abc.def.ghi",
    });
    expect(readPrivyIdentityToken(request, "privy-id-token")).toBe(
      "abc.def.ghi",
    );
  });

  it("returns null when neither is present", () => {
    expect(readPrivyIdentityToken(makeRequest(), "privy-id-token")).toBeNull();
  });
});

describe("pickEmbeddedEvmWallet", () => {
  it("selects only Privy-issued embedded ethereum wallets", () => {
    const user: PrivyVerifiedUser = {
      id: "did:privy:abc",
      linked_accounts: [
        {
          type: "wallet",
          chain_type: "ethereum",
          connector_type: "injected",
          address: "0xexternal",
        },
        {
          type: "wallet",
          chain_type: "ethereum",
          connector_type: "embedded",
          wallet_client: "privy",
          wallet_client_type: "privy",
          address: "0xEMBED",
          id: "wallet_123",
        },
      ],
    };
    expect(pickEmbeddedEvmWallet(user)).toEqual({
      chainType: "evm",
      address: "0xEMBED",
      providerWalletId: "wallet_123",
    });
  });

  it("ignores embedded wallets that are not Privy-issued", () => {
    const user: PrivyVerifiedUser = {
      id: "did:privy:abc",
      linked_accounts: [
        {
          type: "wallet",
          chain_type: "ethereum",
          connector_type: "embedded",
          // No wallet_client / wallet_client_type === 'privy'.
          address: "0xOTHER",
        },
      ],
    };
    expect(pickEmbeddedEvmWallet(user)).toBeUndefined();
  });

  it("returns undefined when no embedded wallet exists", () => {
    expect(
      pickEmbeddedEvmWallet({ id: "did:privy:abc", linked_accounts: [] }),
    ).toBeUndefined();
  });
});

describe("pickVerifiedEmail", () => {
  it("returns the email address from linked accounts", () => {
    expect(
      pickVerifiedEmail({
        id: "did:privy:abc",
        linked_accounts: [{ type: "email", address: "user@example.com" }],
      }),
    ).toBe("user@example.com");
  });

  it("falls back to Google OAuth email when no email account is linked", () => {
    expect(
      pickVerifiedEmail({
        id: "did:privy:abc",
        linked_accounts: [{ type: "google_oauth", email: "alice@gmail.com" }],
      }),
    ).toBe("alice@gmail.com");
  });

  it("falls back to Apple OAuth email", () => {
    expect(
      pickVerifiedEmail({
        id: "did:privy:abc",
        linked_accounts: [{ type: "apple_oauth", email: "alice@icloud.com" }],
      }),
    ).toBe("alice@icloud.com");
  });

  it("prefers explicit email account over OAuth email", () => {
    expect(
      pickVerifiedEmail({
        id: "did:privy:abc",
        linked_accounts: [
          { type: "google_oauth", email: "google@example.com" },
          { type: "email", address: "primary@example.com" },
        ],
      }),
    ).toBe("primary@example.com");
  });

  it("returns null when there is no email account", () => {
    expect(
      pickVerifiedEmail({ id: "did:privy:abc", linked_accounts: [] }),
    ).toBeNull();
  });
});

describe("createPrivyLoginSessionAdapter", () => {
  it("returns null when no token is present", async () => {
    const verifyIdentityToken = vi.fn();
    const adapter = createPrivyLoginSessionAdapter({ verifyIdentityToken });

    const evidence = await adapter.resolveLoginEvidence(makeRequest());

    expect(evidence).toBeNull();
    expect(verifyIdentityToken).not.toHaveBeenCalled();
  });

  it("returns null when verification throws", async () => {
    const verifyIdentityToken = vi
      .fn()
      .mockRejectedValue(new Error("invalid token"));
    const adapter = createPrivyLoginSessionAdapter({ verifyIdentityToken });

    const evidence = await adapter.resolveLoginEvidence(
      makeRequest({ cookie: "privy-id-token=bad" }),
    );

    expect(evidence).toBeNull();
    expect(verifyIdentityToken).toHaveBeenCalledWith("bad");
  });

  it("derives privySubject, email, and embedded wallet from a verified user", async () => {
    const verifyIdentityToken = vi.fn().mockResolvedValue({
      id: "did:privy:user-1",
      linked_accounts: [
        { type: "email", address: "alice@example.com" },
        {
          type: "wallet",
          chain_type: "ethereum",
          connector_type: "embedded",
          wallet_client_type: "privy",
          address: "0xAaA",
          id: "wallet_42",
        },
      ],
    } satisfies PrivyVerifiedUser);

    const adapter = createPrivyLoginSessionAdapter({ verifyIdentityToken });
    const evidence = await adapter.resolveLoginEvidence(
      makeRequest({ authorization: "Bearer test.token" }),
    );

    expect(evidence).toEqual({
      privySubject: "did:privy:user-1",
      email: "alice@example.com",
      embeddedWallet: {
        chainType: "evm",
        address: "0xAaA",
        providerWalletId: "wallet_42",
      },
    });
    expect(verifyIdentityToken).toHaveBeenCalledWith("test.token");
  });

  it("omits email and wallet when the user has neither", async () => {
    const verifyIdentityToken = vi.fn().mockResolvedValue({
      id: "did:privy:user-2",
      linked_accounts: [],
    } satisfies PrivyVerifiedUser);

    const adapter = createPrivyLoginSessionAdapter({ verifyIdentityToken });
    const evidence = await adapter.resolveLoginEvidence(
      makeRequest({ cookie: "privy-id-token=t" }),
    );

    expect(evidence).toEqual({ privySubject: "did:privy:user-2" });
  });

  it("uses a custom cookie name when provided", async () => {
    const verifyIdentityToken = vi.fn().mockResolvedValue({
      id: "did:privy:user-3",
      linked_accounts: [],
    } satisfies PrivyVerifiedUser);

    const adapter = createPrivyLoginSessionAdapter({
      verifyIdentityToken,
      cookieName: "vana-session-id-token",
    });
    const evidence = await adapter.resolveLoginEvidence(
      makeRequest({ cookie: "vana-session-id-token=alt" }),
    );

    expect(evidence?.privySubject).toBe("did:privy:user-3");
    expect(verifyIdentityToken).toHaveBeenCalledWith("alt");
  });
});
