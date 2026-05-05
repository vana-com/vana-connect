// @vitest-environment node

import { afterAll, describe, expect, it } from "vitest";
import {
  consumeConfirmation,
  consumeSigningAuthorization,
  findConfirmationById,
  findConsumedAuthorizationByConfirmationId,
  findSigningAuthorizationById,
  insertConfirmation,
  insertSigningAuthorization,
} from "./auth-signing";
import { attachLinkedWallet, createVanaUser } from "./account";
import { getSql } from "./sql";

/**
 * DB-backed tests for the signing-authority + interactive-confirmations
 * persistence layer (migration 008).
 *
 * Each test creates its own user + wallet and cleans up after itself. Skipped
 * unless DATABASE_URL is set, mirroring account.test.ts and account-actions.test.ts.
 *
 * Test coverage focuses on the SAI invariants:
 *   - Atomic increment of used_count via UPDATE...WHERE used_count=0 (single-use)
 *   - Partial UNIQUE on payload_hash WHERE consumed_at IS NULL rejects double-spend
 *   - consumeConfirmation is idempotent (returns null on second call)
 *   - findConsumedAuthorizationByConfirmationId enables idempotent retry
 */

const databaseUrl = process.env.DATABASE_URL;
const dbDescribe = databaseUrl ? describe : describe.skip;

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 64-char hex string suitable for the payload_hash CHECK constraint. */
function fakePayloadHash(): string {
  // 32 random hex chars + 32 of zeros = 64 chars total, varies per call.
  const rand = Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32);
  const time = Date.now().toString(16).padStart(32, "0").slice(0, 32);
  return `${rand}${time}`;
}

const createdUserIds = new Set<string>();

function getTestSQL() {
  return getSql() as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<Array<Record<string, unknown>>>;
}

async function makeUserWithWallet(): Promise<{
  vanaUserId: string;
  vanaWalletId: string;
}> {
  const user = await createVanaUser();
  createdUserIds.add(user.user.id);
  const wallet = await attachLinkedWallet(user.user.id, {
    provider: "privy",
    chainType: "evm",
    address: `0xtest${uniqueSuffix().padEnd(36, "0").slice(0, 36)}`,
    isPrimary: true,
  });
  return { vanaUserId: user.user.id, vanaWalletId: wallet.id };
}

afterAll(async () => {
  if (!databaseUrl) return;
  const sql = getTestSQL();
  for (const id of createdUserIds) {
    await sql`DELETE FROM vana_users WHERE id = ${id}`.catch(() => null);
  }
  createdUserIds.clear();
});

dbDescribe("interactive_confirmations", () => {
  it("inserts and reads a confirmation row", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const inserted = await insertConfirmation({
      vanaUserId,
      hydraSessionId: `hydra_test_${uniqueSuffix()}`,
      vanaWalletId,
      purpose: "register_personal_server",
      payloadHash: fakePayloadHash(),
      payloadSummary: { foo: "bar" },
    });
    expect(inserted.id).toMatch(/^vana_confirm_/);
    expect(inserted.consumed_at).toBeNull();

    const fetched = await findConfirmationById(inserted.id);
    expect(fetched?.id).toBe(inserted.id);
    expect(fetched?.payload_summary).toEqual({ foo: "bar" });
  });

  it("consumeConfirmation atomically transitions NULL → now()", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const inserted = await insertConfirmation({
      vanaUserId,
      hydraSessionId: sessionId,
      vanaWalletId,
      purpose: "create_grant",
      payloadHash: fakePayloadHash(),
      payloadSummary: {},
    });

    const first = await consumeConfirmation({
      id: inserted.id,
      vanaUserId,
      hydraSessionId: sessionId,
    });
    expect(first?.consumed_at).not.toBeNull();

    // Second consume on the same row must be idempotently null.
    const second = await consumeConfirmation({
      id: inserted.id,
      vanaUserId,
      hydraSessionId: sessionId,
    });
    expect(second).toBeNull();
  });

  it("consumeConfirmation rejects session mismatch", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const inserted = await insertConfirmation({
      vanaUserId,
      hydraSessionId: sessionId,
      vanaWalletId,
      purpose: "create_grant",
      payloadHash: fakePayloadHash(),
      payloadSummary: {},
    });

    // Wrong session.
    const result = await consumeConfirmation({
      id: inserted.id,
      vanaUserId,
      hydraSessionId: `hydra_test_OTHER_${uniqueSuffix()}`,
    });
    expect(result).toBeNull();
  });

  it("consumeConfirmation rejects expired confirmation", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const inserted = await insertConfirmation({
      vanaUserId,
      hydraSessionId: sessionId,
      vanaWalletId,
      purpose: "register_personal_server",
      payloadHash: fakePayloadHash(),
      payloadSummary: {},
      ttlSeconds: -1, // already expired
    });

    const result = await consumeConfirmation({
      id: inserted.id,
      vanaUserId,
      hydraSessionId: sessionId,
    });
    expect(result).toBeNull();
  });
});

