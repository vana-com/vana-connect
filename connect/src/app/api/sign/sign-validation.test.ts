import { describe, it, expect } from "vitest";
import { validateSignRequest } from "./sign-validation";

describe("validateSignRequest", () => {
  it("rejects missing type", () => {
    const result = validateSignRequest({ message: "hello" });
    expect(result).toEqual({
      valid: false,
      reason: "Invalid signing type",
    });
  });

  it("rejects unknown type", () => {
    const result = validateSignRequest({
      type: "eth_sign",
      message: "hello",
    });
    expect(result).toEqual({
      valid: false,
      reason: "Invalid signing type",
    });
  });

  it("rejects non-allowlisted personal_sign message", () => {
    const result = validateSignRequest({
      type: "personal_sign",
      message: "arbitrary-message",
    });
    expect(result).toEqual({
      valid: false,
      reason: "Message not in allowlist",
    });
  });

  it("rejects personal_sign with missing message", () => {
    const result = validateSignRequest({ type: "personal_sign" });
    expect(result).toEqual({
      valid: false,
      reason: "Message not in allowlist",
    });
  });

  it("accepts personal_sign with vana-master-key-v1", () => {
    const result = validateSignRequest({
      type: "personal_sign",
      message: "vana-master-key-v1",
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects non-allowlisted EIP-712 primaryType", () => {
    const result = validateSignRequest({
      type: "eth_signTypedData_v4",
      typedData: { primaryType: "Transfer" },
    });
    expect(result).toEqual({
      valid: false,
      reason: "Typed data primaryType not in allowlist",
    });
  });

  it("rejects EIP-712 with missing typedData", () => {
    const result = validateSignRequest({ type: "eth_signTypedData_v4" });
    expect(result).toEqual({
      valid: false,
      reason: "Typed data primaryType not in allowlist",
    });
  });

  it("accepts ServerRegistration primaryType", () => {
    const result = validateSignRequest({
      type: "eth_signTypedData_v4",
      typedData: { primaryType: "ServerRegistration" },
    });
    expect(result).toEqual({ valid: true });
  });

  it("accepts ServerDeregistration primaryType", () => {
    const result = validateSignRequest({
      type: "eth_signTypedData_v4",
      typedData: { primaryType: "ServerDeregistration" },
    });
    expect(result).toEqual({ valid: true });
  });
});
