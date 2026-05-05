// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedDataDefinition } from "../signing-purposes";

// Hoisted mock state. `vi.hoisted` lets us reference these inside the
// `vi.mock` factory without TDZ issues.
const mocks = vi.hoisted(() => ({
  signTypedData: vi.fn(),
  privyClientCtor: vi.fn(),
}));

vi.mock("@privy-io/node", () => {
  class PrivyClient {
    constructor(opts: unknown) {
      mocks.privyClientCtor(opts);
    }
    wallets() {
      return {
        ethereum: () => ({
          signTypedData: mocks.signTypedData,
        }),
      };
    }
  }
  return { PrivyClient };
});

import { __resetPrivyClientForTests, privyAdapter } from "./privy";

const WALLET_ID = "privy-wallet-id-abc123";
const FAKE_SIGNATURE = "0x" + "a".repeat(130);

function fakeTypedData(): TypedDataDefinition {
  return {
    domain: {
      name: "Vana Data Portability",
      version: "1",
      chainId: 1480,
      verifyingContract: "0x" + "1".repeat(40),
    },
    primaryType: "Test",
    types: {
      Test: [{ name: "value", type: "string" }],
    },
    message: { value: "hello" },
  };
}

describe("privyAdapter.signTypedData", () => {
  beforeEach(() => {
    __resetPrivyClientForTests();
    mocks.signTypedData.mockReset();
    mocks.privyClientCtor.mockReset();
    process.env.PRIVY_APP_ID = "test-app-id";
    process.env.PRIVY_APP_SECRET = "test-app-secret";
    process.env.PRIVY_SIGNER_PRIVATE_KEY = "test-signer-private-key";
  });

  afterEach(() => {
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_APP_SECRET;
    delete process.env.PRIVY_SIGNER_PRIVATE_KEY;
  });

  it("calls Privy SDK with the exact expected shape (translates primaryType → primary_type)", async () => {
    mocks.signTypedData.mockResolvedValue({ signature: FAKE_SIGNATURE });
    const typedData = fakeTypedData();

    await privyAdapter.signTypedData({
      walletProviderId: WALLET_ID,
      typedData,
    });

    expect(mocks.signTypedData).toHaveBeenCalledTimes(1);
    expect(mocks.signTypedData).toHaveBeenCalledWith(WALLET_ID, {
      params: {
        typed_data: {
          domain: typedData.domain,
          message: typedData.message,
          primary_type: typedData.primaryType,
          types: typedData.types,
        },
      },
      authorization_context: {
        authorization_private_keys: ["test-signer-private-key"],
      },
    });

    // Sanity-check: the camelCase key must NOT leak through to the SDK.
    const sdkArg = mocks.signTypedData.mock.calls[0][1];
    expect(sdkArg.params.typed_data).not.toHaveProperty("primaryType");
  });

  it("returns the signature unchanged from the SDK response", async () => {
    mocks.signTypedData.mockResolvedValue({ signature: FAKE_SIGNATURE });

    const result = await privyAdapter.signTypedData({
      walletProviderId: WALLET_ID,
      typedData: fakeTypedData(),
    });

    expect(result).toEqual({ signature: FAKE_SIGNATURE });
  });

  it("instantiates PrivyClient lazily from env vars", async () => {
    mocks.signTypedData.mockResolvedValue({ signature: FAKE_SIGNATURE });

    await privyAdapter.signTypedData({
      walletProviderId: WALLET_ID,
      typedData: fakeTypedData(),
    });

    expect(mocks.privyClientCtor).toHaveBeenCalledTimes(1);
    expect(mocks.privyClientCtor).toHaveBeenCalledWith({
      appId: "test-app-id",
      appSecret: "test-app-secret",
    });

    // Second call must reuse the singleton.
    await privyAdapter.signTypedData({
      walletProviderId: WALLET_ID,
      typedData: fakeTypedData(),
    });
    expect(mocks.privyClientCtor).toHaveBeenCalledTimes(1);
  });

  it("propagates SDK failures as plain Error", async () => {
    mocks.signTypedData.mockRejectedValue(
      new Error("upstream privy 500: wallet busy"),
    );

    await expect(
      privyAdapter.signTypedData({
        walletProviderId: WALLET_ID,
        typedData: fakeTypedData(),
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("does not leak walletProviderId or SDK message into the error", async () => {
    const sdkError = new Error(
      `wallet ${WALLET_ID} not found; private key=secret-leak`,
    );
    sdkError.name = "PrivyApiError";
    mocks.signTypedData.mockRejectedValue(sdkError);

    let caught: unknown;
    try {
      await privyAdapter.signTypedData({
        walletProviderId: WALLET_ID,
        typedData: fakeTypedData(),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toContain(WALLET_ID);
    expect(message).not.toContain("secret-leak");
    expect(message).not.toContain("test-signer-private-key");
  });

  it("throws if a required env var is missing", async () => {
    delete process.env.PRIVY_SIGNER_PRIVATE_KEY;

    await expect(
      privyAdapter.signTypedData({
        walletProviderId: WALLET_ID,
        typedData: fakeTypedData(),
      }),
    ).rejects.toThrow(/PRIVY_SIGNER_PRIVATE_KEY/);
  });
});
