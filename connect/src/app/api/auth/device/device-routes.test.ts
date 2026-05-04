import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST as approveDevice } from "./approve/route";
import { GET as pollDevice } from "./poll/route";
import { POST as createDevice, OPTIONS } from "./route";

const mocks = vi.hoisted(() => ({
  approveDeviceCode: vi.fn(),
  createDeviceCode: vi.fn(),
  createSession: vi.fn(),
  findDeviceCode: vi.fn(),
  findDeviceCodeByUserCode: vi.fn(),
  findServerByUserId: vi.fn(),
  findSession: vi.fn(),
  updateDeviceCodeLastPolled: vi.fn(),
  recoverWalletAddress: vi.fn(),
  provisionPersonalServerSessionToken: vi.fn(),
}));

vi.mock("@/lib/db/neon", () => ({
  approveDeviceCode: mocks.approveDeviceCode,
  createDeviceCode: mocks.createDeviceCode,
  createSession: mocks.createSession,
  findDeviceCode: mocks.findDeviceCode,
  findDeviceCodeByUserCode: mocks.findDeviceCodeByUserCode,
  findServerByUserId: mocks.findServerByUserId,
  findSession: mocks.findSession,
  updateDeviceCodeLastPolled: mocks.updateDeviceCodeLastPolled,
}));

vi.mock("@/lib/api-auth", () => ({
  recoverWalletAddress: mocks.recoverWalletAddress,
}));

vi.mock("@/lib/auth/personal-server-session", () => ({
  provisionPersonalServerSessionToken:
    mocks.provisionPersonalServerSessionToken,
}));

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("device auth API compatibility", () => {
  it("keeps the device-code creation response shape used by CLI clients", async () => {
    mocks.createDeviceCode.mockResolvedValueOnce({});

    const response = await createDevice();
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.device_code).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(body.user_code).toEqual(
      expect.stringMatching(
        /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/,
      ),
    );
    expect(body.verification_uri).toBe("https://account.vana.org/auth/device");
    expect(body.expires_in).toBe(300);
    expect(body.interval).toBe(5);
    expect(mocks.createDeviceCode).toHaveBeenCalledTimes(1);
  });

  it("keeps device-route OPTIONS CORS preflight behavior", async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST",
    );
  });

  it("keeps approve validation before wallet recovery or DB mutation", async () => {
    const request = new NextRequest(
      "https://account.vana.org/api/auth/device/approve",
      {
        method: "POST",
        body: JSON.stringify({ masterKeySignature: "0xsig" }),
      },
    );

    const response = await approveDevice(request);
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body.error).toEqual({
      type: "invalid_request_error",
      message: "Missing user_code",
    });
    expect(mocks.recoverWalletAddress).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.approveDeviceCode).not.toHaveBeenCalled();
  });

  it("keeps poll validation before DB lookup", async () => {
    const request = new NextRequest(
      "https://account.vana.org/api/auth/device/poll",
    );

    const response = await pollDevice(request);
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body.error).toEqual({
      type: "invalid_request_error",
      message: "Missing device_code parameter",
    });
    expect(mocks.findDeviceCode).not.toHaveBeenCalled();
  });
});
