export type ServerState = "provisioning" | "running" | "stopped" | "error";

export type ProvisionParams = {
  userId: string;
  masterKeySignature: string;
  ownerAddress: string;
};

export type ProvisionResult = {
  serverId: string;
  url: string;
};

export type ServerStatus = {
  state: ServerState;
  url?: string;
  health?: { ownerAddress: string };
};

export interface ServerProvider {
  provision(params: ProvisionParams): Promise<ProvisionResult>;
  status(serverId: string): Promise<ServerStatus>;
  deprovision(serverId: string): Promise<void>;
}
