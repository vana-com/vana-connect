// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PersonalServer, ProvisioningProgress } from "@/lib/db/neon";
import { GCPProvider } from "./gcp";

const cloud = vi.hoisted(() => ({
  deleteInstance: vi.fn(),
  deleteDisk: vi.fn(),
  getOperation: vi.fn(),
  listOperations: vi.fn(),
  insertInstance: vi.fn(),
}));

vi.mock("@google-cloud/compute", () => ({
  InstancesClient: class {
    delete = cloud.deleteInstance;
    insert = cloud.insertInstance;
  },
  DisksClient: class {
    delete = cloud.deleteDisk;
  },
  ZoneOperationsClient: class {
    get = cloud.getOperation;
    list = cloud.listOperations;
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
  cloud.listOperations.mockReset();
  cloud.insertInstance.mockReset();
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
  ).rejects.toThrow("Server operation timed out");
  expect(cloud.deleteInstance).not.toHaveBeenCalled();
  expect(cloud.deleteDisk).not.toHaveBeenCalled();
});

it("reports an unconfirmed deletion when the SDK keeps waiting past the deadline", async () => {
  vi.useFakeTimers();
  try {
    cloud.deleteInstance.mockReturnValue(new Promise(() => {}));
    const result = new GCPProvider().deprovision("test-vm", {
      deadline: Date.now() + 1000,
    });
    const rejected = expect(result).rejects.toThrow(
      "Server operation timed out",
    );
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(cloud.deleteDisk).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

const attempt = {
  id: "srv_b2915e9a-6d1c-446d-840e-3f9a2b087ab9",
  user_id: "wallet",
  provider_id: "test-vm",
  disk_id: "test-vm-data",
  tunnel_id: "test-tunnel",
  dns_record_id: "test-record",
  provisioning_step: "compute",
  compute_operation: null,
} as PersonalServer;

function cloudflare(result: unknown) {
  return Response.json({ success: true, result });
}

it("checkpoints each resource before starting the next cloud mutation", async () => {
  const saved: ProvisioningProgress[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/cfd_tunnel")) {
        expect(saved.at(-1)).toEqual({ step: "tunnel" });
        return cloudflare({ id: "new-tunnel" });
      }
      if (path.endsWith("/configurations")) {
        expect(saved.at(-1)).toEqual({
          step: "tunnel",
          tunnelId: "new-tunnel",
        });
        return cloudflare({});
      }
      if (path.endsWith("/dns_records")) {
        expect(saved.at(-1)).toEqual({ step: "dns" });
        return cloudflare({ id: "new-record" });
      }
      if (path.endsWith("/token")) {
        expect(saved.at(-1)).toEqual({
          step: "dns",
          dnsRecordId: "new-record",
        });
        return cloudflare("fixture-token");
      }
      throw new Error(`Unexpected path ${path}`);
    }),
  );
  cloud.insertInstance.mockImplementation(async () => {
    expect(saved.at(-1)).toMatchObject({
      step: "compute",
      instanceName: expect.any(String),
      diskName: expect.any(String),
    });
    return [{ latestResponse: { name: "new-operation", status: "PENDING" } }];
  });

  await new GCPProvider().provision({
    serverId: attempt.id,
    userId: attempt.user_id,
    ownerAddress: attempt.user_id,
    masterKeySignature: "fixture-signature",
    deadline: Date.now() + 10_000,
    recordProgress: async (progress) => {
      saved.push(progress);
    },
  });
  expect(saved.at(-1)).toEqual({
    step: "compute",
    computeOperation: "new-operation",
  });
});

it("persists a tunnel recovered after its create reply was lost before deleting it", async () => {
  const saved: ProvisioningProgress[] = [];
  const name = `ps-${attempt.id.slice(4)}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, request?: RequestInit) => {
      if (request?.method === "DELETE") {
        expect(saved).toEqual([
          { step: "tunnel", tunnelId: "recovered-tunnel" },
        ]);
        expect(url).toContain("/cfd_tunnel/recovered-tunnel?");
        return cloudflare({});
      }
      expect(new URL(url).searchParams.get("name")).toBe(name);
      return cloudflare([{ name, id: "recovered-tunnel" }]);
    }),
  );

  await new GCPProvider().recoverProvisioning(
    {
      ...attempt,
      provisioning_step: "tunnel",
      tunnel_id: null,
      dns_record_id: null,
      provider_id: null,
      disk_id: null,
    },
    Date.now() + 10_000,
    async (handles) => {
      saved.push(handles);
    },
  );

  expect(saved).toHaveLength(1);
});

it.each([
  { reply: [], message: "DNS creation could not be confirmed" },
  {
    reply: [
      {
        id: "unrelated",
        name: "wallet.myvana.app",
        comment: "manual",
        content: "test-tunnel.cfargotunnel.com",
      },
    ],
    message: "DNS creation could not be confirmed",
  },
])(
  "keeps cleanup blocked when a lost DNS reply cannot be reconciled",
  async ({ reply, message }) => {
    const fetch = vi.fn().mockResolvedValue(cloudflare(reply));
    vi.stubGlobal("fetch", fetch);

    await expect(
      new GCPProvider().recoverProvisioning(
        {
          ...attempt,
          provisioning_step: "dns",
          dns_record_id: null,
          provider_id: null,
          disk_id: null,
        },
        Date.now() + 10_000,
        async () => {
          throw new Error("Unexpected adoption");
        },
      ),
    ).rejects.toThrow(message);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cloud.deleteInstance).not.toHaveBeenCalled();
  },
);

it("keeps cleanup blocked while a recovered Compute insert is still pending", async () => {
  const operation = {
    name: "lost-create",
    operationType: "insert",
    targetLink: "projects/test-project/zones/us-central1-a/instances/test-vm",
    clientOperationId: attempt.id.slice(4),
  };
  cloud.listOperations.mockResolvedValue([[operation], null]);
  cloud.getOperation.mockResolvedValue([{ status: "PENDING" }]);
  const saved = vi.fn();

  await expect(
    new GCPProvider().recoverProvisioning(attempt, Date.now() + 10_000, saved),
  ).rejects.toThrow("Compute creation is still pending");

  expect(saved).toHaveBeenCalledWith({
    step: "compute",
    computeOperation: "lost-create",
  });
  expect(cloud.deleteInstance).not.toHaveBeenCalled();
});

it("removes the recorded VM and disk once the create operation is terminal", async () => {
  cloud.getOperation.mockResolvedValue([{ status: "DONE" }]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => cloudflare({})),
  );

  await new GCPProvider().recoverProvisioning(
    { ...attempt, compute_operation: "confirmed-create" },
    Date.now() + 10_000,
    async () => {
      throw new Error("Unexpected adoption");
    },
  );

  expect(cloud.deleteInstance).toHaveBeenCalledWith(
    expect.objectContaining({ instance: attempt.provider_id }),
    expect.anything(),
  );
  expect(cloud.deleteDisk).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ disk: attempt.disk_id }),
    expect.anything(),
  );
});

it("reports a Cloudflare route error instead of counting it as confirmed absence", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { success: false, errors: [{ code: 7003, message: "Invalid route" }] },
        { status: 404 },
      ),
    );
  vi.stubGlobal("fetch", fetch);

  await expect(
    new GCPProvider().deprovision("", { dnsRecordId: "test-record" }),
  ).rejects.toThrow("Invalid route");
});

it("persists a recovered DNS record before removing it", async () => {
  const saved: ProvisioningProgress[] = [];
  const record = {
    id: "recovered-dns",
    name: "wallet.myvana.app",
    comment: `Managed by vana-connect for attempt ${attempt.id}`,
    content: "test-tunnel.cfargotunnel.com",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, request?: RequestInit) => {
      if (request?.method === "DELETE") {
        expect(saved).toEqual([{ step: "dns", dnsRecordId: record.id }]);
        return cloudflare({});
      }
      expect(new URL(url).searchParams.get("name.exact")).toBe(record.name);
      return cloudflare([record]);
    }),
  );

  await new GCPProvider().recoverProvisioning(
    {
      ...attempt,
      provisioning_step: "dns",
      dns_record_id: null,
      provider_id: null,
      disk_id: null,
    },
    Date.now() + 10_000,
    async (handles) => {
      saved.push(handles);
    },
  );

  expect(saved).toHaveLength(1);
});
