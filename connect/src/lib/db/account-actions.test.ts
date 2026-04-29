// @vitest-environment node

import { neon } from "@neondatabase/serverless";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildConsentEventRow,
  buildMockActionResult,
  canonicalRequestHash,
  createActionRequestRow,
  decideActionRequest,
  generateActionCode,
  hashActionCode,
} from "../auth/account-action";
import { createVanaUser } from "./account";
import {
  consumeActionCode,
  consumeActionCodeWithExchangeEvent,
  findActionRequestById,
  findActionResultById,
  findConsentEventById,
  insertActionRequest,
  insertActionResult,
  insertConsentEvent,
  persistActionDecisionBundle,
  persistActionRequestDecision,
} from "./account-actions";

/**
 * DB-backed tests for account-action persistence and atomic action-code
 * consumption.
 *
 * Skipped unless DATABASE_URL is set, mirroring `account.test.ts`. Each test
 * creates its own Vana user and request rows with unique ids, and best-effort
 * cleans up after itself so reruns and parallel suites do not collide.
 */

const databaseUrl = process.env.DATABASE_URL;
const dbDescribe = databaseUrl ? describe : describe.skip;
const dbIt = databaseUrl ? it : it.skip;

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const createdUserIds = new Set<string>();
const createdRequestIds = new Set<string>();

async function makePersistedRequest(
  overrides: {
    clientId?: string;
    ttlSeconds?: number;
    vanaUserId?: string;
  } = {},
) {
  const user = await createVanaUser();
  createdUserIds.add(user.user.id);

  const now = new Date();
  const { row: requestRow } = createActionRequestRow({
    clientId: overrides.clientId ?? `client_${uniqueSuffix()}`,
    vanaUserId: overrides.vanaUserId ?? user.user.id,
    actionType: "mock.echo",
    executionMode: "mock",
    resultMode: "mock",
    requestedData: { scopes: ["memory.read"], purposeCode: "demo" },
    redirectUri: "https://memory.example.com/callback",
    state: "client-state-xyz",
    displayMetadata: { title: "Memory App" },
    now,
    ttlSeconds: overrides.ttlSeconds,
  });
  const persisted = await insertActionRequest(requestRow);
  createdRequestIds.add(persisted.id);
  return { user: user.user, request: persisted, now };
}

