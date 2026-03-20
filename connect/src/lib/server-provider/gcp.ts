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

const PS_DOMAIN = process.env.PS_DOMAIN ?? "myvana.app";

const PS_CONTAINER_IMAGE =
  process.env.PS_CONTAINER_IMAGE ?? "vanaorg/personal-server:latest";

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

/**
 * Build a startup script for Container-Optimized OS (COS).
 * COS already has Docker — no need to install it.
 * Values are passed via instance metadata to avoid shell injection.
 */
function buildStartupScript(): string {
  return `#!/bin/bash
set -e

# Read secrets from instance metadata (avoids shell injection)
OWNER_ADDR=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/owner-address)
MASTER_KEY_SIG=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/master-key-signature)
SERVER_ORIGIN_VAL=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/server-origin)
CONTAINER_IMAGE=$(curl -s -H "Metadata-Flavor: Google" \\
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/container-image)

# Mount the persistent data disk (second disk, /dev/sdb)
DATA_DISK="/dev/sdb"
DATA_DIR="/var/ps-data"
mkdir -p "$DATA_DIR"
if ! blkid "$DATA_DISK"; then
  mkfs.ext4 -F "$DATA_DISK"
fi
mount "$DATA_DISK" "$DATA_DIR"

# Pull and run the personal server
docker pull "$CONTAINER_IMAGE"
docker run -d \\
  --name personal-server \\
  --restart unless-stopped \\
  -p 80:8080 \\
  -v "$DATA_DIR":/data \\
  -e VANA_MASTER_KEY_SIGNATURE="$MASTER_KEY_SIG" \\
  -e OWNER_ADDRESS="$OWNER_ADDR" \\
  -e SERVER_ORIGIN="$SERVER_ORIGIN_VAL" \\
  -e PERSONAL_SERVER_ROOT_PATH=/data \\
  -e TUNNEL_ENABLED=false \\
  -e DEV_UI_ENABLED=false \\
  "$CONTAINER_IMAGE"
`;
}

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
            value: `https://${params.userId}.${PS_DOMAIN}`,
          },
          { key: "container-image", value: PS_CONTAINER_IMAGE },
        ],
      },
      tags: {
        items: ["http-server", "personal-server"],
      },
    };

    const [operation] = await this.client.insert({
      project: this.project,
      zone: GCP_ZONE,
      instanceResource,
    });

    if (operation.latestResponse) {
      // Long-running operation — status endpoint tracks convergence
    }

    return {
      serverId: vmName,
      url: `https://${params.userId}.${PS_DOMAIN}`,
    };
  }

  async status(serverId: string): Promise<ServerStatus> {
    try {
      const [instance] = await this.client.get({
        project: this.project,
        zone: GCP_ZONE,
        instance: serverId,
      });

      const externalIp =
        instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? undefined;

      const state = mapGcpStatus(instance.status);

      const result: ServerStatus = {
        state,
        url: externalIp ? `http://${externalIp}` : undefined,
      };

      if (state === "running" && externalIp) {
        try {
          const healthResp = await fetch(`http://${externalIp}/health`, {
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
          // Health check failed — VM may still be booting
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

  async deprovision(serverId: string): Promise<void> {
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
