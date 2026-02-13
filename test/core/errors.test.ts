import { describe, it, expect } from "vitest";
import { ConnectError, ConnectErrorCode } from "../../src/core/errors.js";

describe("ConnectErrorCode", () => {
  it("contains all expected error codes", () => {
    expect(ConnectErrorCode.SESSION_INIT_FAILED).toBe("SESSION_INIT_FAILED");
    expect(ConnectErrorCode.SESSION_EXPIRED).toBe("SESSION_EXPIRED");
    expect(ConnectErrorCode.POLL_FAILED).toBe("POLL_FAILED");
    expect(ConnectErrorCode.POLL_TIMEOUT).toBe("POLL_TIMEOUT");
    expect(ConnectErrorCode.SERVER_NOT_FOUND).toBe("SERVER_NOT_FOUND");
    expect(ConnectErrorCode.GATEWAY_ERROR).toBe("GATEWAY_ERROR");
    expect(ConnectErrorCode.DATA_FETCH_FAILED).toBe("DATA_FETCH_FAILED");
    expect(ConnectErrorCode.LIST_SCOPES_FAILED).toBe("LIST_SCOPES_FAILED");
    expect(ConnectErrorCode.LIST_VERSIONS_FAILED).toBe("LIST_VERSIONS_FAILED");
    expect(ConnectErrorCode.CONFIG_INVALID).toBe("CONFIG_INVALID");
    expect(ConnectErrorCode.WEBHOOK_INVALID).toBe("WEBHOOK_INVALID");
  });

  it("has 11 error codes", () => {
    expect(Object.keys(ConnectErrorCode)).toHaveLength(11);
  });
});

describe("ConnectError", () => {
  it("accepts ConnectErrorCode values", () => {
    const error = new ConnectError(
      "test",
      ConnectErrorCode.SESSION_INIT_FAILED,
    );
    expect(error.code).toBe("SESSION_INIT_FAILED");
    expect(error.message).toBe("test");
    expect(error.name).toBe("ConnectError");
  });

  it("accepts arbitrary string codes for backward compat", () => {
    const error = new ConnectError("test", "CUSTOM_CODE");
    expect(error.code).toBe("CUSTOM_CODE");
  });

  it("includes statusCode when provided", () => {
    const error = new ConnectError("test", ConnectErrorCode.GATEWAY_ERROR, 502);
    expect(error.statusCode).toBe(502);
  });
});
