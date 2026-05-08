/**
 * Idempotent Hydra OAuth client setup for the Vana auth-redesign.
 *
 * Creates (or updates) two clients:
 *   - vana-account-web: browser session (authorization_code + refresh).
 *   - data-connect:     native client (device_code + refresh).
 *
 * Both:
 *   - sub = vanaUserId (per-consent at acceptOAuth2LoginRequest time)
 *   - access_token_strategy = opaque (introspection-based revocation)
 *   - 15min access TTL / 30day refresh TTL
 *   - token_endpoint_auth_method = 'none' (public clients)
 *
 * Audience contract:
 *   - vana-account-web is scoped to account.vana.org.
 *   - data-connect needs both account.vana.org and vana-personal-server so
 *     device-code tokens keep working across account APIs and personal-server
 *     ingest calls. Keep this in sync with the data-connect runtime.
 *
 * Usage (against dev):
 *
 *   HYDRA_ADMIN_URL=https://oauth-admin-dev.vana.org \
 *   HYDRA_ADMIN_AUDIENCE=https://ory-hydra-admin-development-...run.app \
 *     pnpm tsx scripts/setup-hydra-clients.ts
 *
 * Re-running is safe: existing clients are updated to match the spec via PUT.
 */

import { fetchGoogleIdTokenForAudience } from "@/lib/auth/google-id-token";

const VANA_ACCOUNT_WEB = {
  client_id: "vana-account-web",
  client_name: "Vana Account (web)",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  scope: "openid offline",
  audience: ["account.vana.org"],
  redirect_uris: ["https://account-dev.vana.org/auth/oidc/callback"],
  token_endpoint_auth_method: "none",
  access_token_strategy: "opaque",
  authorization_code_grant_access_token_lifespan: "15m",
  authorization_code_grant_refresh_token_lifespan: "720h",
  refresh_token_grant_access_token_lifespan: "15m",
  refresh_token_grant_refresh_token_lifespan: "720h",
} as const;

const DATA_CONNECT = {
  client_id: "data-connect",
  client_name: "Vana data-connect",
  grant_types: [
    "urn:ietf:params:oauth:grant-type:device_code",
    "refresh_token",
  ],
  scope: "openid offline",
  audience: ["account.vana.org", "vana-personal-server"],
  token_endpoint_auth_method: "none",
  access_token_strategy: "opaque",
  authorization_code_grant_access_token_lifespan: "15m",
  authorization_code_grant_refresh_token_lifespan: "720h",
  refresh_token_grant_access_token_lifespan: "15m",
  refresh_token_grant_refresh_token_lifespan: "720h",
} as const;

export const __testing__ = {
  VANA_ACCOUNT_WEB,
  DATA_CONNECT,
};

async function upsertClient(
  adminUrl: string,
  bearer: string,
  cfg: Record<string, unknown>,
): Promise<void> {
  const id = cfg.client_id as string;
  const post = await fetch(`${adminUrl}/admin/clients`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(cfg),
  });
  if (post.status === 201) {
    console.log(`[hydra] created client: ${id}`);
    return;
  }
  if (post.status === 409) {
    const put = await fetch(`${adminUrl}/admin/clients/${id}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(cfg),
    });
    if (put.ok) {
      console.log(`[hydra] updated client: ${id}`);
      return;
    }
    throw new Error(
      `[hydra] PUT ${id} failed: ${put.status} ${await put.text()}`,
    );
  }
  throw new Error(
    `[hydra] POST ${id} failed: ${post.status} ${await post.text()}`,
  );
}

async function main() {
  const adminUrl = process.env.HYDRA_ADMIN_URL;
  if (!adminUrl) {
    throw new Error("HYDRA_ADMIN_URL is required");
  }
  const adminAud = process.env.HYDRA_ADMIN_AUDIENCE ?? adminUrl;
  const bearer = await fetchGoogleIdTokenForAudience(adminAud);
  if (!bearer) {
    throw new Error(
      "Google ID token unavailable. Run `gcloud auth login` and retry.",
    );
  }
  await upsertClient(adminUrl, bearer, VANA_ACCOUNT_WEB);
  await upsertClient(adminUrl, bearer, DATA_CONNECT);
  console.log("[hydra] all clients in sync");
}

const isDirectRun =
  process.argv[1]?.endsWith("setup-hydra-clients.ts") ?? false;

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
