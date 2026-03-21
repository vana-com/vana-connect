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
  checkForUpdate,
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

  describe("checkForUpdate", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("fetches npm registry and writes cache file", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ version: "2.0.0" }),
        }),
      );

      await checkForUpdate("1.0.0", "installer");

      // installer checks GitHub releases, not npm — but let's verify the
      // mock was called and the cache written. Use the actual install method
      // that hits npm (the default branch).
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ version: "2.0.0" }),
        }),
      );

      await checkForUpdate("1.0.0", "development");

      const raw = await fs.readFile(getUpdateCheckPath(), "utf8");
      const cache = JSON.parse(raw);
      expect(cache.latestVersion).toBe("2.0.0");
      expect(cache.currentVersion).toBe("1.0.0");
      expect(cache.lastCheckedAt).toBeTruthy();
    });

    it("does not write cache when fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 500 }),
      );

      await checkForUpdate("1.0.0", "development");

      await expect(fs.access(getUpdateCheckPath())).rejects.toThrow();
    });

    it("fetches homebrew API for homebrew install method", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ versions: { stable: "3.0.0" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await checkForUpdate("1.0.0", "homebrew");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://formulae.brew.sh/api/formula/vana.json",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      const raw = await fs.readFile(getUpdateCheckPath(), "utf8");
      const cache = JSON.parse(raw);
      expect(cache.latestVersion).toBe("3.0.0");
    });

    it("fetches GitHub releases for installer install method", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: "v4.0.0" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await checkForUpdate("1.0.0", "installer");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/vana-com/vana-connect/releases/latest",
        expect.objectContaining({
          headers: { "User-Agent": "@opendatalabs/connect" },
          signal: expect.any(AbortSignal),
        }),
      );
      const raw = await fs.readFile(getUpdateCheckPath(), "utf8");
      const cache = JSON.parse(raw);
      expect(cache.latestVersion).toBe("4.0.0");
    });
  });
});
