import { GCPProvider } from "./gcp";
import type { ServerProvider } from "./types";

export type {
  ProvisionParams,
  ProvisionResult,
  ServerProvider,
  ServerState,
  ServerStatus,
} from "./types";

const PROVIDER = process.env.SERVER_PROVIDER ?? "gcp";

let _provider: ServerProvider | null = null;

export function getServerProvider(): ServerProvider {
  if (_provider) return _provider;

  switch (PROVIDER) {
    case "gcp":
      _provider = new GCPProvider();
      return _provider;
    default:
      throw new Error(`Unknown server provider: ${PROVIDER}`);
  }
}
