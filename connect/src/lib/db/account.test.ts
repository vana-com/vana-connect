// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { resolveVanaUserByPrivyEvidence } from "./account";
import { getSql } from "./sql";

/**
 * DB-backed concurrency tests for resolveVanaUserByPrivyEvidence.
 *
 * Skipped unless DATABASE_URL is set so unit-test runs do not require a
 * Postgres instance. When DATABASE_URL is set, the suite uses unique
 * subjects/addresses per test and best-effort cleans up the rows it creates.
 *
 * Each test asserts not only the returned ids but also actual table counts
 * and link rows, so the "no duplicate / no orphan" invariants are proven
 * against the database state, not just against the function's return value.
 */

const databaseUrl = process.env.DATABASE_URL;
const dbDescribe = databaseUrl ? describe : describe.skip;
const dbIt = databaseUrl ? it : it.skip;

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function evmAddress(suffix: string): string {
  // Pad to a 40-hex-char address; the suffix is namespaced by Math.random so
  // collisions across concurrent test runs are vanishingly unlikely.
  const hex = Buffer.from(suffix).toString("hex").padEnd(40, "0").slice(0, 40);
  return `0x${hex}`;
}

const createdUserIds = new Set<string>();

function track(userId: string): void {
  createdUserIds.add(userId);
}

function trackAll(userIds: Iterable<string>): void {
  for (const id of userIds) {
    createdUserIds.add(id);
  }
}

type CountRow = { n: number | string };

function getTestSQL() {
  return getSql() as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<Array<Record<string, unknown>>>;
}

async function countUsersById(id: string): Promise<number> {
  if (!databaseUrl) return 0;
  const sql = getTestSQL();
  const rows = (await sql`
    SELECT count(*)::int AS n FROM vana_users WHERE id = ${id}
  `) as CountRow[];
  return Number(rows[0]?.n ?? 0);
}

async function countProviderLinks(
  provider: string,
  providerSubject: string,
): Promise<number> {
  if (!databaseUrl) return 0;
  const sql = getTestSQL();
  const rows = (await sql`
    SELECT count(*)::int AS n
    FROM vana_provider_links
    WHERE provider = ${provider}
      AND provider_subject = ${providerSubject}
  `) as CountRow[];
  return Number(rows[0]?.n ?? 0);
}

async function findProviderLinkUser(
  provider: string,
  providerSubject: string,
): Promise<string | null> {
  if (!databaseUrl) return null;
  const sql = getTestSQL();
  const rows = (await sql`
    SELECT vana_user_id FROM vana_provider_links
    WHERE provider = ${provider}
      AND provider_subject = ${providerSubject}
    LIMIT 1
  `) as Array<{ vana_user_id: string }>;
  return rows[0]?.vana_user_id ?? null;
}

async function countWallets(
  chainType: string,
  address: string,
): Promise<number> {
  if (!databaseUrl) return 0;
  const sql = getTestSQL();
  const rows = (await sql`
    SELECT count(*)::int AS n
    FROM vana_linked_wallets
    WHERE chain_type = ${chainType}
      AND address = ${address}
  `) as CountRow[];
  return Number(rows[0]?.n ?? 0);
}

async function findWalletUser(
  chainType: string,
  address: string,
): Promise<string | null> {
  if (!databaseUrl) return null;
  const sql = getTestSQL();
  const rows = (await sql`
    SELECT vana_user_id FROM vana_linked_wallets
    WHERE chain_type = ${chainType}
      AND address = ${address}
    LIMIT 1
  `) as Array<{ vana_user_id: string }>;
  return rows[0]?.vana_user_id ?? null;
}

