import { describe, expect, it, vi } from "vitest";
import type { LoginEvidence } from "./login-session-adapter";
import {
  assertCustomAuthMigrationConfirmed,
  assertPrivyCustomAuthBinding,
  assertVanaCustomAuthSubject,
  buildPrivyCustomAuthInput,
  buildVanaCustomAuthClaims,
  type PrivyCustomAuthClient,
  type PrivyCustomAuthResult,
} from "./privy-custom-auth";
import { generateVanaUserId } from "./vana-account";

describe("assertVanaCustomAuthSubject", () => {
  it("accepts an opaque vana_user_id", () => {
    expect(() =>
      assertVanaCustomAuthSubject(generateVanaUserId()),
    ).not.toThrow();
  });

  it("rejects a Privy native DID", () => {
    expect(() =>
      assertVanaCustomAuthSubject("did:privy:cln1234567890abcdef"),
    ).toThrow(/Privy native subject/);
  });

  it("rejects a raw EVM wallet address", () => {
    expect(() =>
      assertVanaCustomAuthSubject("0xAbCdEf0000000000000000000000000000000001"),
    ).toThrow(/EVM wallet address/);
  });

  it("rejects an email address", () => {
    expect(() => assertVanaCustomAuthSubject("alice@example.com")).toThrow(
      /email address/,
    );
  });

  it("rejects empty / arbitrary strings", () => {
    expect(() => assertVanaCustomAuthSubject("")).toThrow(/vana_user_id/);
    expect(() => assertVanaCustomAuthSubject("user_123")).toThrow(
      /vana_user_id/,
    );
  });
});

describe("buildVanaCustomAuthClaims", () => {
  const validInput = () => ({
    vanaUserId: generateVanaUserId(),
    issuer: "https://account.vana.org",
    audience: "privy-app-id-abc",
    issuedAt: new Date("2026-04-28T00:00:00.000Z"),
    expiresAt: new Date("2026-04-28T00:05:00.000Z"),
  });

  it("returns claims with sub set to the vana_user_id", () => {
    const input = validInput();
    const claims = buildVanaCustomAuthClaims(input);
    expect(claims.sub).toBe(input.vanaUserId);
    expect(claims.sub).toMatch(/^vana_user_/);
    expect(claims.iss).toBe(input.issuer);
    expect(claims.aud).toBe(input.audience);
    expect(claims.iat).toBe(Math.floor(input.issuedAt.getTime() / 1000));
    expect(claims.exp).toBe(Math.floor(input.expiresAt.getTime() / 1000));
  });

  it("rejects a Privy native DID as sub", () => {
    expect(() =>
      buildVanaCustomAuthClaims({
        ...validInput(),
        vanaUserId: "did:privy:cln1234567890abcdef",
      }),
    ).toThrow(/vana_user_id/);
  });

  it("rejects a wallet address as sub", () => {
    expect(() =>
      buildVanaCustomAuthClaims({
        ...validInput(),
        vanaUserId: "0xAbCdEf0000000000000000000000000000000001",
      }),
    ).toThrow(/vana_user_id/);
  });

  it("rejects an email as sub", () => {
    expect(() =>
      buildVanaCustomAuthClaims({
        ...validInput(),
        vanaUserId: "alice@example.com",
      }),
    ).toThrow(/vana_user_id/);
  });

  it("requires non-empty issuer and audience", () => {
    expect(() =>
      buildVanaCustomAuthClaims({ ...validInput(), issuer: "" }),
    ).toThrow(/issuer/);
    expect(() =>
      buildVanaCustomAuthClaims({ ...validInput(), audience: "" }),
    ).toThrow(/audience/);
  });

  it("rejects a non-positive token lifetime", () => {
    const at = new Date("2026-04-28T00:00:00.000Z");
    expect(() =>
      buildVanaCustomAuthClaims({
        ...validInput(),
        issuedAt: at,
        expiresAt: at,
      }),
    ).toThrow(/exp must be after iat/);
  });
});

