import { describe, expect, it } from "vitest";
import { OPTIONS, POST } from "./route";

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function request(body: Record<string, unknown>) {
  return new Request("https://account.vana.org/api/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/sign compatibility guardrails", () => {
  it("keeps permissive CORS preflight for transitional callers", async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
  });

  it("requires a master key signature before any signing operation", async () => {
    const response = await POST(request({ type: "personal_sign" }) as never);
    const body = await json(response);

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Missing masterKeySignature" });
  });

  it("rejects non-JSON legacy posts before parsing the body", async () => {
    const response = await POST(
      new Request("https://account.vana.org/api/sign", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not-json",
      }) as never,
    );
    const body = await json(response);

    expect(response.status).toBe(415);
    expect(body).toEqual({ error: "Content-Type must be application/json" });
  });

  it("keeps the signing operation allowlist before Privy wallet use", async () => {
    const response = await POST(
      request({
        masterKeySignature: "0xsignature",
        type: "eth_sign",
        message: "arbitrary-message",
      }) as never,
    );
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid signing type" });
  });
});
