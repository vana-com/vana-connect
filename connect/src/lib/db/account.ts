import { neon } from "@neondatabase/serverless";
import {
  generateLinkedWalletId,
  generateProviderLinkId,
  generateVanaUserId,
  type LinkedWalletInput,
  type LinkedWalletRow,
  normalizeWalletAddress,
  type ProviderLinkInput,
  type ProviderLinkRow,
  type VanaUserRow,
} from "../auth/vana-account";

/**
 * Persistence helpers for the Vana account identity model.
 *
 * Mirrors the direct-Neon-SQL style used in `./neon.ts`. These helpers do the
 * minimum needed for the first OIDC slice: create a Vana user, attach a
 * linked wallet, attach a provider link, and resolve a Vana user from
 * transitional Privy-native login evidence.
 *
 * Important: provider ids and email are stored as evidence/metadata on
 * `vana_provider_links`. Email is never used as a merge key. Verified provider
 * subjects and embedded wallet addresses are explicit transitional merge keys
 * in `resolveVanaUserByPrivyEvidence`.
 */

function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(url);
}

export type CreateVanaUserInput = {
  displayName?: string | null;
  wallets?: LinkedWalletInput[];
  providerLinks?: ProviderLinkInput[];
};

export type CreateVanaUserResult = {
  user: VanaUserRow;
  wallets: LinkedWalletRow[];
  providerLinks: ProviderLinkRow[];
};

export async function createVanaUser(
  input: CreateVanaUserInput = {},
): Promise<CreateVanaUserResult> {
  const sql = getSQL();
  const id = generateVanaUserId();

  const userRows = await sql`
    INSERT INTO vana_users (id, display_name)
    VALUES (${id}, ${input.displayName ?? null})
    RETURNING *
  `;
  const user = userRows[0] as VanaUserRow;

  const wallets: LinkedWalletRow[] = [];
  for (const wallet of input.wallets ?? []) {
    wallets.push(await attachLinkedWallet(user.id, wallet));
  }

  const providerLinks: ProviderLinkRow[] = [];
  for (const link of input.providerLinks ?? []) {
    providerLinks.push(await attachProviderLink(user.id, link));
  }

  return { user, wallets, providerLinks };
}

export async function attachLinkedWallet(
  vanaUserId: string,
  wallet: LinkedWalletInput,
): Promise<LinkedWalletRow> {
  const sql = getSQL();
  const id = generateLinkedWalletId();
  const address = normalizeWalletAddress(wallet.chainType, wallet.address);
  const rows = await sql`
    INSERT INTO vana_linked_wallets (
      id, vana_user_id, provider, provider_wallet_id,
      chain_type, address, is_primary, verified_at
    ) VALUES (
      ${id}, ${vanaUserId}, ${wallet.provider}, ${wallet.providerWalletId ?? null},
      ${wallet.chainType}, ${address}, ${wallet.isPrimary ?? false},
      ${wallet.verifiedAt ? wallet.verifiedAt.toISOString() : null}
    )
    RETURNING *
  `;
  return rows[0] as LinkedWalletRow;
}

export async function attachProviderLink(
  vanaUserId: string,
  link: ProviderLinkInput,
): Promise<ProviderLinkRow> {
  const sql = getSQL();
  const id = generateProviderLinkId();
  const rows = await sql`
    INSERT INTO vana_provider_links (
      id, vana_user_id, provider, provider_subject, email, metadata
    ) VALUES (
      ${id}, ${vanaUserId}, ${link.provider}, ${link.providerSubject},
      ${link.email ?? null}, ${link.metadata ? JSON.stringify(link.metadata) : null}
    )
    RETURNING *
  `;
  return rows[0] as ProviderLinkRow;
}

export async function findVanaUserById(
  id: string,
): Promise<VanaUserRow | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM vana_users WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as VanaUserRow | undefined) ?? null;
}

export async function findLinkedWalletsByUser(
  vanaUserId: string,
): Promise<LinkedWalletRow[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM vana_linked_wallets WHERE vana_user_id = ${vanaUserId}
  `;
  return rows as LinkedWalletRow[];
}

export async function findProviderLinksByUser(
  vanaUserId: string,
): Promise<ProviderLinkRow[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM vana_provider_links WHERE vana_user_id = ${vanaUserId}
  `;
  return rows as ProviderLinkRow[];
}

