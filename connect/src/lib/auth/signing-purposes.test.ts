import { describe, expect, it } from "vitest";
import {
  HIGH_RISK_PURPOSES,
  getValidator,
  isHighRisk,
  isSigningPurpose,
  type SigningPurpose,
  type TypedDataDefinition,
} from "./signing-purposes";

const ADDR = "0x" + "1".repeat(40);
const ADDR2 = "0x" + "2".repeat(40);
const PUBKEY = "0x04" + "a".repeat(128);
const BYTES32 = "0x" + "f".repeat(64);

function registerPersonalServerTypedData(
  overrides: Partial<TypedDataDefinition["message"]> = {},
): TypedDataDefinition {
  return {
    domain: {
      name: "Vana Data Portability",
      version: "1",
      chainId: 1480,
      verifyingContract: ADDR,
    },
    primaryType: "ServerRegistration",
    types: {
      ServerRegistration: [
        { name: "ownerAddress", type: "address" },
        { name: "serverAddress", type: "address" },
        { name: "publicKey", type: "string" },
        { name: "serverUrl", type: "string" },
      ],
    },
    message: {
      ownerAddress: ADDR,
      serverAddress: ADDR2,
      publicKey: PUBKEY,
      serverUrl: "https://0xabc.myvana.app",
      ...overrides,
    },
  };
}

