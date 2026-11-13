import { setTimeout as delay } from "node:timers/promises";
import {
  InstancesClient,
  type protos,
  ZoneOperationsClient,
} from "@google-cloud/compute";
import type { PersonalServer, ProvisioningProgress } from "@/lib/db/neon";
import type {
  ProvisionParams,
  ServerProvider,
  ServerState,
  ServerStatus,
} from "./types";

type Instance = protos.google.cloud.compute.v1.IInstance;
type ComputeOperation = protos.google.cloud.compute.v1.IOperation;

// The REST clients wrap a zonal Compute operation as latestResponse but type
// the wrapper's response as a generic google.longrunning.Operation.
function computeOperation(operation: { latestResponse?: unknown }) {
  return operation.latestResponse as ComputeOperation | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const GCP_ZONE = process.env.GCP_ZONE ?? "us-central1-a";
const GCP_NETWORK = process.env.GCP_NETWORK ?? "default";
const GCP_SUBNET = process.env.GCP_SUBNET ?? "";
const GCP_SERVICE_ACCOUNT_EMAIL = process.env.GCP_SERVICE_ACCOUNT_EMAIL ?? "";

const PS_CONTAINER_IMAGE =
  process.env.PS_CONTAINER_IMAGE ?? "ghcr.io/vana-com/personal-server:latest";

const MYVANA_DOMAIN = "myvana.app";

function attemptTunnelName(id: string) {
  return `ps-${id.slice("srv_".length)}`;
}

function attemptDnsComment(id: string) {
  return `Managed by vana-connect for attempt ${id}`;
}

function remainingTime(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Server operation timed out");
  return remaining;
}

// The Compute REST transport can keep waiting after its RPC deadline.
async function computeRequest<T>(
  deadline: number,
  request: (options: { timeout: number; retry: null }) => Promise<T>,
): Promise<T> {
  const timeout = remainingTime(deadline);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request({ timeout, retry: null }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Server operation timed out")),
          timeout,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function mapGcpStatus(gcpStatus: string | null | undefined): ServerState {
  switch (gcpStatus) {
    case "PROVISIONING":
    case "STAGING":
      return "provisioning";
    case "RUNNING":
      return "running";
    case "STOPPING":
    case "STOPPED":
    case "TERMINATED":
    case "SUSPENDED":
    case "SUSPENDING":
      return "stopped";
    default:
      return "error";
  }
}

// ---------------------------------------------------------------------------
// Cloudflare Tunnel helpers
// ---------------------------------------------------------------------------

interface CloudflareTunnelResult {
  tunnelId: string;
  tunnelToken: string;
  dnsRecordId: string;
}

async function cfFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const resp = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const json = (await resp.json()) as {
    success: boolean;
    errors?: { code?: number; message: string }[];
    result: T;
  };

  if (!resp.ok || !json.success) {
    const msg =
      json.errors?.map((e) => e.message).join("; ") ?? "Unknown CF error";
    const err = new Error(`Cloudflare API error: ${msg}`) as Error & {
      cfErrors?: { code?: number; message: string }[];
      cfStatus?: number;
    };
    err.cfErrors = json.errors;
    err.cfStatus = resp.status;
    throw err;
  }

  return json.result;
}

// Cloudflare error codes that mean "the resource is already gone" — safe to ignore on delete.
// 1003: tunnel not found; 81044: DNS record not found.
const CF_NOT_FOUND_CODES = new Set([1003, 81044]);

function isCfNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cfErr = err as Error & {
    cfErrors?: { code?: number }[];
    cfStatus?: number;
  };
  const errors = cfErr.cfErrors ?? [];
  return errors.length
    ? errors.every(
        (error) =>
          error.code !== undefined && CF_NOT_FOUND_CODES.has(error.code),
      )
    : cfErr.cfStatus === 404;
}

/**
 * Create a Cloudflare Tunnel, configure its ingress, and add a DNS CNAME.
 * Returns the tunnel ID, tunnel token, and DNS record ID so we can clean up
 * on deprovision.
 */
async function createTunnel({
  serverId,
  userId,
  deadline,
  recordProgress,
}: ProvisionParams): Promise<CloudflareTunnelResult> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const zoneId = requireEnv("CLOUDFLARE_ZONE_ID");
  const tunnelName = attemptTunnelName(serverId);
  const hostname = `${userId}.${MYVANA_DOMAIN}`;

  // 1. Create the tunnel — generates a random secret we use as the token
  const tunnelSecret = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64");

  await recordProgress({ step: "tunnel" });
  const tunnel = await cfFetch<{ id: string; token: string }>(
    `/accounts/${accountId}/cfd_tunnel`,
    {
      method: "POST",
      signal: AbortSignal.timeout(remainingTime(deadline)),
      body: JSON.stringify({
        name: tunnelName,
        tunnel_secret: tunnelSecret,
        config_src: "cloudflare",
      }),
    },
  );

  const tunnelId = tunnel.id;
  if (!tunnelId) throw new Error("Cloudflare returned no tunnel ID");
  await recordProgress({ step: "tunnel", tunnelId });

  // 2. Configure tunnel ingress: route hostname → localhost:8080
  await cfFetch(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    {
      method: "PUT",
      signal: AbortSignal.timeout(remainingTime(deadline)),
      body: JSON.stringify({
        config: {
          ingress: [
            { hostname, service: "http://localhost:8080" },
            { service: "http_status:404" }, // catch-all required by CF
          ],
        },
      }),
    },
  );

  // 3. Create DNS CNAME: userId.myvana.app → tunnelId.cfargotunnel.com
  await recordProgress({ step: "dns" });
  const dnsRecord = await cfFetch<{ id: string }>(
    `/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      signal: AbortSignal.timeout(remainingTime(deadline)),
      body: JSON.stringify({
        type: "CNAME",
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
        comment: attemptDnsComment(serverId),
      }),
    },
  );

  if (!dnsRecord.id) throw new Error("Cloudflare returned no DNS record ID");
  await recordProgress({ step: "dns", dnsRecordId: dnsRecord.id });

  // 4. Get the tunnel token (base64-encoded JSON the cloudflared binary needs)
  const tunnelToken = await cfFetch<string>(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`,
    { signal: AbortSignal.timeout(remainingTime(deadline)) },
  );

  return {
    tunnelId,
    tunnelToken,
    dnsRecordId: dnsRecord.id,
  };
}

