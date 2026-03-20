import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot = path.join(os.tmpdir(), "vana-update-check-tests");

vi.mock("../../src/core/paths.js", () => ({
  getVanaHome: () => tempRoot,
}));

import {
  readUpdateCheck,
  isNewerVersion,
  getUpdateCheckPath,
} from "../../src/cli/update-check.js";

describe("update-check", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vana-update-check-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  describe("readUpdateCheck", () => {
    it("returns null when cache file is missing", async () => {
      const result = await readUpdateCheck();
      expect(result).toBeNull();
    });

    it("returns null when cache is expired (>24h)", async () => {
      const expired = {
        lastCheckedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        latestVersion: "1.0.0",
        currentVersion: "0.9.0",
      };
      await fs.writeFile(getUpdateCheckPath(), JSON.stringify(expired));
      const result = await readUpdateCheck();
      expect(result).toBeNull();
    });

    it("returns cache when fresh (<24h)", async () => {
      const fresh = {
        lastCheckedAt: new Date().toISOString(),
        latestVersion: "1.0.0",
        currentVersion: "0.9.0",
      };
      await fs.writeFile(getUpdateCheckPath(), JSON.stringify(fresh));
      const result = await readUpdateCheck();
      expect(result).not.toBeNull();
      expect(result!.latestVersion).toBe("1.0.0");
    });

    it("returns null for invalid JSON", async () => {
      await fs.writeFile(getUpdateCheckPath(), "not json");
      const result = await readUpdateCheck();
      expect(result).toBeNull();
    });
  });

  describe("isNewerVersion", () => {
    it("detects patch upgrade", () => {
      expect(isNewerVersion("0.8.0", "0.8.1")).toBe(true);
    });

    it("detects minor upgrade", () => {
      expect(isNewerVersion("0.8.0", "0.9.0")).toBe(true);
    });

    it("detects major upgrade", () => {
      expect(isNewerVersion("0.9.0", "1.0.0")).toBe(true);
    });

    it("returns false for same version", () => {
      expect(isNewerVersion("0.9.0", "0.9.0")).toBe(false);
    });

    it("returns false for downgrade", () => {
      expect(isNewerVersion("0.10.0", "0.9.0")).toBe(false);
    });

    it("handles v prefix", () => {
      expect(isNewerVersion("v0.8.0", "v0.9.0")).toBe(true);
    });

    it("compares major correctly across boundaries", () => {
      expect(isNewerVersion("1.0.0", "0.99.0")).toBe(false);
    });

    it("handles missing patch version", () => {
      expect(isNewerVersion("0.8", "0.9")).toBe(true);
    });
  });
});
