// @vitest-environment node
import { NextRequest } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PersonalServer, ProvisioningProgress } from "@/lib/db/neon";
import type { ProvisionParams } from "@/lib/server-provider/types";
import { DELETE, GET as getServer } from "./[id]/route";
import { POST } from "./route";

const fixtures = vi.hoisted(() => ({
  row: null as PersonalServer | null,
  provision: vi.fn(),
  recover: vi.fn(),
}));

vi.mock("@/lib/db/neon", () => ({
  findServerByUserId: async (id: string) =>
    fixtures.row?.user_id === id ? fixtures.row : null,
  findServerById: async (id: string) =>
    fixtures.row?.id === id ? fixtures.row : null,
  insertServerIfNotExists: async (identity: Partial<PersonalServer>) => {
    if (fixtures.row) return null;
    fixtures.row = {
      ...identity,
      provisioning_step: "reserved",
      provisioning_expires_at: new Date(Date.now() + 75_000).toISOString(),
      cleanup_claim: null,
      compute_operation: null,
      provider_id: null,
      tunnel_id: null,
      dns_record_id: null,
      disk_id: null,
    } as PersonalServer;
    return fixtures.row;
  },
  recordProvisioningProgress: async (
    _id: string,
    progress: ProvisioningProgress,
  ) => {
    if (!fixtures.row) throw new Error("No active provisioning attempt");
    const row = fixtures.row;
    row.provisioning_step = progress.step;
    row.provider_id = progress.instanceName ?? row.provider_id;
    row.tunnel_id = progress.tunnelId ?? row.tunnel_id;
    row.dns_record_id = progress.dnsRecordId ?? row.dns_record_id;
    row.compute_operation = progress.computeOperation ?? row.compute_operation;
  },
  finishProvisioning: async (_id: string, url: string, token: string) => {
    if (!fixtures.row) return null;
    fixtures.row.provisioning_step = null;
    fixtures.row.provisioning_expires_at = null;
    fixtures.row.control_plane_token = token;
    fixtures.row.url = url;
    return fixtures.row;
  },
  failProvisioning: async () => {
    if (!fixtures.row) return;
    fixtures.row.state = "deprovision_failed";
    fixtures.row.provisioning_expires_at = null;
  },
  claimServerCleanup: async (id: string, claim: string) => {
    const row = fixtures.row;
    if (
      !row ||
      row.id !== id ||
      row.cleanup_claim ||
      (row.provisioning_expires_at &&
        new Date(row.provisioning_expires_at).getTime() > Date.now())
    )
      return null;
    row.cleanup_claim = claim;
    row.state = "deprovision_failed";
    return row;
  },
  saveRecoveryHandles: async () => {},
  finishServerCleanup: async (id: string, claim: string) => {
    if (fixtures.row?.id !== id || fixtures.row.cleanup_claim !== claim)
      return false;
    fixtures.row = null;
    return true;
  },
  releaseServerCleanup: async () => {
    if (fixtures.row) fixtures.row.cleanup_claim = null;
  },
}));

vi.mock("@/lib/server-provider", () => ({
  getServerProvider: () => ({
    provision: fixtures.provision,
    recoverProvisioning: fixtures.recover,
  }),
}));

const account = privateKeyToAccount(generatePrivateKey());
const url = "https://fixture.invalid/api/servers";

async function request(method: "POST" | "GET" | "DELETE", id?: string) {
  const signature = await account.signMessage({
    message: "vana-master-key-v1",
  });
  return new NextRequest(id ? `${url}/${id}` : url, {
    method,
    headers: { authorization: `Bearer ${signature}` },
    body:
      method === "POST"
        ? JSON.stringify({ masterKeySignature: signature })
        : undefined,
  });
}

async function remove(id: string) {
  return DELETE(await request("DELETE", id), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  fixtures.row = null;
  fixtures.provision.mockReset();
  fixtures.recover.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

it("stores the token and publishes the endpoint after a successful create", async () => {
  fixtures.provision.mockImplementation(async (input: ProvisionParams) => {
    await input.recordProgress({
      step: "compute",
      instanceName: "fixture-vm",
      tunnelId: "fixture-tunnel",
      dnsRecordId: "fixture-dns",
      computeOperation: "fixture-op",
    });
    return { url: "https://fixture.invalid" };
  });

  const response = await POST(await request("POST"));

  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    provider_id: "fixture-vm",
    url: "https://fixture.invalid",
    state: "provisioning",
  });
  expect(fixtures.row?.control_plane_token).toMatch(/^vana_ps_/);
  expect(fixtures.row?.control_plane_token).toBe(
    fixtures.provision.mock.calls[0][0].psAccessToken,
  );
  expect(fixtures.row).toMatchObject({
    tunnel_id: "fixture-tunnel",
    dns_record_id: "fixture-dns",
  });
});