async function deleteTunnel(
  tunnelId: string | null | undefined,
  dnsRecordId: string | null | undefined,
  deadline = Date.now() + 10_000,
): Promise<void> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const zoneId = requireEnv("CLOUDFLARE_ZONE_ID");

  const errors: string[] = [];
  const deleteOptions = (): RequestInit => ({
    method: "DELETE",
    signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
  });

  // Delete DNS record first (so traffic stops going to the tunnel)
  if (dnsRecordId) {
    try {
      await cfFetch(
        `/zones/${zoneId}/dns_records/${dnsRecordId}`,
        deleteOptions(),
      );
    } catch (err) {
      if (!isCfNotFound(err)) {
        errors.push(`DNS record: ${String(err)}`);
      }
    }
  }

  // Delete the tunnel — cascade=true cleans up connections even if cloudflared is still running
  if (tunnelId) {
    try {
      await cfFetch(
        `/accounts/${accountId}/cfd_tunnel/${tunnelId}?cascade=true`,
        deleteOptions(),
      );
    } catch (err) {
      if (!isCfNotFound(err)) {
        errors.push(`tunnel: ${String(err)}`);
      }
    }
  }

  if (errors.length) {
    throw new Error(errors.join("; "));
  }
}

// ---------------------------------------------------------------------------
// Startup script
// ---------------------------------------------------------------------------

/**
 * Startup script for Container-Optimized OS (COS).
 * COS already has Docker. Values read from instance metadata to avoid shell injection.
 * Installs cloudflared and runs the tunnel so traffic routes through Cloudflare.
 */
