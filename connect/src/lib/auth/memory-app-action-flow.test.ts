import { describe, expect, it } from "vitest";
import {
  type ActionRequestRow,
  type ActionResultRow,
  buildConsentEventRow,
  type ConsentEventRow,
  canonicalRequestHash,
  hashActionCode,
} from "./account-action";
import {
  DEFAULT_ACCOUNT_ACTION_ISSUER,
  handleActionDecision,
  handleCreateActionRequest,
  handleExchangeActionCode,
} from "./account-action-routes";
import type { LoginSessionAdapter } from "./login-session-adapter";

type MemoryActionFixture = {
  actionType: string;
  executionMode: "mock";
  resultMode: "mock";
  state: string;
  requestedData: {
    connector: string;
    scopes: string[];
    purposeCode: string;
    purposeDescription: string;
    accessMode: string;
  };
  displayMetadata: {
    title: string;
    description: string;
  };
};

type MemoryActionModule = {
  buildMemoryActionExchangeRequest(actionCode: string): {
    client_id: string;
    action_code: string;
  };
  buildMemoryActionFixture(): MemoryActionFixture;
  buildMemoryActionRequest(actionFixture?: MemoryActionFixture): {
    client_id: string;
    redirect_uri: string;
    action_type: string;
    execution_mode: "mock";
    result_mode: "mock";
    requested_data: MemoryActionFixture["requestedData"];
    display_metadata: MemoryActionFixture["displayMetadata"];
    state: string;
  };
};

const VANA_USER_ID = "vana_user_0123456789abcdef0123456789abcdef";
// prettier-ignore
const actionFixtureModulePromise = import(
  "../../../../spikes/oidc-rp-fixture/action-config.mjs"
) as Promise<MemoryActionModule>;

async function loadActionFixture(): Promise<MemoryActionModule> {
  return actionFixtureModulePromise;
}

const loggedInSession: LoginSessionAdapter = {
  resolveLoginEvidence: async () => ({
    privySubject: "did:privy:memory-user",
    email: "memory-user@example.test",
  }),
};

function extractActionCode(redirectUrl: string | null): string {
  if (!redirectUrl) throw new Error("expected redirect_url");
  const actionCode = new URL(redirectUrl).searchParams.get("action_code");
  if (!actionCode) throw new Error("expected action_code on redirect_url");
  return actionCode;
}

describe("Memory App account-hosted action fixture", () => {
  it("requests a mock action, approves it, exchanges the code, and persists action events", async () => {
    const {
      buildMemoryActionExchangeRequest,
      buildMemoryActionFixture,
      buildMemoryActionRequest,
    } = await loadActionFixture();
    const actionFixture = buildMemoryActionFixture();

    let actionRequest: ActionRequestRow | null = null;
    let actionResult: ActionResultRow | null = null;
    const events: ConsentEventRow[] = [];

    const create = await handleCreateActionRequest({
      body: buildMemoryActionRequest(actionFixture),
      baseUrl: DEFAULT_ACCOUNT_ACTION_ISSUER,
      now: new Date("2026-04-29T12:00:00.000Z"),
      insertActionRequest: async (row) => {
        actionRequest = row;
        return row;
      },
      insertConsentEvent: async (row) => {
        events.push(row);
        return row;
      },
    });
    expect(create.kind).toBe("ok");
    if (create.kind !== "ok") return;
    expect(create.body.action_url).toContain("/account/actions/");
    expect(create.body.action_url).toContain(
      `state=${encodeURIComponent(actionFixture.state)}`,
    );
    expect(events.map((event) => event.event_type)).toEqual([
      "action.requested",
    ]);

    const approve = await handleActionDecision({
      request: new Request(create.body.action_url, {
        headers: { authorization: "Bearer privy-token-stub" },
      }),
      actionRequestId: create.body.action_request_id,
      body: { decision: "approved", state: actionFixture.state },
      sessionAdapter: loggedInSession,
      resolveVanaUser: async () => ({ user: { id: VANA_USER_ID } }),
      findActionRequestById: async () => actionRequest,
      now: new Date("2026-04-29T12:01:00.000Z"),
      persistActionDecisionBundle: async ({
        id,
        decision,
        vanaUserId,
        decidedAt,
        result,
        event,
      }) => {
        if (!actionRequest) throw new Error("missing action request");
        if (actionRequest.id !== id || actionRequest.status !== "pending") {
          return null;
        }
        actionRequest = {
          ...actionRequest,
          status: decision,
          vana_user_id: vanaUserId,
          decided_at: decidedAt,
        };
        actionResult = result;
        events.push(event);
        return { request: actionRequest, result, event };
      },
    });
    expect(approve.kind).toBe("ok");
    if (approve.kind !== "ok") return;
    const actionCode = extractActionCode(approve.body.redirect_url);
    expect(
      new URL(approve.body.redirect_url ?? "").searchParams.get("state"),
    ).toBe(actionFixture.state);
    expect(events.map((event) => event.event_type)).toEqual([
      "action.requested",
      "action.approved",
    ]);

    const exchange = await handleExchangeActionCode({
      body: buildMemoryActionExchangeRequest(actionCode),
      now: new Date("2026-04-29T12:01:10.000Z"),
      consumeActionCodeWithExchangeEvent: async ({
        presentedCode,
        presentingClientId,
        issuer,
        now,
      }) => {
        if (!actionRequest || !actionResult) {
          throw new Error("missing approved action state");
        }
        if (actionResult.action_code_hash !== hashActionCode(presentedCode)) {
          return { ok: false, reason: "not_found" };
        }
        if (actionResult.client_id !== presentingClientId) {
          return { ok: false, reason: "client_mismatch" };
        }
        if (actionResult.consumed_at !== null) {
          return { ok: false, reason: "consumed" };
        }

        const consumedResult = {
          ...actionResult,
          consumed_at: now?.toISOString() ?? new Date().toISOString(),
        };
        actionResult = consumedResult;
        events.push(
          buildConsentEventRow({
            request: actionRequest,
            eventType: "action.exchanged",
            vanaUserId: actionRequest.vana_user_id,
            idempotencyKey: `${actionRequest.id}:exchanged`,
            requestHash: canonicalRequestHash({
              clientId: actionRequest.client_id,
              actionType: actionRequest.action_type,
              executionMode: actionRequest.execution_mode,
              resultMode: actionRequest.result_mode,
              requestedData: actionRequest.requested_data,
              redirectUri: actionRequest.redirect_uri,
            }),
            issuer: issuer ?? DEFAULT_ACCOUNT_ACTION_ISSUER,
            now: now ?? new Date("2026-04-29T12:01:10.000Z"),
          }),
        );
        return { ok: true, result: consumedResult };
      },
    });
    expect(exchange.kind).toBe("ok");
    if (exchange.kind !== "ok") return;
    expect(exchange.body).toMatchObject({
      action_request_id: create.body.action_request_id,
      result_mode: "mock",
      result_payload: { mock: true, action_type: actionFixture.actionType },
      result_reference: null,
    });
    expect(JSON.stringify(exchange.body)).not.toContain(actionCode);
    expect(JSON.stringify(exchange.body)).not.toContain(actionFixture.state);
    expect(JSON.stringify(exchange.body)).not.toContain(VANA_USER_ID);
    expect(events.map((event) => event.event_type)).toEqual([
      "action.requested",
      "action.approved",
      "action.exchanged",
    ]);
  });
});