describe("buildPrivyCustomAuthInput", () => {
  it("forwards the Vana account id without echoing Privy native evidence", () => {
    const vanaUserId = generateVanaUserId();
    const input = buildPrivyCustomAuthInput({
      vanaUserId,
      vanaJwt: "header.payload.signature",
    });
    expect(input.vanaUserId).toBe(vanaUserId);
    expect(input.vanaJwt).toBe("header.payload.signature");
  });

  it("rejects a Privy native subject as the custom-auth identifier", () => {
    expect(() =>
      buildPrivyCustomAuthInput({
        vanaUserId: "did:privy:cln1234567890abcdef",
        vanaJwt: "h.p.s",
      }),
    ).toThrow(/vana_user_id/);
  });

  it("rejects an empty JWT", () => {
    expect(() =>
      buildPrivyCustomAuthInput({
        vanaUserId: generateVanaUserId(),
        vanaJwt: "",
      }),
    ).toThrow(/signed Vana JWT/);
  });
});

describe("assertPrivyCustomAuthBinding", () => {
  it("passes when Privy echoes the Vana account id as customAuthUserId", () => {
    const vanaUserId = generateVanaUserId();
    expect(() =>
      assertPrivyCustomAuthBinding({
        expectedVanaUserId: vanaUserId,
        result: {
          privyUserId: "did:privy:newuser",
          customAuthUserId: vanaUserId,
        },
      }),
    ).not.toThrow();
  });

  it("rejects a result whose customAuthUserId is the Privy native DID", () => {
    const vanaUserId = generateVanaUserId();
    expect(() =>
      assertPrivyCustomAuthBinding({
        expectedVanaUserId: vanaUserId,
        result: {
          privyUserId: "did:privy:user",
          customAuthUserId: "did:privy:user",
        },
      }),
    ).toThrow(/did not echo the Vana account id/);
  });

  it("rejects a result missing privyUserId", () => {
    const vanaUserId = generateVanaUserId();
    expect(() =>
      assertPrivyCustomAuthBinding({
        expectedVanaUserId: vanaUserId,
        result: {
          privyUserId: "",
          customAuthUserId: vanaUserId,
        },
      }),
    ).toThrow(/privyUserId/);
  });

  it("rejects a result whose customAuthUserId is a wallet address", () => {
    const vanaUserId = generateVanaUserId();
    expect(() =>
      assertPrivyCustomAuthBinding({
        expectedVanaUserId: vanaUserId,
        result: {
          privyUserId: "did:privy:user",
          customAuthUserId: "0xAbCdEf0000000000000000000000000000000001",
        },
      }),
    ).toThrow(/did not echo the Vana account id/);
  });
});

describe("assertCustomAuthMigrationConfirmed", () => {
  const evidence: LoginEvidence = {
    privySubject: "did:privy:legacy-user",
    email: "user@example.com",
    embeddedWallet: {
      chainType: "evm",
      address: "0xabcdef0000000000000000000000000000000001",
      providerWalletId: "wallet_legacy",
    },
  };

  it("throws when migrationConfirmed is false (default safe behavior)", () => {
    expect(() =>
      assertCustomAuthMigrationConfirmed({
        evidence,
        migrationConfirmed: false,
      }),
    ).toThrow(/confirmed migration/);
  });

  it("passes when migrationConfirmed is true (caller has linked the user)", () => {
    expect(() =>
      assertCustomAuthMigrationConfirmed({
        evidence,
        migrationConfirmed: true,
      }),
    ).not.toThrow();
  });
});

describe("PrivyCustomAuthClient contract", () => {
  it("uses an injected client without calling Privy directly", async () => {
    const vanaUserId = generateVanaUserId();
    const fakeClient: PrivyCustomAuthClient = {
      authenticate: vi.fn(
        async (input): Promise<PrivyCustomAuthResult> => ({
          privyUserId: "did:privy:fake",
          customAuthUserId: input.vanaUserId,
        }),
      ),
    };

    const callInput = buildPrivyCustomAuthInput({
      vanaUserId,
      vanaJwt: "h.p.s",
    });
    const result = await fakeClient.authenticate(callInput);

    expect(fakeClient.authenticate).toHaveBeenCalledWith(callInput);
    assertPrivyCustomAuthBinding({
      expectedVanaUserId: vanaUserId,
      result,
    });
    expect(result.customAuthUserId).toBe(vanaUserId);
    expect(result.privyUserId).not.toBe(vanaUserId);
  });
});
