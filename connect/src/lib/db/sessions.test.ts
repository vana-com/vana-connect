// @vitest-environment node

import { afterAll, describe, expect, it } from "vitest";
import {
  __testing__,
  gcExpiredTombstones,
  insertRefreshToken,
  insertTombstone,
  isSessionTombstoned,
  markRefreshTokenRotated,
  revokeRefreshTokenFamily,
  revokeRefreshTokensForSession,
} from "./sessions";
import { createVanaUser } from "./account";
import { getSql } from "./sql";

/**
 * Tests for vana_refresh_tokens (encrypted-at-rest) and vana_session_tombstones
 * (multi-lambda revocation).
 *
 * Encryption tests run without DATABASE_URL (pure crypto).
 *
 * DB tests skipped unless DATABASE_URL is set, mirroring other suites.
 */

const databaseUrl = process.env.DATABASE_URL;
const dbDescribe = databaseUrl ? describe : describe.skip;

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const createdUserIds = new Set<string>();
const insertedSessionIds = new Set<string>();

function getTestSQL() {
  return getSql() as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<Array<Record<string, unknown>>>;
}

afterAll(async () => {
  if (!databaseUrl) return;
  const sql = getTestSQL();
  for (const id of createdUserIds) {
    await sql`DELETE FROM vana_users WHERE id = ${id}`.catch(() => null);
  }
  for (const sid of insertedSessionIds) {
    await sql`DELETE FROM vana_session_tombstones WHERE hydra_session_id = ${sid}`.catch(
      () => null,
    );
  }
  createdUserIds.clear();
  insertedSessionIds.clear();
});

// --- pure crypto, no DB ---

