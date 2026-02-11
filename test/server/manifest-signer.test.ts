import { describe, it, expect } from "vitest";
import { signVanaManifest } from "../../src/server/manifest-signer.js";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_ADDRESS = privateKeyToAccount(TEST_PRIVATE_KEY).address;

const TEST_CONFIG = {
  privateKey: TEST_PRIVATE_KEY,
  appUrl: "https://example.com",
  privacyPolicyUrl: "https://example.com/privacy",
  termsUrl: "https://example.com/terms",
  supportUrl: "https://example.com/support",
  webhookUrl: "https://example.com/api/webhook",
} as const;

describe("signVanaManifest", () => {
  it("returns all vana block fields plus signature", async () => {
    const block = await signVanaManifest(TEST_CONFIG);

    expect(block.appUrl).toBe(TEST_CONFIG.appUrl);
    expect(block.privacyPolicyUrl).toBe(TEST_CONFIG.privacyPolicyUrl);
    expect(block.termsUrl).toBe(TEST_CONFIG.termsUrl);
    expect(block.supportUrl).toBe(TEST_CONFIG.supportUrl);
    expect(block.webhookUrl).toBe(TEST_CONFIG.webhookUrl);
    expect(block.signature).toMatch(/^0x[0-9a-f]+$/);
  });

  it("signature is recoverable to the signer address", async () => {
    const block = await signVanaManifest(TEST_CONFIG);

    const { signature, ...fields } = block;
    const canonical = Object.keys(fields)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = fields[key as keyof typeof fields];
        return acc;
      }, {});
    const message = JSON.stringify(canonical);

    const valid = await verifyMessage({
      address: TEST_ADDRESS,
      message,
      signature: signature as `0x${string}`,
    });
    expect(valid).toBe(true);
  });

  it("produces deterministic output for same input", async () => {
    const block1 = await signVanaManifest(TEST_CONFIG);
    const block2 = await signVanaManifest(TEST_CONFIG);

    expect(block1).toEqual(block2);
  });
});