function createGrantTypedData(
  overrides: Partial<TypedDataDefinition["message"]> = {},
): TypedDataDefinition {
  return {
    domain: { name: "Vana Data Portability", version: "1", chainId: 1480 },
    primaryType: "GrantRegistration",
    types: {
      GrantRegistration: [
        { name: "user", type: "address" },
        { name: "builder", type: "address" },
        { name: "scopes", type: "string[]" },
        { name: "expiresAt", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    message: {
      user: ADDR,
      builder: ADDR2,
      scopes: ["chatgpt.memories"],
      expiresAt: 0,
      nonce: 1,
      ...overrides,
    },
  };
}

describe("isSigningPurpose", () => {
  it("accepts the four canonical purposes", () => {
    for (const p of [
      "register_personal_server",
      "register_personal_server_deregistration",
      "create_grant",
      "revoke_grant",
    ]) {
      expect(isSigningPurpose(p)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isSigningPurpose("register_builder")).toBe(false);
    expect(isSigningPurpose("")).toBe(false);
    expect(isSigningPurpose(null)).toBe(false);
    expect(isSigningPurpose(42)).toBe(false);
  });
});

describe("isHighRisk", () => {
  it("flags register/deregister/create_grant as high-risk", () => {
    expect(isHighRisk("register_personal_server")).toBe(true);
    expect(isHighRisk("register_personal_server_deregistration")).toBe(true);
    expect(isHighRisk("create_grant")).toBe(true);
  });

  it("flags revoke_grant as not-high-risk (revocation is user-protective)", () => {
    expect(isHighRisk("revoke_grant")).toBe(false);
  });

  it("HIGH_RISK_PURPOSES is a Set with three members", () => {
    expect(HIGH_RISK_PURPOSES.size).toBe(3);
  });
});

describe("register_personal_server validator", () => {
  const v = getValidator("register_personal_server");

  it("accepts a well-formed payload", () => {
    expect(v.validate(registerPersonalServerTypedData())).toEqual({ ok: true });
  });

  it("rejects wrong primaryType", () => {
    const td = registerPersonalServerTypedData();
    td.primaryType = "WrongType";
    expect(v.validate(td)).toEqual({
      ok: false,
      reason: expect.stringContaining("primaryType"),
    });
  });

  it("rejects wrong domain.name", () => {
    const td = registerPersonalServerTypedData();
    td.domain.name = "Some Other App";
    expect(v.validate(td)).toEqual({
      ok: false,
      reason: expect.stringContaining("domain.name"),
    });
  });

  it("rejects bad publicKey shape", () => {
    expect(
      v.validate(registerPersonalServerTypedData({ publicKey: "0x123" })),
    ).toEqual({ ok: false, reason: expect.stringContaining("publicKey") });
  });

  it("rejects non-https serverUrl", () => {
    expect(
      v.validate(registerPersonalServerTypedData({ serverUrl: "http://x" })),
    ).toEqual({ ok: false, reason: expect.stringContaining("https") });
  });

  it("rejects extra message fields not covered by summary template", () => {
    expect(
      v.validate(
        registerPersonalServerTypedData({ extra: "sneaky" } as Record<
          string,
          unknown
        >),
      ),
    ).toEqual({ ok: false, reason: expect.stringContaining("unexpected") });
  });

  it("summarize returns every message field in the summary", () => {
    const td = registerPersonalServerTypedData();
    const summary = v.summarize(td);
    for (const key of Object.keys(td.message)) {
      expect(summary).toHaveProperty(key);
    }
    expect(summary.purpose).toBe("register_personal_server");
  });
});

describe("create_grant validator", () => {
  const v = getValidator("create_grant");

  it("accepts a well-formed payload", () => {
    expect(v.validate(createGrantTypedData())).toEqual({ ok: true });
  });

  it("rejects empty scopes", () => {
    expect(v.validate(createGrantTypedData({ scopes: [] }))).toEqual({
      ok: false,
      reason: expect.stringContaining("scopes"),
    });
  });

  it("rejects non-numeric expiresAt", () => {
    expect(
      v.validate(
        createGrantTypedData({ expiresAt: "0" } as Record<string, unknown>),
      ),
    ).toEqual({ ok: false, reason: expect.stringContaining("expiresAt") });
  });

  it("rejects bad builder address", () => {
    expect(
      v.validate(createGrantTypedData({ builder: "not-an-addr" })),
    ).toEqual({
      ok: false,
      reason: expect.stringContaining("builder"),
    });
  });

  it("summarize returns every message field", () => {
    const td = createGrantTypedData();
    const summary = v.summarize(td);
    for (const key of Object.keys(td.message)) {
      expect(summary).toHaveProperty(key);
    }
  });
});

describe("revoke_grant validator", () => {
  const v = getValidator("revoke_grant");
  const valid: TypedDataDefinition = {
    domain: { name: "Vana Data Portability" },
    primaryType: "GrantRevocation",
    types: {
      GrantRevocation: [
        { name: "grantorAddress", type: "address" },
        { name: "grantId", type: "bytes32" },
      ],
    },
    message: { grantorAddress: ADDR, grantId: BYTES32 },
  };

  it("accepts a well-formed payload", () => {
    expect(v.validate(valid)).toEqual({ ok: true });
  });

  it("rejects bad grantId shape", () => {
    expect(
      v.validate({ ...valid, message: { ...valid.message, grantId: "0xabc" } }),
    ).toEqual({ ok: false, reason: expect.stringContaining("grantId") });
  });
});

describe("summary completeness invariant", () => {
  // Every typed-data message field must appear in the summary template, or
  // the validator must reject the payload (covered by the "unexpected field"
  // test above for register_personal_server). This test is the catch-all
  // assertion across all purposes.
  const cases: Array<{ purpose: SigningPurpose; td: TypedDataDefinition }> = [
    {
      purpose: "register_personal_server",
      td: registerPersonalServerTypedData(),
    },
    { purpose: "create_grant", td: createGrantTypedData() },
    {
      purpose: "revoke_grant",
      td: {
        domain: { name: "Vana Data Portability" },
        primaryType: "GrantRevocation",
        types: {
          GrantRevocation: [
            { name: "grantorAddress", type: "address" },
            { name: "grantId", type: "bytes32" },
          ],
        },
        message: { grantorAddress: ADDR, grantId: BYTES32 },
      },
    },
    {
      purpose: "register_personal_server_deregistration",
      td: {
        domain: { name: "Vana Data Portability" },
        primaryType: "ServerDeregistration",
        types: {
          ServerDeregistration: [
            { name: "ownerAddress", type: "address" },
            { name: "serverAddress", type: "address" },
          ],
        },
        message: { ownerAddress: ADDR, serverAddress: ADDR2 },
      },
    },
  ];

  for (const c of cases) {
    it(`${c.purpose}: every message field appears in summary`, () => {
      const v = getValidator(c.purpose);
      const validation = v.validate(c.td);
      expect(validation).toEqual({ ok: true });
      const summary = v.summarize(c.td);
      for (const key of Object.keys(c.td.message)) {
        expect(summary).toHaveProperty(key);
      }
    });
  }
});