describe("refresh token encryption (pure)", () => {
  // The KEK env var is required by encryption helpers; skip if not set.
  const hasKek = !!process.env.REFRESH_TOKEN_ENC_KEY;
  const enc = hasKek ? it : it.skip;

  enc("encrypt → decrypt round-trip preserves plaintext", () => {
    const plaintext = `ory_rt_${uniqueSuffix()}`;
    const { ciphertext, iv, tag } = __testing__.encryptRefreshToken(plaintext);
    expect(ciphertext.length).toBeGreaterThan(0);
    expect(iv.length).toBe(12);
    expect(tag.length).toBe(16);

    const decrypted = __testing__.decryptRefreshToken(ciphertext, iv, tag);
    expect(decrypted).toBe(plaintext);
  });

  enc("each encryption uses a fresh IV (no IV reuse)", () => {
    const plaintext = "shared_plaintext";
    const a = __testing__.encryptRefreshToken(plaintext);
    const b = __testing__.encryptRefreshToken(plaintext);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  enc("decrypt with wrong tag throws", () => {
    const plaintext = "msg";
    const { ciphertext, iv, tag } = __testing__.encryptRefreshToken(plaintext);
    const tamperedTag = Buffer.from(tag);
    tamperedTag[0] ^= 0xff;
    expect(() =>
      __testing__.decryptRefreshToken(ciphertext, iv, tamperedTag),
    ).toThrow();
  });
});

// --- DB-backed ---

dbDescribe("vana_refresh_tokens", () => {
  // These tests require both DATABASE_URL and REFRESH_TOKEN_ENC_KEY.
  const hasKek = !!process.env.REFRESH_TOKEN_ENC_KEY;
  const dbIt = hasKek ? it : it.skip;

  dbIt("insert + rotate + family revocation", async () => {
    const user = await createVanaUser();
    createdUserIds.add(user.user.id);
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const original = await insertRefreshToken({
      vanaUserId: user.user.id,
      hydraSessionId: sessionId,
      refreshToken: `ory_rt_${uniqueSuffix()}`,
      expiresAt,
    });
    expect(original.id).toMatch(/^vana_rt_/);
    expect(original.family_id).toMatch(/^vana_rtfam_/);
    expect(original.rotated_at).toBeNull();

    // Rotate: the original is marked rotated, a new row is inserted with same family.
    const rotated = await markRefreshTokenRotated(original.id);
    expect(rotated?.rotated_at).not.toBeNull();

    const replacement = await insertRefreshToken({
      vanaUserId: user.user.id,
      hydraSessionId: sessionId,
      refreshToken: `ory_rt_${uniqueSuffix()}`,
      familyId: original.family_id,
      expiresAt,
    });
    expect(replacement.family_id).toBe(original.family_id);

    // Family revocation marks all rows in the family revoked.
    const revokedCount = await revokeRefreshTokenFamily(original.family_id);
    expect(revokedCount).toBeGreaterThanOrEqual(2);
  });

  dbIt("revokeRefreshTokensForSession revokes by session", async () => {
    const user = await createVanaUser();
    createdUserIds.add(user.user.id);
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    await insertRefreshToken({
      vanaUserId: user.user.id,
      hydraSessionId: sessionId,
      refreshToken: `ory_rt_${uniqueSuffix()}`,
      expiresAt: new Date(Date.now() + 60 * 1000),
    });

    const count = await revokeRefreshTokensForSession(sessionId);
    expect(count).toBe(1);
  });

  dbIt(
    "markRefreshTokenRotated is idempotent (returns null on second call)",
    async () => {
      const user = await createVanaUser();
      createdUserIds.add(user.user.id);
      const row = await insertRefreshToken({
        vanaUserId: user.user.id,
        hydraSessionId: `hydra_test_${uniqueSuffix()}`,
        refreshToken: `ory_rt_${uniqueSuffix()}`,
        expiresAt: new Date(Date.now() + 60 * 1000),
      });

      const first = await markRefreshTokenRotated(row.id);
      expect(first?.rotated_at).not.toBeNull();

      const second = await markRefreshTokenRotated(row.id);
      expect(second).toBeNull();
    },
  );
});

dbDescribe("vana_session_tombstones", () => {
  it("insertTombstone is idempotent on hydra_session_id (PK)", async () => {
    const user = await createVanaUser();
    createdUserIds.add(user.user.id);
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    insertedSessionIds.add(sessionId);

    const first = await insertTombstone({
      hydraSessionId: sessionId,
      vanaUserId: user.user.id,
    });
    expect(first.hydra_session_id).toBe(sessionId);

    // Second insert ON CONFLICT DO UPDATE — same row, refreshed timestamps.
    const second = await insertTombstone({
      hydraSessionId: sessionId,
      vanaUserId: user.user.id,
    });
    expect(second.hydra_session_id).toBe(sessionId);
  });

  it("isSessionTombstoned returns true while not expired, false after", async () => {
    const user = await createVanaUser();
    createdUserIds.add(user.user.id);
    const sessionId = `hydra_test_${uniqueSuffix()}`;
    insertedSessionIds.add(sessionId);

    await insertTombstone({
      hydraSessionId: sessionId,
      vanaUserId: user.user.id,
      ttlSeconds: 60,
    });
    expect(await isSessionTombstoned(sessionId)).toBe(true);

    // Insert one with ttl in the past.
    const expiredSessionId = `hydra_test_${uniqueSuffix()}`;
    insertedSessionIds.add(expiredSessionId);
    await insertTombstone({
      hydraSessionId: expiredSessionId,
      vanaUserId: user.user.id,
      ttlSeconds: -10,
    });
    expect(await isSessionTombstoned(expiredSessionId)).toBe(false);
  });

  it("isSessionTombstoned returns false for unknown session", async () => {
    const unknown = `hydra_test_unknown_${uniqueSuffix()}`;
    expect(await isSessionTombstoned(unknown)).toBe(false);
  });

  it("gcExpiredTombstones deletes expired rows", async () => {
    const user = await createVanaUser();
    createdUserIds.add(user.user.id);
    const sessionId = `hydra_test_gc_${uniqueSuffix()}`;
    insertedSessionIds.add(sessionId);

    await insertTombstone({
      hydraSessionId: sessionId,
      vanaUserId: user.user.id,
      ttlSeconds: -10,
    });

    const deleted = await gcExpiredTombstones();
    expect(deleted).toBeGreaterThanOrEqual(1);

    expect(await isSessionTombstoned(sessionId)).toBe(false);
  });
});
