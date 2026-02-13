import { describe, it, expect } from "vitest";
import { isValidGrant } from "../../src/core/grants.js";

const VALID_GRANT = {
  grantId: "grant-1",
  userAddress: "0xuser",
  builderAddress: "0xbuilder",
  scopes: ["instagram.dpv1"],
};

describe("isValidGrant", () => {
  it("returns true for a valid grant", () => {
    expect(isValidGrant(VALID_GRANT)).toBe(true);
  });

  it("returns true when optional fields are present", () => {
    expect(
      isValidGrant({
        ...VALID_GRANT,
        serverAddress: "0xserver",
        appUserId: "user-42",
      }),
    ).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidGrant(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidGrant(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isValidGrant("not a grant")).toBe(false);
  });

  it("returns false when grantId is missing", () => {
    expect(
      isValidGrant({
        userAddress: "0xuser",
        builderAddress: "0xbuilder",
        scopes: ["instagram.dpv1"],
      }),
    ).toBe(false);
  });

  it("returns false when userAddress is missing", () => {
    expect(
      isValidGrant({
        grantId: "grant-1",
        builderAddress: "0xbuilder",
        scopes: ["instagram.dpv1"],
      }),
    ).toBe(false);
  });

  it("returns false when builderAddress is missing", () => {
    expect(
      isValidGrant({
        grantId: "grant-1",
        userAddress: "0xuser",
        scopes: ["instagram.dpv1"],
      }),
    ).toBe(false);
  });

  it("returns false when scopes is missing", () => {
    expect(
      isValidGrant({
        grantId: "grant-1",
        userAddress: "0xuser",
        builderAddress: "0xbuilder",
      }),
    ).toBe(false);
  });

  it("returns false when scopes is empty", () => {
    expect(isValidGrant({ ...VALID_GRANT, scopes: [] })).toBe(false);
  });

  it("returns false when scopes contains non-strings", () => {
    expect(isValidGrant({ ...VALID_GRANT, scopes: [123] })).toBe(false);
  });

  it("returns false when grantId is empty string", () => {
    expect(isValidGrant({ ...VALID_GRANT, grantId: "" })).toBe(false);
  });

  it("returns false when scopes contains empty strings", () => {
    expect(
      isValidGrant({ ...VALID_GRANT, scopes: ["", "instagram.dpv1"] }),
    ).toBe(false);
  });
});
