import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanForProviderLeak, withTripwire } from "./tripwire";

describe("scanForProviderLeak", () => {
  it("matches did:privy:", () => {
    expect(scanForProviderLeak("hi did:privy:abc bye")).not.toBeNull();
  });

  it("matches did:para:", () => {
    expect(scanForProviderLeak("did:para:xyz")).not.toBeNull();
  });

  it("matches did:dynamic: case-insensitive", () => {
    expect(scanForProviderLeak("DID:DYNAMIC:abc")).not.toBeNull();
  });

  it("returns null when no provider DID present", () => {
    expect(scanForProviderLeak('{"vanaUserId":"vana_user_abc"}')).toBeNull();
  });

  it("includes context around the match", () => {
    const body = "x".repeat(50) + "did:privy:secret" + "y".repeat(50);
    const result = scanForProviderLeak(body);
    expect(result).not.toBeNull();
    expect(result!.match).toContain("did:privy:");
    expect(result!.context.length).toBeLessThanOrEqual(120);
  });
});

describe("withTripwire", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through responses with no provider DID", async () => {
    const handler = vi.fn(
      async () =>
        new Response(JSON.stringify({ vanaUserId: "vana_user_abc" }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const wrapped = withTripwire(handler);
    const res = await wrapped();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vanaUserId).toBe("vana_user_abc");
  });

  it("returns 500 PROVIDER_CONTAINMENT_VIOLATION when body contains a provider DID (in dev)", async () => {
    // NODE_ENV is 'test' in vitest by default, NOT 'production', so the
    // tripwire is enabled.
    const handler = async () =>
      new Response(JSON.stringify({ leaked: "did:privy:abc123" }), {
        headers: { "content-type": "application/json" },
      });
    const wrapped = withTripwire(handler);
    const res = await wrapped();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("PROVIDER_CONTAINMENT_VIOLATION");
    expect(body.match).toContain("did:privy:");
  });

  it("ignores non-JSON responses", async () => {
    const handler = async () =>
      new Response("did:privy:in-text-body", {
        headers: { "content-type": "text/plain" },
      });
    const wrapped = withTripwire(handler);
    const res = await wrapped();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("did:privy:in-text-body");
  });
});
