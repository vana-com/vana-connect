// @vitest-environment node
import { NextRequest } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalServer } from "@/lib/db/neon";
import type { ProvisionResult } from "@/lib/server-provider";

const ids = {
  providerId: "vm-1",
  tunnelId: "tunnel-1",
  dnsRecordId: "dns-1",
};
const provisioned: ProvisionResult = {
  serverId: ids.providerId,
  url: "https://fixture.example",
  tunnelId: ids.tunnelId,
  dnsRecordId: ids.dnsRecordId,
};

// In-memory store with the same null-on-missing-row contract as neon.ts, and
// a provider whose provision() the test holds open.
const ports = vi.hoisted(() => ({
  row: null as PersonalServer | null,
  tokens: [] as string[],
  provisionStarted: Promise.withResolvers<void>(),
  provisionRelease: Promise.withResolvers<void>(),
  provision: vi.fn(),
  deprovision: vi.fn(),
}));

vi.mock("@/lib/db/neon", () => ({
  findServerByUserId: async (userId: string) =>
    ports.row?.user_id === userId ? ports.row : null,
  insertServerIfNotExists: async (identity: Partial<PersonalServer>) => {
    ports.row = {
      ...identity,
      provider_id: null,
      control_plane_token: null,
      vm_ip: null,
      url: null,
      disk_id: null,
      disk_expires: null,
      tunnel_id: null,
      dns_record_id: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    } as PersonalServer;
    return ports.row;
  },
  updateServer: async (id: string, fields: Partial<PersonalServer>) => {
    if (ports.row?.id !== id) return null;
    ports.row = { ...ports.row, ...fields };
    return ports.row;
  },
  deleteServer: async (id: string) => {
    if (ports.row?.id === id) ports.row = null;
  },
  updateServerControlPlaneToken: async (_id: string, token: string) => {
    ports.tokens.push(token);
  },
}));

vi.mock("@/lib/server-provider", () => ({
  getServerProvider: () => ({
    provision: ports.provision,
    deprovision: ports.deprovision,
  }),
}));

import { POST } from "./route";

async function createServer() {
  const account = privateKeyToAccount(generatePrivateKey());
  const masterKeySignature = await account.signMessage({
    message: "vana-master-key-v1",
  });
  return POST(
    new NextRequest("https://fixture.example/api/servers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ masterKeySignature }),
    }),
  );
}

/** Start a create, delete its row while provision() is pending, then let it return. */
async function createDeletedDuringProvisioning() {
  const creating = createServer();
  await ports.provisionStarted.promise;
  // What DELETE does for a row with no provider handles: it just removes it.
  ports.row = null;
  ports.provisionRelease.resolve();
  return creating;
}

beforeEach(() => {
  ports.row = null;
  ports.tokens = [];
  ports.provisionStarted = Promise.withResolvers<void>();
  ports.provisionRelease = Promise.withResolvers<void>();
  ports.provision.mockReset().mockImplementation(async () => {
    ports.provisionStarted.resolve();
    await ports.provisionRelease.promise;
    return provisioned;
  });
  ports.deprovision.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/servers", () => {
  it("returns 201 and stores the control-plane token when the row survives provisioning", async () => {
    ports.provisionRelease.resolve();

    const response = await createServer();

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      state: "provisioning",
      provider_id: ids.providerId,
    });
    expect(ports.row).toMatchObject({
      provider_id: ids.providerId,
      tunnel_id: ids.tunnelId,
      dns_record_id: ids.dnsRecordId,
    });
    expect(ports.tokens).toEqual([
      ports.provision.mock.calls[0][0].psAccessToken,
    ]);
    expect(ports.deprovision).not.toHaveBeenCalled();
  });

  describe("when the row is deleted while provisioning", () => {
    it("cleans up what it created, reports a conflict, and stores no token", async () => {
      const response = await createDeletedDuringProvisioning();

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: {
          type: "conflict_error",
          message: expect.stringContaining("deleted during setup"),
        },
      });
      expect(ports.deprovision).toHaveBeenCalledTimes(1);
      expect(ports.deprovision).toHaveBeenCalledWith(ids.providerId, {
        tunnelId: ids.tunnelId,
        dnsRecordId: ids.dnsRecordId,
      });
      expect(ports.tokens).toEqual([]);
      expect(ports.row).toBeNull();
    });

    it("answers 500 naming every id, and logs them, when cleanup fails", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      ports.deprovision.mockRejectedValue(new Error("gcp unavailable"));

      const response = await createDeletedDuringProvisioning();

      const body = await response.json();
      expect(response.status).toBe(500);
      expect(body.error.type).toBe("internal_error");
      for (const id of Object.values(ids)) {
        expect(body.error.message).toContain(id);
      }
      expect(body.error.message).toContain("gcp unavailable");
      const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
      for (const id of Object.values(ids)) {
        expect(logged).toContain(id);
      }
      expect(logged).toContain("gcp unavailable");
      expect(ports.tokens).toEqual([]);
    });
  });
});