dbDescribe("account-actions DB persistence", () => {
  afterEach(async () => {
    if (!databaseUrl) return;
    if (createdRequestIds.size > 0) {
      const sql = neon(databaseUrl);
      const ids = Array.from(createdRequestIds);
      createdRequestIds.clear();
      try {
        // ON DELETE CASCADE on account_action_results means deleting the
        // request also cleans up the result rows.
        await sql`DELETE FROM account_action_requests WHERE id = ANY(${ids}::text[])`;
      } catch {
        // Best-effort.
      }
    }
    if (createdUserIds.size > 0) {
      const sql = neon(databaseUrl);
      const ids = Array.from(createdUserIds);
      createdUserIds.clear();
      try {
        await sql`DELETE FROM vana_users WHERE id = ANY(${ids}::text[])`;
      } catch {
        // Best-effort.
      }
    }
  });

  dbIt(
    "round-trips an action request, decision, result, and consent event",
    async () => {
      const { user, request, now } = await makePersistedRequest();

      const fetched = await findActionRequestById(request.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(request.id);
      expect(fetched?.status).toBe("pending");
      expect(fetched?.execution_mode).toBe("mock");
      expect(fetched?.result_mode).toBe("mock");
      expect(fetched?.requested_data).toEqual({
        scopes: ["memory.read"],
        purposeCode: "demo",
      });

      const decided = await persistActionRequestDecision({
        id: request.id,
        decision: "approved",
        vanaUserId: user.id,
        decidedAt: new Date().toISOString(),
      });
      expect(decided).not.toBeNull();
      expect(decided?.status).toBe("approved");
      expect(decided?.decided_at).not.toBeNull();

      // A second decision must not overwrite the first.
      const second = await persistActionRequestDecision({
        id: request.id,
        decision: "denied",
        vanaUserId: user.id,
        decidedAt: new Date().toISOString(),
      });
      expect(second).toBeNull();

      const approvedRequest = decideActionRequest({
        request: { ...request, status: "pending" },
        decision: "approved",
        vanaUserId: user.id,
        now,
      });
      const code = generateActionCode();
      const resultRow = buildMockActionResult({
        request: approvedRequest,
        actionCode: code,
        now: new Date(),
      });
      const persistedResult = await insertActionResult(resultRow);
      expect(persistedResult.action_code_hash).toBe(hashActionCode(code));
      expect(persistedResult.result_payload).toEqual({
        mock: true,
        action_type: "mock.echo",
      });

      const fetchedResult = await findActionResultById(resultRow.id);
      expect(fetchedResult?.id).toBe(resultRow.id);
      expect(fetchedResult?.consumed_at).toBeNull();

      const requestHash = canonicalRequestHash({
        clientId: approvedRequest.client_id,
        actionType: approvedRequest.action_type,
        executionMode: approvedRequest.execution_mode,
        resultMode: approvedRequest.result_mode,
        requestedData: approvedRequest.requested_data,
        redirectUri: approvedRequest.redirect_uri,
      });
      const eventRow = buildConsentEventRow({
        request: approvedRequest,
        eventType: "action.approved",
        decision: "approved",
        idempotencyKey: `${approvedRequest.id}:approved`,
        requestHash,
        issuer: "account.vana.org",
        now: new Date(),
        auditMetadata: { user_agent: "vitest" },
      });
      const persistedEvent = await insertConsentEvent(eventRow);
      expect(persistedEvent.id).toBe(eventRow.id);

      const fetchedEvent = await findConsentEventById(eventRow.id);
      expect(fetchedEvent?.event_type).toBe("action.approved");
      expect(fetchedEvent?.execution_mode).toBe("mock");
      expect(fetchedEvent?.result_mode).toBe("mock");
      expect(fetchedEvent?.request_hash).toBe(requestHash);
      expect(fetchedEvent?.audit_metadata).toEqual({ user_agent: "vitest" });
    },
  );

  dbIt(
    "persists approved decision, result, and event as one atomic bundle",
    async () => {
      const { user, request, now } = await makePersistedRequest();
      const decidedAt = now.toISOString();
      const approvedRequest = decideActionRequest({
        request,
        decision: "approved",
        vanaUserId: user.id,
        now,
      });
      const code = generateActionCode();
      const resultRow = buildMockActionResult({
        request: approvedRequest,
        actionCode: code,
        now,
      });
      const requestHash = canonicalRequestHash({
        clientId: request.client_id,
        actionType: request.action_type,
        executionMode: request.execution_mode,
        resultMode: request.result_mode,
        requestedData: request.requested_data,
        redirectUri: request.redirect_uri,
      });
      const eventRow = buildConsentEventRow({
        request: approvedRequest,
        eventType: "action.approved",
        decision: "approved",
        vanaUserId: user.id,
        idempotencyKey: `${request.id}:approved`,
        requestHash,
        issuer: "https://account.vana.org",
        now,
      });

      const outcome = await persistActionDecisionBundle({
        id: request.id,
        decision: "approved",
        vanaUserId: user.id,
        decidedAt,
        result: resultRow,
        event: eventRow,
      });
      expect(outcome).not.toBeNull();
      expect(outcome?.request.status).toBe("approved");
      expect(outcome?.result?.id).toBe(resultRow.id);
      expect(outcome?.event.id).toBe(eventRow.id);

      const fetchedRequest = await findActionRequestById(request.id);
      expect(fetchedRequest?.status).toBe("approved");
      const fetchedResult = await findActionResultById(resultRow.id);
      expect(fetchedResult?.action_code_hash).toBe(hashActionCode(code));
      const fetchedEvent = await findConsentEventById(eventRow.id);
      expect(fetchedEvent?.event_type).toBe("action.approved");
      expect(fetchedEvent?.request_hash).toBe(requestHash);
    },
  );

  dbIt(
    "consumes an action code and persists action.exchanged in one helper",
    async () => {
      const { user, request, now } = await makePersistedRequest();
      const approvedRequest = decideActionRequest({
        request,
        decision: "approved",
        vanaUserId: user.id,
        now,
      });
      const code = generateActionCode();
      const resultRow = buildMockActionResult({
        request: approvedRequest,
        actionCode: code,
        now,
      });
      const requestHash = canonicalRequestHash({
        clientId: request.client_id,
        actionType: request.action_type,
        executionMode: request.execution_mode,
        resultMode: request.result_mode,
        requestedData: request.requested_data,
        redirectUri: request.redirect_uri,
      });
      const approvedEvent = buildConsentEventRow({
        request: approvedRequest,
        eventType: "action.approved",
        decision: "approved",
        vanaUserId: user.id,
        idempotencyKey: `${request.id}:approved`,
        requestHash,
        issuer: "https://account.vana.org",
        now,
      });
      await persistActionDecisionBundle({
        id: request.id,
        decision: "approved",
        vanaUserId: user.id,
        decidedAt: now.toISOString(),
        result: resultRow,
        event: approvedEvent,
      });

      const exchange = await consumeActionCodeWithExchangeEvent({
        presentedCode: code,
        presentingClientId: request.client_id,
        issuer: "https://account.vana.org",
        now: new Date(now.getTime() + 1000),
      });
      expect(exchange.ok).toBe(true);
      if (exchange.ok) {
        expect(exchange.result.id).toBe(resultRow.id);
        expect(exchange.result.consumed_at).not.toBeNull();
      }

      const sql = neon(databaseUrl as string);
      const events = (await sql`
        SELECT event_type, idempotency_key, request_hash
        FROM account_consent_events
        WHERE action_request_id = ${request.id}
          AND event_type = 'action.exchanged'
      `) as Array<{
        event_type: string;
        idempotency_key: string;
        request_hash: string;
      }>;
      expect(events).toHaveLength(1);
      expect(events[0].idempotency_key).toBe(`${request.id}:exchanged`);
      expect(events[0].request_hash).toBe(requestHash);
    },
  );

  dbIt("never stores the raw action code, only its hash", async () => {
    const { user, request, now } = await makePersistedRequest();
    await persistActionRequestDecision({
      id: request.id,
      decision: "approved",
      vanaUserId: user.id,
      decidedAt: new Date().toISOString(),
    });

    const approved = decideActionRequest({
      request: { ...request, status: "pending" },
      decision: "approved",
      vanaUserId: user.id,
      now,
    });
    const code = generateActionCode();
    const resultRow = buildMockActionResult({
      request: approved,
      actionCode: code,
      now: new Date(),
    });
    await insertActionResult(resultRow);

    const sql = neon(databaseUrl as string);
    const probe = (await sql`
      SELECT action_code_hash, result_payload, result_reference
      FROM account_action_results
      WHERE id = ${resultRow.id}
      LIMIT 1
    `) as Array<{
      action_code_hash: string;
      result_payload: unknown;
      result_reference: string | null;
    }>;
    expect(probe).toHaveLength(1);
    expect(probe[0].action_code_hash).toBe(hashActionCode(code));
    expect(probe[0].action_code_hash).not.toBe(code);
    expect(JSON.stringify(probe[0])).not.toContain(code);
  });

  dbIt(
    "consumes a valid action code exactly once and marks consumed_at",
    async () => {
      const { user, request, now } = await makePersistedRequest();
      await persistActionRequestDecision({
        id: request.id,
        decision: "approved",
        vanaUserId: user.id,
        decidedAt: new Date().toISOString(),
      });

      const approved = decideActionRequest({
        request: { ...request, status: "pending" },
        decision: "approved",
        vanaUserId: user.id,
        now,
      });
      const code = generateActionCode();
      const resultRow = buildMockActionResult({
        request: approved,
        actionCode: code,
        now: new Date(),
      });
      await insertActionResult(resultRow);

      const first = await consumeActionCode({
        presentedCode: code,
        presentingClientId: request.client_id,
      });
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.result.id).toBe(resultRow.id);
        expect(first.result.consumed_at).not.toBeNull();
        expect(first.result.result_payload).toEqual({
          mock: true,
          action_type: "mock.echo",
        });
      }

      const reread = await findActionResultById(resultRow.id);
      expect(reread?.consumed_at).not.toBeNull();

      // Second exchange of the same code must not re-deliver the payload.
      const second = await consumeActionCode({
        presentedCode: code,
        presentingClientId: request.client_id,
      });
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toBe("consumed");
      }
    },
  );

  dbIt(
    "concurrent exchanges of the same code result in exactly one success",
    async () => {
      const { user, request, now } = await makePersistedRequest();
      await persistActionRequestDecision({
        id: request.id,
        decision: "approved",
        vanaUserId: user.id,
        decidedAt: new Date().toISOString(),
      });

      const approved = decideActionRequest({
        request: { ...request, status: "pending" },
        decision: "approved",
        vanaUserId: user.id,
        now,
      });
      const code = generateActionCode();
      const resultRow = buildMockActionResult({
        request: approved,
        actionCode: code,
        now: new Date(),
      });
      await insertActionResult(resultRow);

      const attempts = await Promise.all(
        Array.from({ length: 8 }, () =>
          consumeActionCode({
            presentedCode: code,
            presentingClientId: request.client_id,
          }),
        ),
      );

      const successes = attempts.filter((r) => r.ok);
      const failures = attempts.filter((r) => !r.ok);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(attempts.length - 1);
      for (const failure of failures) {
        if (!failure.ok) {
          expect(failure.reason).toBe("consumed");
        }
      }
    },
  );

  dbIt(
    "rejects exchange by a client other than the binding client",
    async () => {
      const { user, request, now } = await makePersistedRequest();
      await persistActionRequestDecision({
        id: request.id,
        decision: "approved",
        vanaUserId: user.id,
        decidedAt: new Date().toISOString(),
      });

      const approved = decideActionRequest({
        request: { ...request, status: "pending" },
        decision: "approved",
        vanaUserId: user.id,
        now,
      });
      const code = generateActionCode();
      const resultRow = buildMockActionResult({
        request: approved,
        actionCode: code,
        now: new Date(),
      });
      await insertActionResult(resultRow);

      const wrongClient = await consumeActionCode({
        presentedCode: code,
        presentingClientId: `${request.client_id}_other`,
      });
      expect(wrongClient.ok).toBe(false);
      if (!wrongClient.ok) {
        expect(wrongClient.reason).toBe("client_mismatch");
      }

      // The binding client can still consume because the wrong-client attempt
      // did not flip consumed_at.
      const reread = await findActionResultById(resultRow.id);
      expect(reread?.consumed_at).toBeNull();

      const right = await consumeActionCode({
        presentedCode: code,
        presentingClientId: request.client_id,
      });
      expect(right.ok).toBe(true);
    },
  );

  dbIt("rejects exchange of an expired action code", async () => {
    const { user, request, now } = await makePersistedRequest();
    await persistActionRequestDecision({
      id: request.id,
      decision: "approved",
      vanaUserId: user.id,
      decidedAt: new Date().toISOString(),
    });

    const approved = decideActionRequest({
      request: { ...request, status: "pending" },
      decision: "approved",
      vanaUserId: user.id,
      now,
    });
    const code = generateActionCode();
    const resultRow = buildMockActionResult({
      request: approved,
      actionCode: code,
      now: new Date(),
      ttlSeconds: 1,
    });
    await insertActionResult(resultRow);

    // Force the row's expires_at into the past so we don't have to wait.
    const sql = neon(databaseUrl as string);
    await sql`
      UPDATE account_action_results
      SET
        created_at = now() - interval '2 seconds',
        expires_at = now() - interval '1 second'
      WHERE id = ${resultRow.id}
    `;

    const outcome = await consumeActionCode({
      presentedCode: code,
      presentingClientId: request.client_id,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("expired");
    }

    const reread = await findActionResultById(resultRow.id);
    expect(reread?.consumed_at).toBeNull();
  });

  dbIt(
    "returns not_found when the presented code does not match any stored hash",
    async () => {
      const outcome = await consumeActionCode({
        presentedCode: generateActionCode(),
        presentingClientId: "client_anyone",
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe("not_found");
      }
    },
  );
});
