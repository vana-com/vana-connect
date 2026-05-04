import { describe, expect, it } from "vitest";
import {
  createAccountLoginSessionToken,
  resolveAccountLoginSessionSecret,
  verifyAccountLoginSessionToken,
} from "./account-login-session";

describe("account login session", () => {
  it("round-trips verified login evidence", () => {
    const token = createAccountLoginSessionToken(
      {
        privySubject: "did:privy:user-1",
        email: "alice@example.com",
        embeddedWallet: {
          chainType: "evm",
          address: "0xabc",
          providerWalletId: "wallet-1",
        },
      },
      { secret: "test-secret", nowMs: 1000, ttlMs: 5000 },
    );

    expect(
      verifyAccountLoginSessionToken(token, {
        secret: "test-secret",
        nowMs: 2000,
      }),
    ).toEqual({
      privySubject: "did:privy:user-1",
      email: "alice@example.com",
      embeddedWallet: {
        chainType: "evm",
        address: "0xabc",
        providerWalletId: "wallet-1",
      },
    });
  });

  it("rejects tampered tokens", () => {
    const token = createAccountLoginSessionToken(
      { privySubject: "did:privy:user-1" },
      { secret: "test-secret", nowMs: 1000, ttlMs: 5000 },
    );

    expect(
      verifyAccountLoginSessionToken(`${token}x`, {
        secret: "test-secret",
        nowMs: 2000,
      }),
    ).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = createAccountLoginSessionToken(
      { privySubject: "did:privy:user-1" },
      { secret: "test-secret", nowMs: 1000, ttlMs: 5000 },
    );

    expect(
      verifyAccountLoginSessionToken(token, {
        secret: "test-secret",
        nowMs: 7000,
      }),
    ).toBeNull();
  });

  it("prefers explicit account session secret over provider secret fallback", () => {
    expect(
      resolveAccountLoginSessionSecret({
        ACCOUNT_LOGIN_SESSION_SECRET: "account-secret",
        PRIVY_APP_SECRET: "privy-secret",
      }),
    ).toBe("account-secret");
    expect(
      resolveAccountLoginSessionSecret({
        PRIVY_APP_SECRET: "privy-secret",
      }),
    ).toBe("privy-secret");
  });
});
