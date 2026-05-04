/**
 * Execute a real grant via the user's Personal Server.
 *
 * Replaces the mock-only path for `execution_mode === "embedded_wallet_account_hosted"`:
 *   1. Resolve the user's PS row (vana_user_id → linked wallet → personal_servers)
 *   2. Resolve the OIDC client to a registered builder (oauth_clients)
 *   3. POST <ps-url>/v1/grants with Bearer access_token and { granteeAddress, scopes, expiresAt?, nonce? }
 *   4. Return the grantId for the action result + consent event
 *
 * Tests inject the resolvers + http fetch as deps so this is pure.
 */

import type { OauthClientRow } from "@/lib/db/oauth-clients";

export type ExecuteGrantInput = {
  vanaUserId: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
  nonce?: number;
  /** Resolves the user's running Personal Server (or null if none). */
  resolvePersonalServer: (vanaUserId: string) => Promise<{
    serverId: string;
    serverUrl: string;
    accessToken: string;
  } | null>;
  /** Resolves the OAuth client record. Builder fields may be null. */
  resolveOauthClient: (clientId: string) => Promise<OauthClientRow | null>;
  /** Injectable HTTP fetch (default: global fetch). */
  fetchImpl?: typeof fetch;
};

export type ExecuteGrantResult =
  | {
      ok: true;
      grantId: string;
      granteeAddress: string;
      personalServer: { serverId: string; serverUrl: string };
    }
  | {
      ok: false;
      code:
        | "no_personal_server"
        | "client_not_found"
        | "client_no_builder"
        | "ps_unreachable"
        | "ps_rejected"
        | "no_grant_id";
      message: string;
    };

export async function executeGrantViaPersonalServer(
  input: ExecuteGrantInput,
): Promise<ExecuteGrantResult> {
  const fetchImpl = input.fetchImpl ?? fetch;

  // 1. Resolve PS for the user.
  const ps = await input.resolvePersonalServer(input.vanaUserId);
  if (!ps) {
    return {
      ok: false,
      code: "no_personal_server",
      message:
        "User has no running Personal Server; provision one before approving real grants.",
    };
  }

  // 2. Resolve OAuth client + builder identity.
  const client = await input.resolveOauthClient(input.clientId);
  if (!client) {
    return {
      ok: false,
      code: "client_not_found",
      message: `OAuth client ${input.clientId} is not registered.`,
    };
  }
  if (!client.grantee_address || !client.builder_id) {
    return {
      ok: false,
      code: "client_no_builder",
      message: `OAuth client ${input.clientId} has no on-chain builder identity; cannot mint a real grant.`,
    };
  }

  // 3. POST to PS /v1/grants.
  let grantId: string | undefined;
  try {
    const res = await fetchImpl(`${ps.serverUrl}/v1/grants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ps.accessToken}`,
      },
      body: JSON.stringify({
        granteeAddress: client.grantee_address,
        scopes: input.scopes,
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt }
          : {}),
        ...(input.nonce !== undefined ? { nonce: input.nonce } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message =
        (body as { error?: { message?: string } }).error?.message ??
        `Personal Server returned ${res.status}`;
      return { ok: false, code: "ps_rejected", message };
    }
    const body = (await res.json()) as { grantId?: string };
    grantId = body.grantId;
  } catch (err) {
    return {
      ok: false,
      code: "ps_unreachable",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!grantId) {
    return {
      ok: false,
      code: "no_grant_id",
      message: "Personal Server did not return a grantId",
    };
  }

  return {
    ok: true,
    grantId,
    granteeAddress: client.grantee_address,
    personalServer: {
      serverId: ps.serverId,
      serverUrl: ps.serverUrl,
    },
  };
}
