import { InstancesClient, type protos } from "@google-cloud/compute";
import type { ServerProvider, ServerState, ServerStatus } from "./types";

type Instance = protos.google.cloud.compute.v1.IInstance;

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
    errors?: { message: string }[];
    result: T;
  };

  if (!json.success) {
    const msg =
      json.errors?.map((e) => e.message).join("; ") ?? "Unknown CF error";
    throw new Error(`Cloudflare API error: ${msg}`);
  }

  return json.result;
}

/**
 * Create a Cloudflare Tunnel, configure its ingress, and add a DNS CNAME.
 * Returns the tunnel ID, tunnel token, and DNS record ID so we can clean up
 * on deprovision.
 */
async function createTunnel(userId: string): Promise<CloudflareTunnelResult> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const zoneId = requireEnv("CLOUDFLARE_ZONE_ID");
  const tunnelName = `ps-${userId}`;
  const hostname = `${userId}.${MYVANA_DOMAIN}`;

  // 1. Create the tunnel — generates a random secret we use as the token
  const tunnelSecret = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64");

  const tunnel = await cfFetch<{ id: string; token: string }>(
    `/accounts/${accountId}/cfd_tunnel`,
    {
      method: "POST",
      body: JSON.stringify({
        name: tunnelName,
        tunnel_secret: tunnelSecret,
        config_src: "cloudflare",
      }),
    },
  );

  const tunnelId = tunnel.id;

  // 2. Configure tunnel ingress: route hostname → localhost:8080
  await cfFetch(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    {
      method: "PUT",
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
  const dnsRecord = await cfFetch<{ id: string }>(
    `/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
        comment: `Managed by vana-connect for ${userId}`,
      }),
    },
  );

  // 4. Get the tunnel token (base64-encoded JSON the cloudflared binary needs)
  const tunnelToken = await cfFetch<string>(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`,
  );

  return {
    tunnelId,
    tunnelToken,
    dnsRecordId: dnsRecord.id,
  };
}

async function deleteTunnel(tunnelId: string, dnsRecordId: string): Promise<void> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const zoneId = requireEnv("CLOUDFLARE_ZONE_ID");

  // Delete DNS record first (so traffic stops going to the tunnel)
  try {
    await cfFetch(`/zones/${zoneId}/dns_records/${dnsRecordId}`, {
      method: "DELETE",
    });
  } catch (err) {
    console.error("Failed to delete DNS record:", err);
    // Continue to delete the tunnel even if DNS delete fails
  }

  // Delete the tunnel (must be inactive — cloudflared on the VM should be
  // stopped by GCP instance deletion which happens after this)
  try {
    await cfFetch(
      `/accounts/${accountId}/cfd_tunnel/${tunnelId}?cascade=true`,
      { method: "DELETE" },
    );
  } catch (err) {
    console.error("Failed to delete tunnel:", err);
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

# Mount persistent data disk (second disk, /dev/sdb)
DATA_DISK="/dev/sdb"
DATA_DIR="/var/ps-data"
mkdir -p "$DATA_DIR"
if ! blkid "$DATA_DISK"; then
  mkfs.ext4 -F "$DATA_DISK"
fi
mount "$DATA_DISK" "$DATA_DIR"

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
  -e TUNNEL_ENABLED=false \\
  -e DEV_UI_ENABLED=false \\
  "$CONTAINER_IMAGE"

# Install cloudflared
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Run cloudflared as a systemd service
cloudflared service install "$TUNNEL_TOKEN"
`;
}

// ---------------------------------------------------------------------------
// GCP Provider
// ---------------------------------------------------------------------------

export class GCPProvider implements ServerProvider {
  private client: InstancesClient;
  private project: string;

  constructor() {
    this.project = requireEnv("GCP_PROJECT");

    const saKey = process.env.GCP_SERVICE_ACCOUNT_KEY;
    if (saKey) {
      const key = JSON.parse(saKey);
      this.client = new InstancesClient({
        credentials: {
          client_email: key.client_email,
          private_key: key.private_key,
        },
        projectId: this.project,
      });
    } else {
      this.client = new InstancesClient();
    }
  }

  async provision(params: {
    userId: string;
    masterKeySignature: string;
    ownerAddress: string;
  }) {
    const vmName = `ps-${params.userId
      .slice(0, 20)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")}`;

    // Create Cloudflare Tunnel + DNS before the VM so we have the token
    const tunnel = await createTunnel(params.userId);

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
        ],
      },
      tags: {
        items: ["personal-server"],
      },
    };

    await this.client.insert({
      project: this.project,
      zone: GCP_ZONE,
      instanceResource,
    });

    return {
      serverId: vmName,
      url: `https://${params.userId}.${MYVANA_DOMAIN}`,
      tunnelId: tunnel.tunnelId,
      dnsRecordId: tunnel.dnsRecordId,
    };
  }

  async status(serverId: string): Promise<ServerStatus> {
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

      // Health check through the public Cloudflare Tunnel URL
      if (state === "running" && url) {
        try {
          const healthResp = await fetch(`${url}/health`, {
            signal: AbortSignal.timeout(5000),
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
        return { state: "stopped" };
      }
      throw err;
    }
  }

  async deprovision(
    serverId: string,
    options?: { tunnelId?: string; dnsRecordId?: string },
  ): Promise<void> {
    // Clean up Cloudflare Tunnel + DNS if IDs are provided
    if (options?.tunnelId && options?.dnsRecordId) {
      await deleteTunnel(options.tunnelId, options.dnsRecordId);
    }

    // Delete the GCP VM
    try {
      await this.client.delete({
        project: this.project,
        zone: GCP_ZONE,
        instance: serverId,
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code: number }).code
          : 0;
      if (code !== 5 && code !== 404) {
        throw err;
      }
    }
  }
}
