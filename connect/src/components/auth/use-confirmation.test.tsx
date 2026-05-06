import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readVanaAccessCookie, useConfirmation } from "./use-confirmation";

function setVanaAccessCookie(value: string | null) {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => (value ? `vana_access=${value}; foo=bar` : "foo=bar"),
  });
}

function makeConfirmationResponse(
  body: Record<string, unknown> | string,
  status = 401,
) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  error: "confirmation_required",
  confirmation_id: "conf_abc",
  payload_summary: { action: "register-on-chain", server_id: "srv_1" },
  expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
};

beforeEach(() => {
  setVanaAccessCookie("vat_test_token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readVanaAccessCookie", () => {
  it("reads the vana_access cookie value", () => {
    setVanaAccessCookie("vat_xyz");
    expect(readVanaAccessCookie()).toBe("vat_xyz");
  });

  it("returns null when the cookie is missing", () => {
    setVanaAccessCookie(null);
    expect(readVanaAccessCookie()).toBeNull();
  });
});

describe("useConfirmation", () => {
  it("starts with pending=null and error=null", () => {
    const { result } = renderHook(() => useConfirmation());
    expect(result.current.pending).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("handle401 with non-401 response returns null without setting pending", async () => {
    const { result } = renderHook(() => useConfirmation());
    const ok = new Response("{}", { status: 200 });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.handle401(ok);
    });
    expect(returned).toBeNull();
    expect(result.current.pending).toBeNull();
  });

  it("handle401 with 401 + valid confirmation_required body sets pending", async () => {
    const { result } = renderHook(() => useConfirmation());
    const response = makeConfirmationResponse(VALID_BODY);

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.handle401(response);
    });
    // Wait for state to flush and the body to parse.
    await waitFor(() => {
      expect(result.current.pending?.confirmation_id).toBe("conf_abc");
    });
    expect(result.current.pending?.payload_summary).toEqual(
      VALID_BODY.payload_summary,
    );

    // Promise stays unresolved until the user acts. Settle it via dismiss
    // so the hook doesn't leak a pending promise.
    act(() => {
      result.current.dismiss();
    });
    await expect(promise).resolves.toBeNull();
  });

  it("handle401 ignores 401s whose body is not confirmation_required", async () => {
    const { result } = renderHook(() => useConfirmation());
    const response = makeConfirmationResponse({ error: "unauthorized" }, 401);
    let returned: unknown;
    await act(async () => {
      returned = await result.current.handle401(response);
    });
    expect(returned).toBeNull();
    expect(result.current.pending).toBeNull();
  });

  it("on consume success returns { confirmedId } and clears pending", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const { result } = renderHook(() => useConfirmation());

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.handle401(makeConfirmationResponse(VALID_BODY));
    });
    await waitFor(() => {
      expect(result.current.pending).not.toBeNull();
    });

    await act(async () => {
      await result.current.confirm();
    });

    await expect(promise).resolves.toEqual({ confirmedId: "conf_abc" });
    expect(result.current.pending).toBeNull();
    expect(result.current.error).toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/confirmations/conf_abc/consume",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );
    const consumeCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/auth/confirmations/conf_abc/consume",
    );
    const headers = consumeCall?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer vat_test_token");
  });

  it("on consume failure sets error and resolves null", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"already_consumed"}', { status: 409 }),
    );

    const { result } = renderHook(() => useConfirmation());

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.handle401(makeConfirmationResponse(VALID_BODY));
    });
    await waitFor(() => {
      expect(result.current.pending).not.toBeNull();
    });

    await act(async () => {
      await result.current.confirm();
    });

    await expect(promise).resolves.toBeNull();
    expect(result.current.error).toContain("409");
  });

  it("dismiss() clears pending and resolves the in-flight handle401 with null", async () => {
    const { result } = renderHook(() => useConfirmation());

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.handle401(makeConfirmationResponse(VALID_BODY));
    });
    await waitFor(() => {
      expect(result.current.pending).not.toBeNull();
    });

    act(() => {
      result.current.dismiss();
    });

    await expect(promise).resolves.toBeNull();
    expect(result.current.pending).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets error and resolves null when access cookie is missing", async () => {
    setVanaAccessCookie(null);
    const { result } = renderHook(() => useConfirmation());

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.handle401(makeConfirmationResponse(VALID_BODY));
    });
    await waitFor(() => {
      expect(result.current.pending).not.toBeNull();
    });

    await act(async () => {
      await result.current.confirm();
    });

    await expect(promise).resolves.toBeNull();
    // vanaFetch can't bootstrap without a registered identity-token getter,
    // so it throws VanaSessionUnavailableError; confirm surfaces the message.
    expect(result.current.error).toContain("Vana session");
  });
});
