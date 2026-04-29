import { describe, expect, it } from "vitest";
import { resolvePrivyPublicEnv } from "./privy-env";

const VALID_APP_ID = "clu1234567890abcdef123456";
const VALID_CLIENT_ID = "client-abcdef1234567890";

describe("resolvePrivyPublicEnv", () => {
  it("returns ok when both ids look valid", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: VALID_APP_ID,
      NEXT_PUBLIC_PRIVY_CLIENT_ID: VALID_CLIENT_ID,
    });
    expect(result).toEqual({
      status: "ok",
      appId: VALID_APP_ID,
      clientId: VALID_CLIENT_ID,
    });
  });

  it("trims surrounding whitespace before validating", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: `  ${VALID_APP_ID}  `,
      NEXT_PUBLIC_PRIVY_CLIENT_ID: `\n${VALID_CLIENT_ID}\n`,
    });
    expect(result).toMatchObject({
      status: "ok",
      appId: VALID_APP_ID,
      clientId: VALID_CLIENT_ID,
    });
  });

  it("flags missing app id", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: undefined,
      NEXT_PUBLIC_PRIVY_CLIENT_ID: VALID_CLIENT_ID,
    });
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.reason).toContain("NEXT_PUBLIC_PRIVY_APP_ID");
      expect(result.reason).not.toContain("NEXT_PUBLIC_PRIVY_CLIENT_ID");
    }
  });

  it("flags missing client id", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: VALID_APP_ID,
      NEXT_PUBLIC_PRIVY_CLIENT_ID: undefined,
    });
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.reason).toContain("NEXT_PUBLIC_PRIVY_CLIENT_ID");
    }
  });

  it("rejects empty strings", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: "",
      NEXT_PUBLIC_PRIVY_CLIENT_ID: "",
    });
    expect(result.status).toBe("missing");
  });

  it("rejects literal 'undefined' (a common shell-substitution bug)", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: "undefined",
      NEXT_PUBLIC_PRIVY_CLIENT_ID: "undefined",
    });
    expect(result.status).toBe("missing");
  });

  it("rejects obvious placeholder values", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: "your-privy-app-id",
      NEXT_PUBLIC_PRIVY_CLIENT_ID: "your-privy-client-id",
    });
    expect(result.status).toBe("missing");
  });

  it("rejects app ids that do not match Privy's exact length check", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: "clu1234567890abcdef",
      NEXT_PUBLIC_PRIVY_CLIENT_ID: VALID_CLIENT_ID,
    });
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.reason).toContain("NEXT_PUBLIC_PRIVY_APP_ID");
    }
  });

  it("rejects values containing whitespace or quote chars", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: 'cl"injected"123456',
      NEXT_PUBLIC_PRIVY_CLIENT_ID: VALID_CLIENT_ID,
    });
    expect(result.status).toBe("missing");
  });

  it("reports both vars when both are missing", () => {
    const result = resolvePrivyPublicEnv({
      NEXT_PUBLIC_PRIVY_APP_ID: undefined,
      NEXT_PUBLIC_PRIVY_CLIENT_ID: undefined,
    });
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.reason).toContain("NEXT_PUBLIC_PRIVY_APP_ID");
      expect(result.reason).toContain("NEXT_PUBLIC_PRIVY_CLIENT_ID");
    }
  });
});
