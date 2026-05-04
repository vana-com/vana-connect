import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { LoginEvidence } from "./login-session-adapter";
import {
  assertCustomAuthMigrationConfirmed,
  assertPrivyCustomAuthBinding,
  assertVanaCustomAuthSubject,
  buildPrivyCustomAuthInput,
  buildVanaCustomAuthClaims,
  buildVanaCustomAuthJwks,
  createVanaCustomAuthJwt,
  inspectVanaCustomAuthJwtConfig,
  type PrivyCustomAuthClient,
  type PrivyCustomAuthResult,
  signVanaCustomAuthJwt,
} from "./privy-custom-auth";
import { generateVanaUserId } from "./vana-account";

const TEST_PRIVATE_KEY_PEM = crypto
  .generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

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

describe("Vana custom-auth JWT issuer", () => {
  it("inspects config readiness without returning private key material", () => {
    expect(
      inspectVanaCustomAuthJwtConfig({
        VANA_AUTH_JWT_PRIVATE_KEY: TEST_PRIVATE_KEY_PEM,
        VANA_AUTH_JWT_KEY_ID: "test-key-1",
        VANA_AUTH_JWT_ISSUER: "https://account.vana.org",
        PRIVY_CUSTOM_AUTH_AUDIENCE: "privy-app-id-abc",
      }),
    ).toEqual({
      ready: true,
      missing: [],
      keyId: "test-key-1",
      issuer: "https://account.vana.org",
      audience: "privy-app-id-abc",
      publicKeyReady: true,
    });
  });

  it("reports missing custom-auth JWT env without throwing", () => {
    expect(inspectVanaCustomAuthJwtConfig({})).toEqual({
      ready: false,
      missing: [
        "VANA_AUTH_JWT_PRIVATE_KEY",
        "VANA_AUTH_JWT_KEY_ID",
        "VANA_AUTH_JWT_ISSUER",
        "PRIVY_CUSTOM_AUTH_AUDIENCE",
      ],
      publicKeyReady: false,
    });
  });

  it("reports invalid private key config without returning the key", () => {
    const result = inspectVanaCustomAuthJwtConfig({
      VANA_AUTH_JWT_PRIVATE_KEY: "not-a-key",
      VANA_AUTH_JWT_KEY_ID: "test-key-1",
      VANA_AUTH_JWT_ISSUER: "https://account.vana.org",
      PRIVY_CUSTOM_AUTH_AUDIENCE: "privy-app-id-abc",
    });

    expect(result).toMatchObject({
      ready: false,
      missing: [],
      publicKeyReady: false,
    });
    expect(JSON.stringify(result)).not.toContain("not-a-key");
  });

  it("signs a JWT that verifies against the published JWKS", () => {
    const vanaUserId = generateVanaUserId();
    const token = createVanaCustomAuthJwt({
      vanaUserId,
      now: new Date("2026-04-28T00:00:00.000Z"),
      config: {
        privateKeyPem: TEST_PRIVATE_KEY_PEM,
        keyId: "test-key-1",
        issuer: "https://account.vana.org",
        audience: "privy-app-id-abc",
        ttlSeconds: 300,
      },
    });
    const jwks = buildVanaCustomAuthJwks({
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
      keyId: "test-key-1",
    });

    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    const header = parseJwtPart(encodedHeader);
    const payload = parseJwtPart(encodedPayload);
    const publicKey = crypto.createPublicKey({
      key: jwks.keys[0] as crypto.JsonWebKey,
      format: "jwk",
    });
    const verified = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      publicKey,
      base64UrlDecode(encodedSignature),
    );

    expect(verified).toBe(true);
    expect(header).toMatchObject({ alg: "RS256", kid: "test-key-1" });
    expect(payload).toEqual({
      sub: vanaUserId,
      iss: "https://account.vana.org",
      aud: "privy-app-id-abc",
      iat: 1777334400,
      exp: 1777334700,
    });
  });

  it("rejects a wrong subject before signing", () => {
    expect(() =>
      createVanaCustomAuthJwt({
        vanaUserId: "did:privy:cln1234567890abcdef",
        config: {
          privateKeyPem: TEST_PRIVATE_KEY_PEM,
          keyId: "test-key-1",
          issuer: "https://account.vana.org",
          audience: "privy-app-id-abc",
        },
      }),
    ).toThrow(/vana_user_id/);
  });

  it("rejects bad exp claims before signing", () => {
    const issuedAt = Math.floor(
      new Date("2026-04-28T00:00:00.000Z").getTime() / 1000,
    );

    expect(() =>
      signVanaCustomAuthJwt({
        privateKeyPem: TEST_PRIVATE_KEY_PEM,
        keyId: "test-key-1",
        claims: {
          sub: generateVanaUserId(),
          iss: "https://account.vana.org",
          aud: "privy-app-id-abc",
          iat: issuedAt,
          exp: issuedAt,
        },
      }),
    ).toThrow(/exp must be after iat/);
  });

  it("publishes public JWKS fields only", () => {
    const jwks = buildVanaCustomAuthJwks({
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
      keyId: "test-key-1",
    });
    const key = jwks.keys[0];

    expect(key).toMatchObject({
      kty: "RSA",
      kid: "test-key-1",
      alg: "RS256",
      use: "sig",
    });
    expect(key).toHaveProperty("n");
    expect(key).toHaveProperty("e");
    expect(key).not.toHaveProperty("d");
    expect(key).not.toHaveProperty("p");
    expect(key).not.toHaveProperty("q");
    expect(key).not.toHaveProperty("dp");
    expect(key).not.toHaveProperty("dq");
    expect(key).not.toHaveProperty("qi");
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

function parseJwtPart(value: string | undefined): Record<string, unknown> {
  if (!value) throw new Error("JWT part is missing");
  return JSON.parse(base64UrlDecode(value).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function base64UrlDecode(value: string | undefined): Buffer {
  if (!value) throw new Error("JWT part is missing");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(normalized, "base64");
}