function buildStartupScript(): string {
  return `#!/bin/bash
set -e

# Read from instance metadata (avoids shell injection)
OWNER_ADDR=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/owner-address)
MASTER_KEY_SIG=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/master-key-signature)
SERVER_ORIGIN_VAL=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/server-origin)
CONTAINER_IMAGE=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/container-image)
TUNNEL_TOKEN=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/tunnel-token)
PS_ACCESS_TOKEN_VAL=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/ps-access-token || true)

# Mount persistent data disk (second disk)
DATA_DIR="/var/ps-data"
mkdir -p "$DATA_DIR"

# Find the data disk device (not the boot disk)
DATA_DISK=$(lsblk -dnp -o NAME,TYPE | grep disk | awk 'NR==2{print $1}')
if [ -n "$DATA_DISK" ]; then
  # Format if no filesystem exists
  if ! blkid -s TYPE -o value "$DATA_DISK" 2>/dev/null | grep -q .; then
    mkfs.ext4 -F "$DATA_DISK"
  fi
  mount "$DATA_DISK" "$DATA_DIR" || true
fi

# Fix ownership for non-root container user (uid 100 = vana)
chown -R 100:100 "$DATA_DIR"

# Pull and run the personal server on localhost only (Cloudflare Tunnel handles external traffic)
docker pull "$CONTAINER_IMAGE"
docker run -d \\
  --name personal-server \\
  --restart unless-stopped \\
  -p 8080:8080 \\
  -v "$DATA_DIR":/data \\
  -e VANA_MASTER_KEY_SIGNATURE="$MASTER_KEY_SIG" \\
  -e OWNER_ADDRESS="$OWNER_ADDR" \\
  -e SERVER_ORIGIN="$SERVER_ORIGIN_VAL" \\
  -e PERSONAL_SERVER_ROOT_PATH=/data \\
  -e CLOUD_MODE=true \\
  -e TUNNEL_ENABLED=false \\
  -e DEV_UI_ENABLED=false \\
  -e PS_ACCESS_TOKEN="$PS_ACCESS_TOKEN_VAL" \\
  "$CONTAINER_IMAGE"

# Run cloudflared via Docker (COS has read-only root + noexec on /home)
docker run -d \\
  --name cloudflared \\
  --restart unless-stopped \\
  --network host \\
  cloudflare/cloudflared:latest \\
  tunnel run --token "$TUNNEL_TOKEN"
`;
}

// ---------------------------------------------------------------------------
// GCP Provider
// ---------------------------------------------------------------------------

/**
 * Load GCP credentials from GCP_SERVICE_ACCOUNT_KEY.
 * Vercel sometimes mangles raw JSON in env vars, so we accept either raw JSON
 * or base64-encoded JSON. Returns null when no key is configured (falls back
 * to ADC, which only works on GCP-hosted runtimes).
 */
function loadGcpCredentials(): {
  client_email: string;
  private_key: string;
} | null {
  const saKey = process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (!saKey) return null;
  try {
    return JSON.parse(saKey);
  } catch {
    return JSON.parse(Buffer.from(saKey, "base64").toString("utf-8"));
  }
}

export class GCPProvider implements ServerProvider {
  private client: InstancesClient;
  private project: string;