it("keeps a setup failure discoverable so the owner can retry cleanup", async () => {
  fixtures.provision.mockImplementation(async (input: ProvisionParams) => {
    await input.recordProgress({ step: "dns", tunnelId: "tunnel-created" });
    throw new Error("connection reset");
  });
  const response = await POST(await request("POST"));

  expect(response.status).toBe(500);
  expect(fixtures.row).toMatchObject({
    tunnel_id: "tunnel-created",
    state: "deprovision_failed",
  });
  const retry = await POST(await request("POST"));
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({
    id: fixtures.row?.id,
    state: "deprovision_failed",
  });
  expect(fixtures.provision).toHaveBeenCalledTimes(1);
});

it("blocks concurrent removal and replacement until an expired attempt is cleaned up", async () => {
  const reachedProvider = Promise.withResolvers<void>();
  const provision = Promise.withResolvers<never>();
  fixtures.provision.mockImplementation(async (input: ProvisionParams) => {
    await input.recordProgress({ step: "dns", tunnelId: "tunnel-created" });
    reachedProvider.resolve();
    return provision.promise;
  });
  const creating = POST(await request("POST"));
  await reachedProvider.promise;
  const row = fixtures.row;
  if (!row) throw new Error("Expected a provisioning row");
  const { id } = row;

  try {
    expect((await remove(id)).status).toBe(409);
    expect(fixtures.recover).not.toHaveBeenCalled();

    // The original request is still unresolved, as it would be after a hard kill.
    row.provisioning_expires_at = new Date(Date.now() - 1).toISOString();
    const expired = await getServer(await request("GET", id), {
      params: Promise.resolve({ id }),
    });
    expect(await expired.json()).toMatchObject({
      id,
      state: "deprovision_failed",
    });

    fixtures.recover.mockRejectedValueOnce(new Error("cleanup unavailable"));
    expect((await remove(id)).status).toBe(500);
    expect(fixtures.row?.id).toBe(id);

    const cleaning = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    fixtures.recover.mockImplementationOnce(async () => {
      started.resolve();
      await cleaning.promise;
    });
    const deletion = remove(id);
    await started.promise;
    try {
      expect((await remove(id)).status).toBe(409);
      const duplicate = await POST(await request("POST"));
      expect(duplicate.status).toBe(200);
      expect(await duplicate.json()).toMatchObject({ id });
      expect(fixtures.provision).toHaveBeenCalledTimes(1);
    } finally {
      cleaning.resolve();
    }
    expect((await deletion).status).toBe(200);
    expect(fixtures.row).toBeNull();
  } finally {
    provision.reject(new Error("request expired"));
    await creating;
  }
});

it("keeps an older handle-less record for manual reconciliation", async () => {
  fixtures.row = {
    id: "srv_legacy",
    user_id: account.address.toLowerCase(),
    state: "provisioning",
    provisioning_step: null,
    provisioning_expires_at: null,
    provider_id: null,
    tunnel_id: null,
    dns_record_id: null,
    url: null,
  } as PersonalServer;

  expect((await remove("srv_legacy")).status).toBe(500);
  expect(fixtures.row).toMatchObject({
    id: "srv_legacy",
    state: "deprovision_failed",
  });
  expect(fixtures.recover).not.toHaveBeenCalled();
});

it("removes an expired reservation that never attempted a cloud write", async () => {
  fixtures.row = {
    id: "srv_reserved",
    user_id: account.address.toLowerCase(),
    state: "provisioning",
    provisioning_step: "reserved",
    provisioning_expires_at: new Date(Date.now() - 1000),
  } as PersonalServer;

  expect((await remove("srv_reserved")).status).toBe(200);
  expect(fixtures.row).toBeNull();
  expect(fixtures.recover).not.toHaveBeenCalled();
});

it("passes the recorded resources of an existing server to cleanup", async () => {
  fixtures.row = {
    id: "srv_existing",
    user_id: account.address.toLowerCase(),
    state: "running",
    provisioning_step: null,
    provisioning_expires_at: null,
    provider_id: "existing-vm",
    tunnel_id: "existing-tunnel",
    dns_record_id: "existing-dns",
    url: "https://fixture.invalid",
  } as PersonalServer;
  expect((await remove("srv_existing")).status).toBe(200);
  expect(fixtures.recover).toHaveBeenCalledWith(
    expect.objectContaining({
      provider_id: "existing-vm",
      tunnel_id: "existing-tunnel",
      dns_record_id: "existing-dns",
    }),
    expect.any(Number),
    expect.any(Function),
  );
  expect(fixtures.row).toBeNull();
});
