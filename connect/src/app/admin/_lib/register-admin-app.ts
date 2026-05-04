import { saveAdminApp } from "./admin-apps-storage";
import type { RegisterBuilderErrorCode } from "./register-builder";
import { registerBuilder } from "./register-builder";
import { resolveRegisteredAppName } from "./resolve-registered-app-name";

type RegisterAdminAppFailure = {
  ok: false;
  error: {
    code: RegisterBuilderErrorCode | "PERSISTENCE_ERROR";
    message: string;
  };
};

type RegisterAdminAppSuccess = {
  ok: true;
  data: {
    privateKey: `0x${string}`;
    builderId: string;
    ownerAddress: string;
    publicKey: string;
  };
};

export type RegisterAdminAppResult =
  | RegisterAdminAppFailure
  | RegisterAdminAppSuccess;

export async function registerAdminApp({
  appUrl,
  masterKeySignature,
}: {
  appUrl: string;
  /**
   * Master-key signature ("vana-master-key-v1" personal_sign) — used to
   * authenticate the upsert into the oauth_clients registry. The recovered
   * wallet becomes the registry's `owner_address`. Without this we'd write
   * to localStorage only, which lost apps across devices and clearings.
   */
  masterKeySignature: string;
}): Promise<RegisterAdminAppResult> {
  const [registerResult, appName] = await Promise.all([
    registerBuilder(appUrl),
    resolveRegisteredAppName(appUrl),
  ]);

  if (!registerResult.ok) {
    return registerResult;
  }

  try {
    await saveAdminApp(masterKeySignature, {
      // Use the on-chain builderId as the OIDC client_id by default. Apps
      // that need a custom OAuth client_id (e.g. the dev fixture
      // `memory-app-dev`) can be upserted later via the admin API directly.
      clientId: registerResult.data.builderId,
      name: appName,
      url: appUrl,
      builderId: registerResult.data.builderId,
      granteeAddress: registerResult.data.ownerAddress,
      publicKey: registerResult.data.publicKey,
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "PERSISTENCE_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Failed to persist registered app",
      },
    };
  }

  return registerResult;
}
