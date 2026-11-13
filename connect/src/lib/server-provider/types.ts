import type { PersonalServer, ProvisioningProgress } from "@/lib/db/neon";

export type ServerState = "provisioning" | "running" | "stopped" | "error";

export type ProvisionParams = {
  serverId: string;
  userId: string;
  masterKeySignature: string;
  ownerAddress: string;
  psAccessToken?: string;
  deadline: number;
  recordProgress: (progress: ProvisioningProgress) => Promise<void>;
};

export type ProvisionResult = {
  serverId: string;
  url: string;
  /** Cloudflare Tunnel ID — stored for cleanup on deprovision */
  tunnelId?: string;
  /** Cloudflare DNS record ID — stored for cleanup on deprovision */
  dnsRecordId?: string;
};

export type ServerStatus = {
  state: ServerState;
  url?: string;
  exists?: boolean;
  health?: { ownerAddress: string };
};

export interface ServerProvider {
  provision(params: ProvisionParams): Promise<ProvisionResult>;
  status(serverId: string, operation?: string | null): Promise<ServerStatus>;
  recoverProvisioning(
    server: PersonalServer,
    deadline: number,
    saveHandles: (handles: ProvisioningProgress) => Promise<void>,
  ): Promise<void>;
  deprovision(
    serverId: string,
    options?: {
      tunnelId?: string | null;
      dnsRecordId?: string | null;
      deadline?: number;
      diskName?: string | null;
    },
  ): Promise<void>;
}
