import { describe, expect, it } from "vitest";
import { __testing__ } from "../../scripts/setup-hydra-clients";

describe("Hydra client setup", () => {
  it("keeps data-connect scoped for account APIs and personal-server ingest", () => {
    expect(__testing__.DATA_CONNECT.audience).toEqual([
      "account.vana.org",
      "vana-personal-server",
    ]);
  });

  it("keeps browser account sessions scoped to account APIs only", () => {
    expect(__testing__.VANA_ACCOUNT_WEB.audience).toEqual(["account.vana.org"]);
  });
});
