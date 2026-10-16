import { describe, expect, it } from "vitest";
import { extractSignature } from "./api-auth";

describe("extractSignature", () => {
  it("reads the bearer value from the Authorization header", () => {
    const req = new Request("https://connect.example/api/servers", {
      headers: { Authorization: "Bearer 0xabc" },
    });
    expect(extractSignature(req)).toBe("0xabc");
  });

  it("ignores a masterKeySignature query parameter", () => {
    const req = new Request(
      "https://connect.example/api/servers?masterKeySignature=0xabc",
    );
    expect(extractSignature(req)).toBeNull();
  });

  it("returns null for an empty bearer value", () => {
    const req = new Request("https://connect.example/api/servers", {
      headers: { Authorization: "Bearer " },
    });
    expect(extractSignature(req)).toBeNull();
  });
});
