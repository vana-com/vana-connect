import { describe, it, expect } from "vitest";
import { createSessionRelay } from "../../src/server/session-relay.js";
import { createRequestSigner } from "../../src/server/request-signer.js";
import {
  builderPrivateKey,
  builderAccount,
  getSessionRelayUrl,
} from "./utils.js";

const SESSION_RELAY_URL = getSessionRelayUrl();

describe("Connect flow E2E", () => {
  it("full session lifecycle: init → poll (pending) → claim → approve → poll (approved)", async () => {
    // 1. Create session via SDK
    const relay = createSessionRelay({
      privateKey: builderPrivateKey,
      granteeAddress: builderAccount.address,
      sessionRelayUrl: SESSION_RELAY_URL,
    });

    let session;
    try {
      session = await relay.initSession({
        scopes: ["test.data.read"],
      });
    } catch (err: unknown) {
      // Builder may not be registered — skip gracefully
      const msg = (err as Error).message ?? "";
      if (msg.includes("BUILDER_NOT_REGISTERED") || msg.includes("403")) {
        console.log("Builder not registered on-chain — skipping e2e flow test");
        return;
      }
      throw err;
    }

    expect(session.sessionId).toBeDefined();
    expect(session.deepLinkUrl).toContain("secret=");

    // 2. Poll — should be pending
    const pending = await relay.pollSession(session.sessionId);
    expect(pending.status).toBe("pending");

    // 3. Simulate Desktop App: extract secret from deep link
    const deepLink = new URL(session.deepLinkUrl);
    const secret = deepLink.searchParams.get("secret")!;
    expect(secret).toBeDefined();

    // 4. Claim session (simulating Desktop App)
    const claimRes = await fetch(`${SESSION_RELAY_URL}/v1/session/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.sessionId, secret }),
    });
    expect(claimRes.ok).toBe(true);

    // 5. Approve session (simulating Desktop App)
    const approveRes = await fetch(
      `${SESSION_RELAY_URL}/v1/session/${session.sessionId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          grantId: `test-grant-${Date.now()}`,
          userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          scopes: ["test.data.read"],
        }),
      },
    );
    expect(approveRes.ok).toBe(true);

    // 6. Poll — should be approved with grant
    const approved = await relay.pollSession(session.sessionId);
    expect(approved.status).toBe("approved");
    expect(approved.grant).toBeDefined();
    expect(approved.grant!.grantId).toBeDefined();
    expect(approved.grant!.userAddress).toBe(
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    );

    // 7. Verify request signing produces valid header
    const signer = createRequestSigner({ privateKey: builderPrivateKey });
    const authHeader = await signer.signRequest({
      aud: "https://test.server.vana.org",
      method: "GET",
      uri: "/v1/data/test.data.read",
      grantId: approved.grant!.grantId,
    });
    expect(authHeader).toMatch(/^Web3Signed /);
    expect(authHeader).toContain(".0x");
  });
});
