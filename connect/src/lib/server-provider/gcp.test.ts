// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GCPProvider } from "./gcp";

const cloud = vi.hoisted(() => ({
  deleteInstance: vi.fn(),
  deleteDisk: vi.fn(),
  getOperation: vi.fn(),
}));

vi.mock("@google-cloud/compute", () => ({
  InstancesClient: class {
    delete = cloud.deleteInstance;
  },
  DisksClient: class {
    delete = cloud.deleteDisk;
  },
  ZoneOperationsClient: class {
    get = cloud.getOperation;
  },
}));

beforeEach(() => {
  cloud.deleteInstance
    .mockReset()
    .mockResolvedValue([{ latestResponse: { status: "DONE" } }]);
  cloud.deleteDisk
    .mockReset()
    .mockResolvedValue([{ latestResponse: { status: "DONE" } }]);
  cloud.getOperation.mockReset();
  vi.stubEnv("GCP_PROJECT", "test-project");
  vi.stubEnv("GCP_SERVICE_ACCOUNT_KEY", "");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account");
  vi.stubEnv("CLOUDFLARE_ZONE_ID", "test-zone");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const handles = { tunnelId: "test-tunnel", dnsRecordId: "test-record" };

it("reports a failed DNS deletion after attempting the remaining cleanup", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        {
          success: false,
          errors: [{ code: 9109, message: "DNS access denied" }],
        },
        { status: 403 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ success: true, result: {} }));
  vi.stubGlobal("fetch", fetch);

  await expect(
    new GCPProvider().deprovision("test-vm", handles),
  ).rejects.toThrow("DNS access denied");
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/cfd_tunnel/test-tunnel?cascade=true"),
    expect.objectContaining({ method: "DELETE" }),
  );
  expect(cloud.deleteInstance).toHaveBeenCalledWith(
    expect.objectContaining({ instance: "test-vm" }),
    expect.objectContaining({ timeout: expect.any(Number) }),
  );
  expect(cloud.deleteDisk).toHaveBeenCalledWith(
    expect.objectContaining({ disk: "test-vm-data" }),
    expect.objectContaining({ timeout: expect.any(Number) }),
  );
});

it("allows cleanup to succeed when the DNS record is already gone", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        {
          success: false,
          errors: [{ code: 81044, message: "Record not found" }],
        },
        { status: 404 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ success: true, result: {} }));
  vi.stubGlobal("fetch", fetch);

  await expect(
    new GCPProvider().deprovision("test-vm", handles),
  ).resolves.toBeUndefined();
});

it("checks the outcome of a pending VM deletion before reporting cleanup", async () => {
  cloud.deleteInstance.mockResolvedValue([
    { latestResponse: { name: "delete-vm", status: "PENDING" } },
  ]);
  cloud.getOperation.mockResolvedValue([
    { status: "DONE", error: { errors: [{ message: "VM deletion failed" }] } },
  ]);

  await expect(new GCPProvider().deprovision("test-vm")).rejects.toThrow(
    "VM deletion failed",
  );
});

it("reports a failed disk operation even when the delete request was accepted", async () => {
  cloud.deleteDisk.mockResolvedValueOnce([
    {
      latestResponse: {
        status: "DONE",
        error: { errors: [{ message: "Disk deletion failed" }] },
      },
    },
  ]);

  await expect(new GCPProvider().deprovision("test-vm")).rejects.toThrow(
    "Disk deletion failed",
  );
});

it("rejects cleanup when the route's remaining time is exhausted", async () => {
  await expect(
    new GCPProvider().deprovision("test-vm", { deadline: Date.now() - 1 }),
  ).rejects.toThrow("Server cleanup timed out");
  expect(cloud.deleteInstance).not.toHaveBeenCalled();
  expect(cloud.deleteDisk).not.toHaveBeenCalled();
});