  constructor() {
    this.project = requireEnv("GCP_PROJECT");

    const credentials = loadGcpCredentials();
    if (credentials) {
      this.client = new InstancesClient({
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key,
        },
        projectId: this.project,
      });
    } else {
      this.client = new InstancesClient();
    }
  }

  private zoneOperations() {
    const credentials = loadGcpCredentials();
    return new ZoneOperationsClient(
      credentials ? { credentials, projectId: this.project } : undefined,
    );
  }

  async provision(params: ProvisionParams) {
    // Use the DB-unique serverId for the VM name (avoids collisions from truncated userIds)
    const vmName = `ps-${params.serverId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 40)}`;

    // Create Cloudflare Tunnel + DNS before the VM so we have the token
    const tunnel = await createTunnel(params);

    const instanceResource: Instance = {
      name: vmName,
      machineType: `zones/${GCP_ZONE}/machineTypes/e2-micro`,
      labels: {
        "managed-by": "vana-connect",
        "user-id": params.userId.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      },
      disks: [
        {
          initializeParams: {
            sourceImage: "projects/cos-cloud/global/images/family/cos-stable",
            diskSizeGb: "10",
          },
          autoDelete: true,
          boot: true,
        },
        {
          initializeParams: {
            // Pin the underlying GCE disk resource name. Without this, GCE
            // auto-generates `<vmName>-1` and deprovision can't find the
            // disk to delete by the deviceName-based lookup.
            diskName: `${vmName}-data`,
            diskSizeGb: "10",
            diskType: `zones/${GCP_ZONE}/diskTypes/pd-standard`,
          },
          autoDelete: false,
          boot: false,
          deviceName: `${vmName}-data`,
        },
      ],
      networkInterfaces: [
        {
          network: GCP_SUBNET
            ? undefined
            : `projects/${this.project}/global/networks/${GCP_NETWORK}`,
          subnetwork: GCP_SUBNET || undefined,
          accessConfigs: [
            {
              name: "External NAT",
              type: "ONE_TO_ONE_NAT",
            },
          ],
        },
      ],
      serviceAccounts: GCP_SERVICE_ACCOUNT_EMAIL
        ? [
            {
              email: GCP_SERVICE_ACCOUNT_EMAIL,
              scopes: ["https://www.googleapis.com/auth/cloud-platform"],
            },
          ]
        : [],
      metadata: {
        items: [
          { key: "startup-script", value: buildStartupScript() },
          { key: "owner-address", value: params.ownerAddress },
          { key: "master-key-signature", value: params.masterKeySignature },
          {
            key: "server-origin",
            value: `https://${params.userId}.${MYVANA_DOMAIN}`,
          },
          { key: "container-image", value: PS_CONTAINER_IMAGE },
          { key: "tunnel-token", value: tunnel.tunnelToken },
          ...(params.psAccessToken
            ? [{ key: "ps-access-token", value: params.psAccessToken }]
            : []),
        ],
      },
      tags: {
        items: ["personal-server"],
      },
    };

    await params.recordProgress({
      step: "compute",
      instanceName: vmName,
      diskName: `${vmName}-data`,
    });
    const [operation] = await computeRequest(params.deadline, (options) =>
      this.client.insert(
        {
          project: this.project,
          zone: GCP_ZONE,
          requestId: params.serverId.slice("srv_".length),
          instanceResource,
        },
        options,
      ),
    );
    const response = computeOperation(operation);
    if (!response?.name)
      throw new Error("Compute returned no create operation name");
    await params.recordProgress({
      step: "compute",
      computeOperation: response.name,
    });
    if (response.error?.errors?.length || response.httpErrorStatusCode) {
      throw new Error("Compute rejected server creation");
    }

    return {
      serverId: vmName,
      url: `https://${params.userId}.${MYVANA_DOMAIN}`,
      tunnelId: tunnel.tunnelId,
      dnsRecordId: tunnel.dnsRecordId,
    };
  }

  async status(
    serverId: string,
    operation?: string | null,
  ): Promise<ServerStatus> {
    try {
      const [instance] = await this.client.get({
        project: this.project,
        zone: GCP_ZONE,
        instance: serverId,
      });

      const state = mapGcpStatus(instance.status);

      const url =
        instance.metadata?.items?.find((m) => m.key === "server-origin")
          ?.value ?? undefined;

      const result: ServerStatus = {
        state,
        url,
      };

      // Health check through the public Cloudflare Tunnel URL (short timeout
      // to avoid exceeding Vercel function limits on cold starts)
      if (state === "running" && url) {
        try {
          const healthResp = await fetch(`${url}/health`, {
            signal: AbortSignal.timeout(3000),
          });
          if (healthResp.ok) {
            const health = (await healthResp.json()) as {
              ownerAddress?: string;
            };
            result.health = {
              ownerAddress: health.ownerAddress ?? "",
            };
          }
        } catch {
          // Health check failed — VM or tunnel may still be starting
        }
      }

      return result;
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code: number }).code
          : 0;
      if (code === 5 || code === 404) {
        if (operation) {
          const [result] = await computeRequest(Date.now() + 5000, (options) =>
            this.zoneOperations().get(
              {
                project: this.project,
                zone: GCP_ZONE,
                operation,
              },
              options,
            ),
          );
          const failed =
            result.status === "DONE" &&
            (result.error?.errors?.length || result.httpErrorStatusCode);
          return failed ? { state: "error" } : { state: "provisioning" };
        }
        return { state: "stopped" };
      }
      throw err;
    }
  }

  async recoverProvisioning(
    server: PersonalServer,
    deadline: number,
    saveHandles: (handles: ProvisioningProgress) => Promise<void>,
  ): Promise<void> {
    const step = server.provisioning_step;
    if (
      (step === "dns" && !server.tunnel_id) ||
      (step === "compute" &&
        (!server.tunnel_id ||
          !server.dns_record_id ||
          !server.provider_id ||
          !server.disk_id))
    ) {
      throw new Error(
        "Provisioning ownership records are incomplete. Contact support.",
      );
    }
    let tunnelId = server.tunnel_id;
    let dnsRecordId = server.dns_record_id;
    let operation = server.compute_operation;

    // A create reply can be lost after the provider accepts the request. Only
    // adopt a resource bearing this attempt's identity. An empty lookup after
    // an ambiguous write cannot prove that the resource will never appear.
    if (step === "tunnel" && !tunnelId) {
      const account = requireEnv("CLOUDFLARE_ACCOUNT_ID");
      const name = attemptTunnelName(server.id);
      const query = new URLSearchParams({
        name,
        is_deleted: "false",
        per_page: "2",
      });
      const tunnels = await cfFetch<{ id: string; name: string }[]>(
        `/accounts/${account}/cfd_tunnel?${query}`,
        { signal: AbortSignal.timeout(remainingTime(deadline)) },
      );
      if (tunnels.length !== 1 || tunnels[0].name !== name || !tunnels[0].id) {
        throw new Error(
          "Tunnel creation could not be confirmed. Retry cleanup or contact support.",
        );
      }
      tunnelId = tunnels[0].id;
      await saveHandles({ step, tunnelId });
    }

    if (step === "dns" && !dnsRecordId) {
      const zone = requireEnv("CLOUDFLARE_ZONE_ID");
      const hostname = `${server.user_id}.${MYVANA_DOMAIN}`;
      const comment = attemptDnsComment(server.id);
      const content = `${tunnelId}.cfargotunnel.com`;
      const query = new URLSearchParams({
        "name.exact": hostname,
        "comment.exact": comment,
        type: "CNAME",
        match: "all",
        per_page: "2",
      });
      const records = await cfFetch<
        { id: string; name: string; comment: string; content: string }[]
      >(`/zones/${zone}/dns_records?${query}`, {
        signal: AbortSignal.timeout(remainingTime(deadline)),
      });
      const record = records[0];
      if (
        !tunnelId ||
        records.length !== 1 ||
        record.name !== hostname ||
        record.comment !== comment ||
        record.content !== content ||
        !record.id
      ) {
        throw new Error(
          "DNS creation could not be confirmed. Retry cleanup or contact support.",
        );
      }
      dnsRecordId = record.id;
      await saveHandles({ step, dnsRecordId });
    }

    if (step === "compute" && !operation) {
      const requestId = server.id.slice("srv_".length);
      const [operations, next] = await computeRequest(deadline, (options) =>
        this.zoneOperations().list(
          {
            project: this.project,
            zone: GCP_ZONE,
            filter: `(clientOperationId = "${requestId}")`,
            maxResults: 2,
          },
          { ...options, autoPaginate: false },
        ),
      );
      const match = operations[0];
      if (
        next ||
        operations.length !== 1 ||
        match.clientOperationId !== requestId ||
        match.operationType !== "insert" ||
        !match.targetLink?.endsWith(`/instances/${server.provider_id}`) ||
        !match.name
      ) {
        throw new Error(
          "Compute creation could not be confirmed. Retry cleanup or contact support.",
        );
      }
      operation = match.name;
      await saveHandles({ step, computeOperation: operation });
    }

    if (operation) {
      const [result] = await computeRequest(deadline, (options) =>
        this.zoneOperations().get(
          { project: this.project, zone: GCP_ZONE, operation },
          options,
        ),
      );
      if (result.status !== "DONE")
        throw new Error(
          "Compute creation is still pending. Retry cleanup shortly.",
        );
    }

    await this.deprovision(server.provider_id ?? "", {
      tunnelId,
      dnsRecordId,
      diskName: server.disk_id,
      deadline,
    });
  }

  async deprovision(
    serverId: string,
    options?: {
      tunnelId?: string | null;
      dnsRecordId?: string | null;
      deadline?: number;
      diskName?: string | null;
    },
  ): Promise<void> {
    const errors: { step: string; code: number; message: string }[] = [];
    const deadline = Math.min(
      options?.deadline ?? Infinity,
      Date.now() + 45_000,
    );
    const errCode = (err: unknown): number =>
      err && typeof err === "object" && "code" in err
        ? Number((err as { code: number }).code) || 0
        : 0;
    const errMessage = (err: unknown): string =>
      err instanceof Error ? err.message : String(err);
    const recordError = (step: string, err: unknown) => {
      const entry = { step, code: errCode(err), message: errMessage(err) };
      console.error(
        `[deprovision] step=${step} serverId=${serverId} code=${entry.code} message=${entry.message}`,
      );
      errors.push(entry);
    };

    // 1. Delete Cloudflare Tunnel + DNS (proceed even if this fails).
    // deleteTunnel tolerates already-deleted resources and missing ids,
    // so retry from a `deprovision_failed` state is safe.
    if (options?.tunnelId || options?.dnsRecordId) {
      try {
        await deleteTunnel(
          options.tunnelId ?? null,
          options.dnsRecordId ?? null,
          Math.min(deadline, Date.now() + 10_000),
        );
      } catch (err) {
        recordError("tunnel", err);
      }
    }

    let operations: ZoneOperationsClient | undefined;
    const confirmDeletion = async (response: ComputeOperation | undefined) => {
      if (!response) throw new Error("Compute returned no delete operation");
      let operation = response;
      while (operation.status !== "DONE") {
        const name = operation.name;
        if (!name)
          throw new Error("Compute returned an unnamed delete operation");

        if (!operations) {
          operations = this.zoneOperations();
        }
        await delay(Math.min(500, remainingTime(deadline)));
        const client = operations;
        const [updated] = await computeRequest(deadline, (options) =>
          client.get(
            { project: this.project, zone: GCP_ZONE, operation: name },
            options,
          ),
        );
        operation = updated;
      }

      const failures = operation.error?.errors ?? [];
      if (failures.length || operation.httpErrorStatusCode) {
        const message = failures
          .map(({ message, code }) => message || code)
          .join("; ");
        const code = failures.some(
          ({ code }) => code === "RESOURCE_IN_USE_BY_ANOTHER_RESOURCE",
        )
          ? 9
          : operation.httpErrorStatusCode;
        throw Object.assign(
          new Error(
            message ||
              operation.httpErrorMessage ||
              "Compute delete operation failed",
          ),
          { code },
        );
      }
    };

    // 2. Delete the GCP VM and wait for completion. Without waiting, the
    // disk delete in step 3 races the VM teardown and fails with
    // RESOURCE_IN_USE_BY_ANOTHER_RESOURCE while the VM is still STOPPING.
    if (serverId) {
      try {
        const [operation] = await computeRequest(deadline, (options) =>
          this.client.delete(
            { project: this.project, zone: GCP_ZONE, instance: serverId },
            options,
          ),
        );
        try {
          await confirmDeletion(computeOperation(operation));
        } catch (err) {
          recordError("vm-wait", err);
        }
      } catch (err: unknown) {
        const code = errCode(err);
        if (code !== 5 && code !== 404) {
          recordError("vm-delete", err);
        }
      }
    }

    // 3. Delete the persistent data disk (not auto-deleted with VM).
    // Newer provisions pin the disk name to `${vmName}-data`. Older
    // provisions let GCE auto-generate the name, which lands as
    // `${vmName}-1`. Try both so legacy rows can be cleaned up too.
    if (serverId) {
      const diskNameCandidates = options?.diskName
        ? [options.diskName]
        : [`${serverId}-data`, `${serverId}-1`];
      try {
        const { DisksClient } = await import("@google-cloud/compute");
        const credentials = loadGcpCredentials();
        const disksClient: InstanceType<typeof DisksClient> = credentials
          ? new DisksClient({
              credentials: {
                client_email: credentials.client_email,
                private_key: credentials.private_key,
              },
              projectId: this.project,
            })
          : new DisksClient({ projectId: this.project });
        for (const diskName of diskNameCandidates) {
          // Up to 5 retries for FAILED_PRECONDITION (disk still attached to a
          // VM that is mid-delete) — usually clears within a few seconds.
          let attempt = 0;
          const maxAttempts = 5;
          while (attempt < maxAttempts) {
            try {
              const [operation] = await computeRequest(deadline, (options) =>
                disksClient.delete(
                  { project: this.project, zone: GCP_ZONE, disk: diskName },
                  options,
                ),
              );
              try {
                await confirmDeletion(computeOperation(operation));
              } catch (err) {
                if (errCode(err) !== 9 && errCode(err) !== 400) {
                  recordError(`disk-wait:${diskName}`, err);
                  break;
                }
                throw err;
              }
              break;
            } catch (err: unknown) {
              const code = errCode(err);
              if (code === 5 || code === 404) {
                break; // already gone
              }
              // gRPC FAILED_PRECONDITION (9) or HTTP 400 — disk still in use,
              // back off and retry. Anything else is a real failure.
              const isInUse = code === 9 || code === 400;
              if (!isInUse || attempt === maxAttempts - 1) {
                recordError(`disk:${diskName}`, err);
                break;
              }
              await delay(
                Math.min(2000 * (attempt + 1), remainingTime(deadline)),
              );
              attempt += 1;
            }
          }
        }
      } catch (err) {
        recordError("disks-init", err);
      }
    }

    if (errors.length > 0) {
      const detail = errors
        .map((e) => `${e.step}(code=${e.code}): ${e.message}`)
        .join("; ");
      const wrapped = new Error(
        `Deprovision partially failed: ${detail}`,
      ) as Error & {
        deprovisionErrors?: typeof errors;
      };
      wrapped.deprovisionErrors = errors;
      throw wrapped;
    }
  }
}
