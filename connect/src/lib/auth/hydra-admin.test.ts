import { describe, expect, it, vi } from "vitest";
import {
  buildHydraSessionClaims,
  createHydraAdminClient,
  type HydraAdminError,
} from "./hydra-admin";

const VANA_USER_ID = "vana_user_0123456789abcdef0123456789abcdef";

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
});
