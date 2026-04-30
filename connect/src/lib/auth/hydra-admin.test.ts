import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGoogleIdTokenCacheForTests } from "./google-id-token";
import {
  buildHydraSessionClaims,
  createHydraAdminClient,
  type HydraAdminError,
} from "./hydra-admin";

const VANA_USER_ID = "vana_user_0123456789abcdef0123456789abcdef";

afterEach(() => {
  clearGoogleIdTokenCacheForTests();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("createHydraAdminClient", () => {
  it("fetches login requests using the Hydra admin API", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        client: { client_id: "memory-app" },
        requested_scope: ["openid"],
      }),
    );
    const client = createHydraAdminClient({
      adminUrl: "https://hydra-admin.example.com/",
      fetch: fetchImpl,
    });

    const request = await client.getLoginRequest("login/challenge?");

    expect(request.client?.client_id).toBe("memory-app");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://hydra-admin.example.com/admin/oauth2/auth/requests/login?login_challenge=login%2Fchallenge%3F",
      {
        body: undefined,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        method: "GET",
      },
    );
  });

  it("adds a Google ID token when service account credentials are configured", async () => {
    clearGoogleIdTokenCacheForTests();
    const privateKey = crypto
      .generateKeyPairSync("rsa", {
        modulusLength: 2048,
      })
      .privateKey.export({ format: "pem", type: "pkcs8" }) as string;
    vi.stubEnv(
      "GCP_SERVICE_ACCOUNT_KEY",
      JSON.stringify({
        client_email: "hydra-admin-caller@example.iam.gserviceaccount.com",
        private_key: privateKey,
      }),
    );
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ id_token: "google-id-token" });
      }
      return jsonResponse({
        client: { client_id: "memory-app" },
        requested_scope: ["openid"],
      });
    });
    const client = createHydraAdminClient({
      adminUrl: "https://hydra-admin.example.com",
      fetch: fetchImpl,
    });

    await client.getLoginRequest("login-challenge");

    const [, tokenRequest] = fetchImpl.mock.calls[0] ?? [];
    expect(tokenRequest?.body).toBeInstanceOf(URLSearchParams);
    expect((tokenRequest?.body as URLSearchParams).get("assertion")).toEqual(
      expect.any(String),
    );
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://hydra-admin.example.com/admin/oauth2/auth/requests/login?login_challenge=login-challenge",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer google-id-token",
        }),
      }),
    );
  });

  it("can use a separate Google ID token audience for Cloud Run admin calls", async () => {
    clearGoogleIdTokenCacheForTests();
    const privateKey = crypto
      .generateKeyPairSync("rsa", {
        modulusLength: 2048,
      })
      .privateKey.export({ format: "pem", type: "pkcs8" }) as string;
    vi.stubEnv(
      "GCP_SERVICE_ACCOUNT_KEY",
      JSON.stringify({
        client_email: "hydra-admin-caller@example.iam.gserviceaccount.com",
        private_key: privateKey,
      }),
    );
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ id_token: "google-id-token" });
      }
      return jsonResponse({
        client: { client_id: "memory-app" },
        requested_scope: ["openid"],
      });
    });
    const client = createHydraAdminClient({
      adminAudience: "https://ory-hydra-admin-development.run.app/",
      adminUrl: "https://oauth-admin-dev.vana.org",
      fetch: fetchImpl,
    });

    await client.getLoginRequest("login-challenge");

    const [[, tokenRequest]] = fetchImpl.mock.calls;
    const assertion = (tokenRequest?.body as URLSearchParams).get("assertion");
    const [, encodedClaims] = assertion?.split(".") ?? [];
    const claims = JSON.parse(
      Buffer.from(encodedClaims ?? "", "base64url").toString("utf-8"),
    ) as { target_audience?: string };

    expect(claims.target_audience).toBe(
      "https://ory-hydra-admin-development.run.app",
    );
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://oauth-admin-dev.vana.org/admin/oauth2/auth/requests/login?login_challenge=login-challenge",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer google-id-token",
        }),
      }),
    );
  });

  it("accepts login requests only with a Vana-owned subject", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ redirect_to: "https://account.vana.org/callback" }),
      );
    const client = createHydraAdminClient({
      adminUrl: "https://hydra-admin.example.com",
      fetch: fetchImpl,
    });

    expect(() =>
      client.acceptLoginRequest("challenge", {
        subject: "0x123",
      }),
    ).toThrow("opaque vana_user_id");

    await client.acceptLoginRequest("challenge", {
      subject: VANA_USER_ID,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual({
      remember: false,
      remember_for: 0,
      subject: VANA_USER_ID,
    });
  });

  it("accepts consent with requested scopes and a vana_user_id ID-token claim", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ redirect_to: "https://account.vana.org/callback" }),
      );
    const client = createHydraAdminClient({
      adminUrl: "https://hydra-admin.example.com",
      fetch: fetchImpl,
    });

    await client.acceptConsentRequestWithRequestedGrant("consent-1", {
      requested_access_token_audience: ["memory-app"],
      requested_scope: ["openid", "profile", "wallets"],
      subject: VANA_USER_ID,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://hydra-admin.example.com/admin/oauth2/auth/requests/consent/accept?consent_challenge=consent-1",
      {
        body: JSON.stringify({
          grant_access_token_audience: ["memory-app"],
          grant_scope: ["openid", "profile", "wallets"],
          remember: false,
          remember_for: 0,
          session: {
            id_token: {
              vana_user_id: VANA_USER_ID,
            },
          },
        }),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        method: "PUT",
      },
    );
  });

  it("preserves Hydra error context", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("bad challenge", { status: 400 }));
    const client = createHydraAdminClient({
      adminUrl: "https://hydra-admin.example.com",
      fetch: fetchImpl,
    });

    await expect(client.getConsentRequest("bad")).rejects.toMatchObject({
      body: { raw: "bad challenge" },
      method: "GET",
      path: "/admin/oauth2/auth/requests/consent?consent_challenge=bad",
      status: 400,
    } satisfies Partial<HydraAdminError>);
  });
});

describe("buildHydraSessionClaims", () => {
  it("puts the stable Vana user id in token claims", () => {
    expect(buildHydraSessionClaims(VANA_USER_ID)).toEqual({
      id_token: {
        vana_user_id: VANA_USER_ID,
      },
    });
  });

  it("adds linked wallet and email claims without overriding sub", () => {
    expect(
      buildHydraSessionClaims({
        vanaUserId: VANA_USER_ID,
        email: "user@example.com",
        linkedWallets: [
          {
            provider: "privy",
            chainType: "evm",
            address: "0xAbCdEf0000000000000000000000000000000001",
            isPrimary: true,
          },
        ],
      }),
    ).toEqual({
      id_token: {
        vana_user_id: VANA_USER_ID,
        email: "user@example.com",
        linked_wallets: [
          {
            provider: "privy",
            chain_type: "evm",
            address: "0xabcdef0000000000000000000000000000000001",
            is_primary: true,
          },
        ],
      },
    });
  });
});