dbDescribe("signing_authorizations", () => {
  it("inserts and reads an authorization row", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const auth = await insertSigningAuthorization({
      vanaUserId,
      vanaWalletId,
      hydraSessionId: sessionId,
      purpose: "register_personal_server",
      payloadHash: fakePayloadHash(),
      payloadSummary: { ownerAddress: "0xabc" },
    });
    expect(auth.id).toMatch(/^vana_sigauth_/);
    expect(auth.used_count).toBe(0);
    expect(auth.consumed_at).toBeNull();
    expect(auth.max_uses).toBe(1);

    const fetched = await findSigningAuthorizationById(auth.id);
    expect(fetched?.id).toBe(auth.id);
  });

  it("partial UNIQUE on payload_hash rejects two unconsumed authorities for the same payload", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const sharedHash = fakePayloadHash();

    const first = await insertSigningAuthorization({
      vanaUserId,
      vanaWalletId,
      hydraSessionId: sessionId,
      purpose: "create_grant",
      payloadHash: sharedHash,
      payloadSummary: {},
    });
    expect(first.id).toBeTruthy();

    let secondError: unknown = null;
    try {
      await insertSigningAuthorization({
        vanaUserId,
        vanaWalletId,
        hydraSessionId: sessionId,
        purpose: "create_grant",
        payloadHash: sharedHash,
        payloadSummary: {},
      });
    } catch (err) {
      secondError = err;
    }
    expect(secondError).not.toBeNull();
    expect(String(secondError)).toMatch(/duplicate|unique/i);
  });

  it("after consumption, a new authority for the same payload is allowed", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const sharedHash = fakePayloadHash();

    const first = await insertSigningAuthorization({
      vanaUserId,
      vanaWalletId,
      hydraSessionId: sessionId,
      purpose: "register_personal_server",
      payloadHash: sharedHash,
      payloadSummary: {},
    });
    const consumed = await consumeSigningAuthorization(first.id, "0xfakesig");
    expect(consumed?.used_count).toBe(1);
    expect(consumed?.consumed_at).not.toBeNull();

    // Now that the first is consumed, a second authority for the same hash is fine.
    const second = await insertSigningAuthorization({
      vanaUserId,
      vanaWalletId,
      hydraSessionId: sessionId,
      purpose: "register_personal_server",
      payloadHash: sharedHash,
      payloadSummary: {},
    });
    expect(second.id).not.toBe(first.id);
  });

  it("consumeSigningAuthorization is single-use", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const auth = await insertSigningAuthorization({
      vanaUserId,
      vanaWalletId,
      hydraSessionId: sessionId,
      purpose: "create_grant",
      payloadHash: fakePayloadHash(),
      payloadSummary: {},
    });

    const first = await consumeSigningAuthorization(auth.id, "0xfakesig");
    expect(first).not.toBeNull();
    expect(first?.used_count).toBe(1);

    const second = await consumeSigningAuthorization(auth.id, "0xfakesig2");
    expect(second).toBeNull();
  });

  it("findConsumedAuthorizationByConfirmationId returns the consumed row for idempotency", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const confirmation = await insertConfirmation({
      vanaUserId,
      hydraSessionId: sessionId,
      vanaWalletId,
      purpose: "register_personal_server",
      payloadHash: fakePayloadHash(),
      payloadSummary: {},
    });
    await consumeConfirmation({
      id: confirmation.id,
      vanaUserId,
      hydraSessionId: sessionId,
    });
    const auth = await insertSigningAuthorization({
      vanaUserId,
      vanaWalletId,
      hydraSessionId: sessionId,
      purpose: "register_personal_server",
      payloadHash: confirmation.payload_hash,
      payloadSummary: {},
      confirmationId: confirmation.id,
    });
    await consumeSigningAuthorization(auth.id, "0xfakesig");

    const found = await findConsumedAuthorizationByConfirmationId(
      confirmation.id,
    );
    expect(found?.id).toBe(auth.id);
    expect(found?.consumed_at).not.toBeNull();
  });

  it("findConsumedAuthorizationByConfirmationId returns null for unconsumed", async () => {
    const { vanaUserId, vanaWalletId } = await makeUserWithWallet();
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const confirmation = await insertConfirmation({
      vanaUserId,
      hydraSessionId: sessionId,
      vanaWalletId,
      purpose: "create_grant",
      payloadHash: fakePayloadHash(),
      payloadSummary: {},
    });

    // Insert an authority but don't consume.
    await insertSigningAuthorization({
      vanaUserId,
      vanaWalletId,
      hydraSessionId: sessionId,
      purpose: "create_grant",
      payloadHash: confirmation.payload_hash,
      payloadSummary: {},
      confirmationId: confirmation.id,
    });

    const found = await findConsumedAuthorizationByConfirmationId(
      confirmation.id,
    );
    expect(found).toBeNull();
  });
});