dbDescribe("resolveVanaUserByPrivyEvidence (DB-backed)", () => {
  afterEach(async () => {
    if (!databaseUrl || createdUserIds.size === 0) return;
    const sql = getTestSQL();
    const ids = Array.from(createdUserIds);
    createdUserIds.clear();
    try {
      await sql`DELETE FROM vana_users WHERE id = ANY(${ids}::text[])`;
    } catch {
      // Best-effort cleanup; do not fail the suite if cleanup hits races.
    }
  });

  dbIt(
    "concurrent same privySubject + same wallet resolves to one user with no duplicate rows",
    async () => {
      const suffix = uniqueSuffix();
      const privySubject = `did:privy:test_${suffix}`;
      const address = evmAddress(`same_${suffix}`);

      const calls = Array.from({ length: 5 }, () =>
        resolveVanaUserByPrivyEvidence({
          privySubject,
          embeddedWallet: { chainType: "evm", address },
        }),
      );
      const results = await Promise.all(calls);
      trackAll(results.map((r) => r.user.id));

      const ids = new Set(results.map((r) => r.user.id));
      expect(ids.size).toBe(1);
      expect(results.filter((r) => r.created).length).toBe(1);

      const userId = results[0].user.id;
      // Exactly one vana_users row, one provider link, and one wallet row,
      // all linked to the same user. No duplicates, no orphans.
      expect(await countUsersById(userId)).toBe(1);
      expect(await countProviderLinks("privy", privySubject)).toBe(1);
      expect(await countWallets("evm", address)).toBe(1);
      expect(await findProviderLinkUser("privy", privySubject)).toBe(userId);
      expect(await findWalletUser("evm", address)).toBe(userId);
    },
  );

  dbIt(
    "concurrent same privySubject without wallet resolves to one user with no duplicate rows",
    async () => {
      const suffix = uniqueSuffix();
      const privySubject = `did:privy:nowallet_${suffix}`;

      const calls = Array.from({ length: 5 }, () =>
        resolveVanaUserByPrivyEvidence({ privySubject }),
      );
      const results = await Promise.all(calls);
      trackAll(results.map((r) => r.user.id));

      const ids = new Set(results.map((r) => r.user.id));
      expect(ids.size).toBe(1);
      expect(results.filter((r) => r.created).length).toBe(1);

      const userId = results[0].user.id;
      expect(await countUsersById(userId)).toBe(1);
      expect(await countProviderLinks("privy", privySubject)).toBe(1);
      expect(await findProviderLinkUser("privy", privySubject)).toBe(userId);
    },
  );

  dbIt(
    "existing wallet, concurrent provider backfill links provider to wallet owner without duplicating",
    async () => {
      const suffix = uniqueSuffix();
      const seedSubject = `did:privy:seed_${suffix}`;
      const newSubject = `did:privy:backfill_${suffix}`;
      const address = evmAddress(`backfill_${suffix}`);

      const seed = await resolveVanaUserByPrivyEvidence({
        privySubject: seedSubject,
        embeddedWallet: { chainType: "evm", address },
      });
      track(seed.user.id);
      expect(seed.created).toBe(true);

      const calls = Array.from({ length: 4 }, () =>
        resolveVanaUserByPrivyEvidence({
          privySubject: newSubject,
          embeddedWallet: { chainType: "evm", address },
        }),
      );
      const results = await Promise.all(calls);
      trackAll(results.map((r) => r.user.id));

      const ids = new Set(results.map((r) => r.user.id));
      expect(ids.size).toBe(1);
      expect(results[0].user.id).toBe(seed.user.id);
      expect(results.every((r) => r.created === false)).toBe(true);

      // Both subjects link to the seed user; the wallet stays single.
      expect(await countUsersById(seed.user.id)).toBe(1);
      expect(await countProviderLinks("privy", seedSubject)).toBe(1);
      expect(await countProviderLinks("privy", newSubject)).toBe(1);
      expect(await findProviderLinkUser("privy", seedSubject)).toBe(
        seed.user.id,
      );
      expect(await findProviderLinkUser("privy", newSubject)).toBe(
        seed.user.id,
      );
      expect(await countWallets("evm", address)).toBe(1);
      expect(await findWalletUser("evm", address)).toBe(seed.user.id);
    },
  );

  dbIt(
    "existing provider plus wallet owned by another user prefers provider and does not throw",
    async () => {
      const suffix = uniqueSuffix();
      const providerSubject = `did:privy:provider_${suffix}`;
      const otherSubject = `did:privy:other_${suffix}`;
      const sharedAddress = evmAddress(`shared_${suffix}`);

      // User A: provider link only, no wallet.
      const userA = await resolveVanaUserByPrivyEvidence({
        privySubject: providerSubject,
      });
      track(userA.user.id);

      // User B: owns the shared wallet via a different provider subject.
      const userB = await resolveVanaUserByPrivyEvidence({
        privySubject: otherSubject,
        embeddedWallet: { chainType: "evm", address: sharedAddress },
      });
      track(userB.user.id);
      expect(userB.user.id).not.toBe(userA.user.id);

      // Provider login arrives with a wallet that B already owns. Provider
      // wins, wallet stays on B, nothing throws.
      const result = await resolveVanaUserByPrivyEvidence({
        privySubject: providerSubject,
        embeddedWallet: { chainType: "evm", address: sharedAddress },
      });
      track(result.user.id);
      expect(result.user.id).toBe(userA.user.id);
      expect(result.created).toBe(false);

      expect(await countUsersById(userA.user.id)).toBe(1);
      expect(await countUsersById(userB.user.id)).toBe(1);
      expect(await countProviderLinks("privy", providerSubject)).toBe(1);
      expect(await countProviderLinks("privy", otherSubject)).toBe(1);
      expect(await findProviderLinkUser("privy", providerSubject)).toBe(
        userA.user.id,
      );
      expect(await findProviderLinkUser("privy", otherSubject)).toBe(
        userB.user.id,
      );
      // Wallet remains exactly one row, still owned by B.
      expect(await countWallets("evm", sharedAddress)).toBe(1);
      expect(await findWalletUser("evm", sharedAddress)).toBe(userB.user.id);
    },
  );

  dbIt(
    "concurrent different Privy subjects with same wallet resolve to one user without duplicates",
    async () => {
      const suffix = uniqueSuffix();
      const subjectA = `did:privy:concA_${suffix}`;
      const subjectB = `did:privy:concB_${suffix}`;
      const address = evmAddress(`conc_${suffix}`);

      const [resA, resB] = await Promise.all([
        resolveVanaUserByPrivyEvidence({
          privySubject: subjectA,
          embeddedWallet: { chainType: "evm", address },
        }),
        resolveVanaUserByPrivyEvidence({
          privySubject: subjectB,
          embeddedWallet: { chainType: "evm", address },
        }),
      ]);
      track(resA.user.id);
      track(resB.user.id);

      expect(resA.user.id).toBe(resB.user.id);
      // Exactly one created the user; the other backfilled the provider link.
      expect([resA.created, resB.created].sort()).toEqual([false, true]);

      const userId = resA.user.id;
      expect(await countUsersById(userId)).toBe(1);
      // Both subjects exist as provider links pointing at the single user.
      expect(await countProviderLinks("privy", subjectA)).toBe(1);
      expect(await countProviderLinks("privy", subjectB)).toBe(1);
      expect(await findProviderLinkUser("privy", subjectA)).toBe(userId);
      expect(await findProviderLinkUser("privy", subjectB)).toBe(userId);
      // The wallet was created exactly once.
      expect(await countWallets("evm", address)).toBe(1);
      expect(await findWalletUser("evm", address)).toBe(userId);
    },
  );
});
