import { describe, expect, it } from "vitest";
import {
  asVanaUserId,
  asVanaWalletId,
  assertVanaUserId,
  isVanaUserId,
  isVanaWalletId,
} from "./branded-ids";

const VALID_USER = "vana_user_" + "0".repeat(32);
const VALID_WALLET = "vana_wallet_" + "a".repeat(32);

describe("VanaUserId", () => {
  it("isVanaUserId accepts canonical shape", () => {
    expect(isVanaUserId(VALID_USER)).toBe(true);
  });

  it("isVanaUserId rejects everything else", () => {
    expect(isVanaUserId("did:privy:abc123")).toBe(false);
    expect(isVanaUserId("vana_user_short")).toBe(false);
    expect(isVanaUserId(VALID_USER + "extra")).toBe(false);
    expect(isVanaUserId("VANA_USER_" + "0".repeat(32))).toBe(false); // wrong case
    expect(isVanaUserId(null)).toBe(false);
    expect(isVanaUserId(42)).toBe(false);
  });

  it("assertVanaUserId throws for invalid", () => {
    expect(() => assertVanaUserId("did:privy:abc")).toThrow();
  });

  it("assertVanaUserId is a type-narrowing assertion", () => {
    const v = VALID_USER as string;
    assertVanaUserId(v);
    // After assertion, v is narrowed; calling a function that takes VanaUserId compiles.
    const echo = (id: ReturnType<typeof asVanaUserId>): string => id;
    expect(echo(v)).toBe(VALID_USER);
  });

  it("asVanaUserId returns the branded value", () => {
    expect(asVanaUserId(VALID_USER)).toBe(VALID_USER);
  });
});

describe("VanaWalletId", () => {
  it("isVanaWalletId accepts canonical shape", () => {
    expect(isVanaWalletId(VALID_WALLET)).toBe(true);
  });

  it("isVanaWalletId rejects non-canonical strings", () => {
    expect(isVanaWalletId("vana_wallet_short")).toBe(false);
    expect(isVanaWalletId(VALID_USER)).toBe(false);
  });

  it("asVanaWalletId throws for invalid", () => {
    expect(() => asVanaWalletId("not_a_wallet_id")).toThrow();
  });
});
