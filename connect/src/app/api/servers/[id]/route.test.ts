// @vitest-environment node
import { NextRequest } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalServer } from "@/lib/db/neon";

const handles = {
  provider_id: "vm-1",
  tunnel_id: "tunnel-1",
  dns_record_id: "dns-1",
};

// In-memory store with the contracts neon.ts gives the route. `afterFirstRead`
// runs once, right after the route's first findServerById returns, which is
// where a concurrent create saves its handles (or another delete removes the row).
const ports = vi.hoisted(() => ({
  row: null as PersonalServer | null,
  afterFirstRead: null as (() => void) | null,
  reads: 0,
  deprovision: vi.fn(),
}));

const hasHandles = (row: PersonalServer) =>
  Boolean(row.provider_id || row.tunnel_id || row.dns_record_id);

vi.mock("@/lib/db/neon", () => ({
  findServerById: async (id: string) => {
    const found = ports.row?.id === id ? { ...ports.row } : null;
    ports.reads += 1;
    if (ports.reads === 1) ports.afterFirstRead?.();
    return found;
  },
  updateServer: async (id: string, fields: Partial<PersonalServer>) => {
    if (ports.row?.id !== id) return null;
    ports.row = { ...ports.row, ...fields };
    return ports.row;
  },
  deleteServer: async (id: string) => {
    if (ports.row?.id === id) ports.row = null;
  },
  deleteServerIfNoProviderHandles: async (id: string) => {
    if (ports.row?.id !== id || hasHandles(ports.row)) return false;
    ports.row = null;
    return true;
  },
}));

vi.mock("@/lib/server-provider", () => ({
  getServerProvider: () => ({ deprovision: ports.deprovision }),
}));

import { DELETE } from "./route";

const account = privateKeyToAccount(generatePrivateKey());

function seedRow(fields: Partial<PersonalServer> = {}) {
  ports.row = {
    id: "srv_1",
    user_id: account.address.toLowerCase(),
    provider: "gcp",
    state: "provisioning",
    control_plane_token: null,
    vm_ip: null,
    url: null,
    disk_id: null,
    disk_expires: null,
    provider_id: null,
    tunnel_id: null,
    dns_record_id: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...fields,
  };
}

async function deleteServer() {
  const signature = await account.signMessage({
    message: "vana-master-key-v1",
  });
  return DELETE(
    new NextRequest("https://fixture.example/api/servers/srv_1", {
      method: "DELETE",
      headers: { authorization: `Bearer ${signature}` },
    }),
    { params: Promise.resolve({ id: "srv_1" }) },
  );
}

const saveHandles = () => {
  if (ports.row) ports.row = { ...ports.row, ...handles };
};

beforeEach(() => {
  ports.row = null;
  ports.afterFirstRead = null;
  ports.reads = 0;
  ports.deprovision.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("DELETE /api/servers/[id]", () => {
  it("deletes a row that never had handles and sends no deprovision", async () => {
    seedRow();

    const response = await deleteServer();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "srv_1", deleted: true });
    expect(ports.row).toBeNull();
    expect(ports.deprovision).not.toHaveBeenCalled();
  });

  it("deprovisions exactly the handles a create saved after the delete read the row", async () => {
    seedRow();
    ports.afterFirstRead = saveHandles;

    const response = await deleteServer();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "srv_1", deleted: true });
    expect(ports.deprovision).toHaveBeenCalledTimes(1);
    expect(ports.deprovision).toHaveBeenCalledWith(handles.provider_id, {
      tunnelId: handles.tunnel_id,
      dnsRecordId: handles.dns_record_id,
    });
    expect(ports.row).toBeNull();
  });

  it("answers as a normal delete when the row is already gone on the re-read", async () => {
    seedRow();
    ports.afterFirstRead = () => {
      ports.row = null;
    };

    const response = await deleteServer();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "srv_1", deleted: true });
    expect(ports.deprovision).not.toHaveBeenCalled();
  });

  it("marks the row deprovision_failed and answers 500 when cleanup of late handles fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seedRow();
    ports.afterFirstRead = saveHandles;
    ports.deprovision.mockRejectedValue(new Error("gcp unavailable"));

    const response = await deleteServer();

    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error.type).toBe("internal_error");
    expect(body.error.message).toContain("gcp unavailable");
    expect(ports.row).toMatchObject({
      ...handles,
      state: "deprovision_failed",
    });
  });

  it("keeps deprovisioning then deleting a row that already had handles when read", async () => {
    seedRow({ ...handles, state: "running" });

    const response = await deleteServer();

    expect(response.status).toBe(200);
    expect(ports.deprovision).toHaveBeenCalledTimes(1);
    expect(ports.deprovision).toHaveBeenCalledWith(handles.provider_id, {
      tunnelId: handles.tunnel_id,
      dnsRecordId: handles.dns_record_id,
    });
    expect(ports.row).toBeNull();
  });
});
