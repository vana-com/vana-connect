import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const TEST_PRIVATE_KEY_PEM = crypto
  .generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

beforeEach(() => {
  process.env.VANA_AUTH_JWT_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
  process.env.VANA_AUTH_JWT_KEY_ID = "test-key-1";
  process.env.VANA_AUTH_JWT_ISSUER = "https://account.vana.org";
  process.env.PRIVY_CUSTOM_AUTH_AUDIENCE = "privy-app-id-abc";
});

describe("GET /.well-known/jwks.json", () => {
  it("publishes the Vana custom-auth public signing key", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({
      kty: "RSA",
      kid: "test-key-1",
      alg: "RS256",
      use: "sig",
    });
    expect(body.keys[0]).toHaveProperty("n");
    expect(body.keys[0]).toHaveProperty("e");
    expect(body.keys[0]).not.toHaveProperty("d");
  });

  it("returns an explicit error when the key is not configured", async () => {
    delete process.env.VANA_AUTH_JWT_PRIVATE_KEY;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: { code: "jwks_not_configured" } });
  });
});
