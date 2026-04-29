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
 * as audit metadata. If the caller wants email-based merging, that is a
 * separate, explicit decision and should not happen silently here.
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
  const existingByProvider = await findUserByProviderSubject(
    "privy",
    input.privySubject,
  );
  if (existingByProvider) {
    return { user: existingByProvider, created: false };
  }

  if (input.embeddedWallet) {
    const existingByWallet = await findUserByLinkedWallet(
      input.embeddedWallet.chainType,
      input.embeddedWallet.address,
    );
    if (existingByWallet) {
      // Backfill the provider link so future lookups are O(1).
      await attachProviderLink(existingByWallet.id, {
        provider: "privy",
        providerSubject: input.privySubject,
        email: input.email ?? null,
      });
      return { user: existingByWallet, created: false };
    }
  }

  const created = await createVanaUser({
    providerLinks: [
      {
        provider: "privy",
        providerSubject: input.privySubject,
        email: input.email ?? null,
      },
    ],
    wallets: input.embeddedWallet
      ? [
          {
            provider: "privy",
            providerWalletId: input.embeddedWallet.providerWalletId ?? null,
            chainType: input.embeddedWallet.chainType,
            address: input.embeddedWallet.address,
            isPrimary: true,
            verifiedAt: new Date(),
          },
        ]
      : [],
  });

  return { user: created.user, created: true };
}
