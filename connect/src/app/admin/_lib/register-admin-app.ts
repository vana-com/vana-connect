import { saveRegisteredAdminApp } from "./admin-apps-storage";
import { registerBuilder } from "./register-builder";
import { resolveRegisteredAppName } from "./resolve-registered-app-name";
import type { RegisterBuilderErrorCode } from "./register-builder";

type RegisterAdminAppFailure = {
  ok: false;
  error: {
    code: RegisterBuilderErrorCode;
    message: string;
  };
};

type RegisterAdminAppSuccess = {
  ok: true;
  data: {
    privateKey: `0x${string}`;
    builderId: string;
    ownerAddress: string;
  };
};

export type RegisterAdminAppResult =
  | RegisterAdminAppFailure
  | RegisterAdminAppSuccess;

export async function registerAdminApp({
  appUrl,
}: {
  appUrl: string;
}): Promise<RegisterAdminAppResult> {
  const [registerResult, appName] = await Promise.all([
    registerBuilder(appUrl),
    resolveRegisteredAppName(appUrl),
  ]);

  if (!registerResult.ok) {
    return registerResult;
  }

  saveRegisteredAdminApp({
    id: crypto.randomUUID(),
    name: appName,
    url: appUrl,
    createdAt: new Date().toISOString(),
    builderId: registerResult.data.builderId,
    ownerAddress: registerResult.data.ownerAddress,
  });

  return registerResult;
}
