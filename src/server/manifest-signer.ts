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

/**
 * Signs a web app manifest block for Vana Desktop App identity verification.
 *
 * Include the returned block under the `vana` key in your web app manifest JSON,
 * and make sure your HTML has `<link rel="manifest" href="/manifest.json">`.
 *
 * @param config - Manifest configuration including private key and app URLs.
 * @returns A signed {@link VanaManifestBlock}.
 *
 * @example
 * ```typescript
 * const vanaBlock = await signVanaManifest({
 *   privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
 *   appUrl: "https://yourapp.com",
 *   privacyPolicyUrl: "https://yourapp.com/privacy",
 *   termsUrl: "https://yourapp.com/terms",
 *   supportUrl: "https://yourapp.com/support",
 *   webhookUrl: "https://yourapp.com/api/webhook",
 * });
 * const manifest = { name: "Your App", vana: vanaBlock };
 * ```
 */
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
