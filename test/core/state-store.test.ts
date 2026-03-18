import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot = path.join(os.tmpdir(), "vana-connect-state-store-tests");

vi.mock("../../src/core/paths.js", () => ({
  getCliStatePath: () => path.join(tempRoot, "vana-connect-state.json"),
  getVanaHome: () => tempRoot,
}));

import {
  __setStateStoreTestHooks,
  readCliState,
  updateSourceState,
} from "../../src/core/state-store.js";

describe("state-store", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "vana-connect-state-store-"),
    );
    __setStateStoreTestHooks(undefined);
  });

  afterEach(async () => {
    __setStateStoreTestHooks(undefined);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("preserves concurrent source updates", async () => {
    __setStateStoreTestHooks({
      beforeWrite: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
    });

    await Promise.all([
      updateSourceState("github", {
        lastRunOutcome: "connected_local_only",
        dataState: "collected_local",
      }),
      updateSourceState("shop", {
        lastRunOutcome: "legacy_auth",
        dataState: "none",
      }),
    ]);

    await expect(readCliState()).resolves.toEqual({
      version: 1,
      sources: {
        github: {
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
        },
        shop: {
          lastRunOutcome: "legacy_auth",
          dataState: "none",
        },
      },
    });
  });

  it("recovers from a stale state lock file", async () => {
    const lockPath = path.join(tempRoot, "vana-connect-state.json.lock");
    await fs.writeFile(lockPath, "stale\n", "utf8");
    const staleTime = new Date(Date.now() - 60_000);
    await fs.utimes(lockPath, staleTime, staleTime);

    await updateSourceState("github", {
      lastRunOutcome: "connected_local_only",
      dataState: "collected_local",
    });

    await expect(readCliState()).resolves.toEqual({
      version: 1,
      sources: {
        github: {
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
        },
      },
    });
  });
});
