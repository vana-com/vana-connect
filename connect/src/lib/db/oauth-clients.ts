import { getSql } from "./sql";

/**
 * Persistence helpers for `oauth_clients` — the registry of apps that
 * integrate Sign in with Vana and/or initiate account-hosted action requests.
 *
 * Builder fields (`grantee_address`, `builder_id`, `public_key`) are
 * collectively optional: a Sign-in-with-Vana-only client can register
 * without on-chain builder identity. The DB CHECK constraint enforces that
 * the three are populated together or not at all, so callers can rely on
 * `hasBuilderIdentity()` to decide whether real grants are reachable.
 */

function getSQL() {
  return getSql();
}

type DbRows = Array<Record<string, unknown>>;

export type OauthClientRow = {
  client_id: string;
  application_id: string | null;
  display_name: string;
  app_url: string;
  owner_address: string;
  grantee_address: string | null;
  builder_id: string | null;
  public_key: string | null;
  webhook_url: string | null;
  redirect_uris: string[];
  registered_at: string;
  updated_at: string;
};

export type OauthClientInput = {
  clientId: string;
  applicationId?: string | null;
  displayName: string;
  appUrl: string;
  ownerAddress: string;
  granteeAddress?: string | null;
  builderId?: string | null;
  publicKey?: string | null;
  webhookUrl?: string | null;
  redirectUris?: string[];
};

function rowToRecord(row: Record<string, unknown>): OauthClientRow {
  return {
    client_id: row.client_id as string,
    application_id: (row.application_id as string | null) ?? null,
    display_name: row.display_name as string,
    app_url: row.app_url as string,
    owner_address: row.owner_address as string,
    grantee_address: (row.grantee_address as string | null) ?? null,
    builder_id: (row.builder_id as string | null) ?? null,
    public_key: (row.public_key as string | null) ?? null,
    webhook_url: (row.webhook_url as string | null) ?? null,
    redirect_uris: Array.isArray(row.redirect_uris)
      ? (row.redirect_uris as string[])
      : [],
    registered_at: new Date(row.registered_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

/** True iff the client has the builder triple populated and real grants are available. */
export function hasBuilderIdentity(client: OauthClientRow): boolean {
  return (
    client.grantee_address !== null &&
    client.builder_id !== null &&
    client.public_key !== null
  );
}

export async function findOauthClientById(
  clientId: string,
): Promise<OauthClientRow | null> {
  const sql = getSQL();
  const rows = (await sql`
    SELECT * FROM oauth_clients WHERE client_id = ${clientId} LIMIT 1
  `) as DbRows;
  return rows.length > 0 ? rowToRecord(rows[0]) : null;
}

export async function findOauthClientsByOwner(
  ownerAddress: string,
): Promise<OauthClientRow[]> {
  const sql = getSQL();
  const rows = (await sql`
    SELECT * FROM oauth_clients
    WHERE owner_address = ${ownerAddress.toLowerCase()}
    ORDER BY registered_at DESC
  `) as DbRows;
  return rows.map(rowToRecord);
}

export async function listOauthClients(): Promise<OauthClientRow[]> {
  const sql = getSQL();
  const rows = (await sql`
    SELECT * FROM oauth_clients ORDER BY registered_at DESC
  `) as DbRows;
  return rows.map(rowToRecord);
}

export async function upsertOauthClient(
  input: OauthClientInput,
): Promise<OauthClientRow> {
  const sql = getSQL();
  const redirectUrisJson = JSON.stringify(input.redirectUris ?? []);
  const rows = (await sql`
    INSERT INTO oauth_clients (
      client_id, application_id, display_name, app_url, owner_address,
      grantee_address, builder_id, public_key, webhook_url, redirect_uris
    ) VALUES (
      ${input.clientId},
      ${input.applicationId ?? null},
      ${input.displayName},
      ${input.appUrl},
      ${input.ownerAddress.toLowerCase()},
      ${input.granteeAddress ?? null},
      ${input.builderId ?? null},
      ${input.publicKey ?? null},
      ${input.webhookUrl ?? null},
      ${redirectUrisJson}::jsonb
    )
    ON CONFLICT (client_id) DO UPDATE SET
      application_id = EXCLUDED.application_id,
      display_name   = EXCLUDED.display_name,
      app_url        = EXCLUDED.app_url,
      owner_address  = EXCLUDED.owner_address,
      grantee_address = EXCLUDED.grantee_address,
      builder_id     = EXCLUDED.builder_id,
      public_key     = EXCLUDED.public_key,
      webhook_url    = EXCLUDED.webhook_url,
      redirect_uris  = EXCLUDED.redirect_uris,
      updated_at     = now()
    RETURNING *
  `) as DbRows;
  return rowToRecord(rows[0]);
}

export async function deleteOauthClient(clientId: string): Promise<boolean> {
  const sql = getSQL();
  const rows = (await sql`
    DELETE FROM oauth_clients WHERE client_id = ${clientId} RETURNING client_id
  `) as DbRows;
  return rows.length > 0;
}

/**
 * Attach builder identity to an existing client. Used by the admin
 * register-builder flow to upgrade an identity-only client to a
 * data-capable one.
 */
export async function attachBuilderToClient(
  clientId: string,
  builder: {
    granteeAddress: string;
    builderId: string;
    publicKey: string;
  },
): Promise<OauthClientRow | null> {
  const sql = getSQL();
  const rows = (await sql`
    UPDATE oauth_clients SET
      grantee_address = ${builder.granteeAddress.toLowerCase()},
      builder_id      = ${builder.builderId},
      public_key      = ${builder.publicKey},
      updated_at      = now()
    WHERE client_id = ${clientId}
    RETURNING *
  `) as DbRows;
  return rows.length > 0 ? rowToRecord(rows[0]) : null;
}
