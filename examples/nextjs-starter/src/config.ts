import { createVanaConfig } from "@opendatalabs/connect/server";
import type { VanaEnvironment } from "@opendatalabs/connect/core";

// Scopes define what user data your app requests.
const SCOPES = ["chatgpt.conversations"];

export const VANA_ENV = (process.env.NEXT_PUBLIC_VANA_ENV ??
  "prod") as VanaEnvironment;

export const config = createVanaConfig({
  privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
  scopes: SCOPES,
  appUrl: process.env.APP_URL!,
  environment: VANA_ENV,
});
