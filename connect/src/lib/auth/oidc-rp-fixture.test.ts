import { describe, expect, it } from "vitest";
import {
  checkRedirectUri,
  createDefaultOauthClientRegistry,
  DEV_MEMORY_APP_CLIENT,
  evaluateConsentPolicy,
} from "./oauth-client-policy";

type RpFixture = {
  audience: readonly string[];
  clientId: string;
  clientName: string;
  clientType: "public";
  codeChallengeMethod: "S256";
  issuer: string;
  redirectUri: string;
  scopes: readonly string[];
  tokenEndpointAuthMethod: "none";
};

type AuthJsProvider = {
  authorization: {
    params: {
      audience?: string;
      code_challenge_method: string;
      scope: string;
    };
  };
  checks: string[];
  client: {
    token_endpoint_auth_method: string;
  };
  clientId: string;
  id: string;
  issuer: string;
  name: string;
  type: "oidc";
};

type OpenIdClientInputs = {
  authorizationParams: {
    audience?: string;
    code_challenge_method: string;
    scope: string;
  };
  clientMetadata: {
    client_id: string;
    grant_types: string[];
    redirect_uris: string[];
    response_types: string[];
    scope: string;
    token_endpoint_auth_method: string;
  };
  discoveryUrl: string;
  issuer: string;
};

type ConsentPolicyInput = {
  clientId: string;
  redirectUri: string;
  requestedAudience: string[];
  requestedScope: string[];
};

type FixtureModule = {
  buildAuthJsProvider(fixture?: RpFixture): AuthJsProvider;
  buildConsentPolicyInput(fixture?: RpFixture): ConsentPolicyInput;
  buildOpenIdClientInputs(fixture?: RpFixture): OpenIdClientInputs;
  buildRpFixture(overrides?: Partial<RpFixture>): RpFixture;
};

async function loadFixtureModule(): Promise<FixtureModule> {
  return (await import("../../../../spikes/oidc-rp-fixture/auth-config.mjs")) as FixtureModule;
}

describe("OIDC RP fixture", () => {
  it("matches the static Memory App OAuth client policy", async () => {
    const { buildConsentPolicyInput, buildRpFixture } =
      await loadFixtureModule();
    const registry = createDefaultOauthClientRegistry();
    const fixture = buildRpFixture();
    const policyInput = buildConsentPolicyInput(fixture);
    const client = registry.resolve(policyInput.clientId);

    expect(client).toEqual(DEV_MEMORY_APP_CLIENT);
    if (!client) {
      throw new Error("memory-app-dev client was not registered");
    }
    expect(checkRedirectUri(client, policyInput.redirectUri)).toEqual({
      kind: "allow",
      redirectUri: policyInput.redirectUri,
    });

    const consent = evaluateConsentPolicy({
      registry,
      clientId: policyInput.clientId,
      requestedAudience: policyInput.requestedAudience,
      requestedScope: policyInput.requestedScope,
    });
    expect(consent.kind).toBe("allow");
  });

  it("projects to an Auth.js-compatible public OIDC provider shape", async () => {
    const { buildAuthJsProvider, buildRpFixture } = await loadFixtureModule();
    const fixture = buildRpFixture();
    const provider = buildAuthJsProvider(fixture);

    expect(provider).toMatchObject({
      id: "vana",
      name: "Memory App (dev)",
      type: "oidc",
      issuer: fixture.issuer,
      clientId: "memory-app-dev",
      client: {
        token_endpoint_auth_method: "none",
      },
      authorization: {
        params: {
          scope: "openid profile email",
          audience: "memory-app-dev",
          code_challenge_method: "S256",
        },
      },
    });
    expect(provider.checks).toEqual(["pkce", "state", "nonce"]);
  });

  it("projects to openid-client discovery and client metadata inputs", async () => {
    const { buildOpenIdClientInputs, buildRpFixture } =
      await loadFixtureModule();
    const fixture = buildRpFixture();
    const inputs = buildOpenIdClientInputs(fixture);

    expect(inputs.discoveryUrl).toBe(
      "http://127.0.0.1:4444/.well-known/openid-configuration",
    );
    expect(inputs.clientMetadata).toMatchObject({
      client_id: "memory-app-dev",
      redirect_uris: ["http://localhost:3000/api/auth/callback/vana"],
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      scope: "openid profile email",
    });
    expect(inputs.authorizationParams).toMatchObject({
      scope: "openid profile email",
      audience: "memory-app-dev",
      code_challenge_method: "S256",
    });
  });
});
