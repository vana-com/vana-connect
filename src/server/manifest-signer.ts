import { privateKeyToAccount } from "viem/accounts";
import type { VanaManifestConfig, VanaManifestBlock } from "../core/types.js";

function canonicalizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalizeJson);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    if (key === "signature") continue;
    sorted[key] = canonicalizeJson((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export async function signVanaManifest(
  config: VanaManifestConfig,
): Promise<VanaManifestBlock> {
  const account = privateKeyToAccount(config.privateKey);

  const block = {
    appUrl: config.appUrl,
    privacyPolicyUrl: config.privacyPolicyUrl,
    supportUrl: config.supportUrl,
    termsUrl: config.termsUrl,
    webhookUrl: config.webhookUrl,
  };

  const canonical = canonicalizeJson(block);
  const message = JSON.stringify(canonical);
  const signature = await account.signMessage({ message });

  return { ...block, signature };
}
