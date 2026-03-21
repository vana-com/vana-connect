export type ServerState = "provisioning" | "running" | "stopped" | "error";

export type ProvisionParams = {
  serverId: string;
  userId: string;
  masterKeySignature: string;
  ownerAddress: string;
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
  health?: { ownerAddress: string };
};

export interface ServerProvider {
  provision(params: ProvisionParams): Promise<ProvisionResult>;
  status(serverId: string): Promise<ServerStatus>;
  deprovision(
    serverId: string,
    options?: { tunnelId?: string; dnsRecordId?: string },
  ): Promise<void>;
}