export async function findUserByProviderSubject(
  provider: string,
  providerSubject: string,
): Promise<VanaUserRow | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT u.*
    FROM vana_users u
    JOIN vana_provider_links p ON p.vana_user_id = u.id
    WHERE p.provider = ${provider} AND p.provider_subject = ${providerSubject}
    LIMIT 1
  `;
  return (rows[0] as VanaUserRow | undefined) ?? null;
}

export async function findUserByLinkedWallet(
  chainType: string,
  address: string,
): Promise<VanaUserRow | null> {
  const sql = getSQL();
  const normalized = normalizeWalletAddress(chainType, address);
  const rows = await sql`
    SELECT u.*
    FROM vana_users u
    JOIN vana_linked_wallets w ON w.vana_user_id = u.id
    WHERE w.chain_type = ${chainType} AND w.address = ${normalized}
    LIMIT 1
  `;
  return (rows[0] as VanaUserRow | undefined) ?? null;
}

/**
 * Resolve (or create) a Vana user from transitional Privy-native login
 * evidence.
 *
 * Merge keys, in order:
 *   1. Existing `vana_provider_links` row matching `(privy, privySubject)`.
 *   2. Existing `vana_linked_wallets` row matching the embedded wallet
 *      `(chainType, normalized address)`.
 *
 * Email is intentionally NOT a merge key — it is stored on the provider link
 * as audit metadata. A later verified email can backfill a previously-NULL
 * email via the `ON CONFLICT DO UPDATE` clause, but it never causes two
 * different Vana users to merge.
 *
 * Concurrency: a read-committed transaction first acquires sorted,
 * transaction-scoped advisory locks on hashed evidence keys, then resolves
 * and upserts in a second statement. Keeping the lock acquisition in its own
 * statement matters because Postgres takes a statement snapshot before
 * waiting on locks; the second statement sees rows committed by the prior
 * holder. Sorting means two concurrent transactions sharing any subset of
 * evidence always lock in the same order, preventing deadlocks. The provider
 * and wallet writes are upserts so unique-constraint conflicts under the lock
 * degrade to no-ops (or an email backfill) instead of throws.
 */
export async function resolveVanaUserByPrivyEvidence(input: {
  privySubject: string;
  email?: string | null;
  embeddedWallet?: {
    chainType: string;
    address: string;
    providerWalletId?: string | null;
  };
}): Promise<{ user: VanaUserRow; created: boolean }> {
  const sql = getSQL();
  const provider = "privy";
  const providerSubject = input.privySubject;
  const email = input.email ?? null;

  const wallet = input.embeddedWallet
    ? {
        chainType: input.embeddedWallet.chainType,
        address: normalizeWalletAddress(
          input.embeddedWallet.chainType,
          input.embeddedWallet.address,
        ),
        providerWalletId: input.embeddedWallet.providerWalletId ?? null,
      }
    : null;

  const newUserId = generateVanaUserId();
  const newProviderLinkId = generateProviderLinkId();
  const newWalletId = generateLinkedWalletId();
  const hasWallet = wallet !== null;

  // Lock keys are sorted inside SQL (`ORDER BY key`) so concurrent calls that
  // share any subset of evidence always acquire locks in the same order.
  const lockKeys = [
    `vana:provider:${provider}:${providerSubject}`,
    ...(wallet ? [`vana:wallet:${wallet.chainType}:${wallet.address}`] : []),
  ];

  const [, result] = (await sql.transaction(
    (tx) => [
      tx`
        WITH lock_keys AS MATERIALIZED (
          SELECT key FROM unnest(${lockKeys}::text[]) AS t(key) ORDER BY key
        )
        SELECT pg_advisory_xact_lock(hashtextextended(key, 0)) AS acquired
        FROM lock_keys
      `,
      tx`
        WITH
          existing_provider AS (
            SELECT vana_user_id
            FROM vana_provider_links
            WHERE provider = ${provider}
              AND provider_subject = ${providerSubject}
            LIMIT 1
          ),
          existing_wallet AS (
            SELECT vana_user_id
            FROM vana_linked_wallets
            WHERE ${hasWallet}::boolean
              AND chain_type = ${wallet?.chainType ?? ""}
              AND address = ${wallet?.address ?? ""}
            LIMIT 1
          ),
          resolved AS (
            SELECT vana_user_id FROM existing_provider
            UNION ALL
            SELECT vana_user_id FROM existing_wallet
            WHERE NOT EXISTS (SELECT 1 FROM existing_provider)
            LIMIT 1
          ),
          new_user AS (
            INSERT INTO vana_users (id, display_name)
            SELECT ${newUserId}, NULL
            WHERE NOT EXISTS (SELECT 1 FROM resolved)
            RETURNING *
          ),
          existing_user AS (
            SELECT u.*
            FROM vana_users u
            WHERE u.id = (SELECT vana_user_id FROM resolved)
          ),
          final_user AS (
            SELECT *, FALSE AS created FROM existing_user
            UNION ALL
            SELECT *, TRUE AS created FROM new_user
            LIMIT 1
          ),
          upsert_provider AS (
            INSERT INTO vana_provider_links (
              id, vana_user_id, provider, provider_subject, email
            )
            SELECT
              ${newProviderLinkId},
              (SELECT id FROM final_user),
              ${provider},
              ${providerSubject},
              ${email}
            WHERE EXISTS (SELECT 1 FROM final_user)
            ON CONFLICT (provider, provider_subject) DO UPDATE
              SET email = COALESCE(vana_provider_links.email, EXCLUDED.email)
            RETURNING vana_user_id
          ),
          upsert_wallet AS (
            INSERT INTO vana_linked_wallets (
              id, vana_user_id, provider, provider_wallet_id,
              chain_type, address, is_primary, verified_at
            )
            SELECT
              ${newWalletId},
              (SELECT id FROM final_user),
              ${provider},
              ${wallet?.providerWalletId ?? null},
              ${wallet?.chainType ?? ""},
              ${wallet?.address ?? ""},
              TRUE,
              now()
            WHERE ${hasWallet}::boolean
              AND EXISTS (SELECT 1 FROM final_user)
            ON CONFLICT (chain_type, address) DO NOTHING
            RETURNING vana_user_id
          ),
          write_barrier AS (
            SELECT
              (SELECT count(*) FROM upsert_provider) AS provider_write_count,
              (SELECT count(*) FROM upsert_wallet) AS wallet_write_count
          )
        SELECT final_user.* FROM final_user, write_barrier
      `,
    ],
    { isolationLevel: "ReadCommitted" },
  )) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

  const finalRow = result[0];
  if (!finalRow) {
    throw new Error(
      "resolveVanaUserByPrivyEvidence: failed to resolve or create Vana user",
    );
  }
  const { created, ...userRow } = finalRow as VanaUserRow & {
    created: boolean;
  };
  return { user: userRow as VanaUserRow, created };
}
