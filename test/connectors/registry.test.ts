import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { fetchConnectorToCache } from "../../src/connectors/registry.js";

let tempRoot: string;
let cacheDir: string;
let dataConnectorsDir: string;

const MOCK_SCRIPT = "module.exports = async (page) => { return { ok: true }; }";
const MOCK_REGISTRY = {
  connectors: [
    {
      id: "github-playwright",
      name: "GitHub",
      company: "github",
      version: "1.2.0",
      exportFrequency: "weekly",
      files: { script: "github/github-playwright.js" },
    },
  ],
};

describe("fetchConnectorToCache", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vana-registry-test-"));
    cacheDir = path.join(tempRoot, "connectors");
    dataConnectorsDir = path.join(tempRoot, "data-connectors");
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(dataConnectorsDir, { recursive: true });

    // Write local registry and connector script
    await fs.writeFile(
      path.join(dataConnectorsDir, "registry.json"),
      JSON.stringify(MOCK_REGISTRY),
    );
    const scriptDir = path.join(dataConnectorsDir, "github");
    await fs.mkdir(scriptDir, { recursive: true });
    await fs.writeFile(
      path.join(scriptDir, "github-playwright.js"),
      MOCK_SCRIPT,
    );
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("downloads connector when no currentVersion is provided", async () => {
    const result = await fetchConnectorToCache(
      "github",
      cacheDir,
      dataConnectorsDir,
    );
    expect(result.version).toBe("1.2.0");
    expect(result.updated).toBe(true);
    expect(result.previousVersion).toBeUndefined();
    // Script should exist on disk
    const content = await fs.readFile(result.connectorPath, "utf8");
    expect(content).toBe(MOCK_SCRIPT);
  });

  it("skips download when currentVersion matches registry version", async () => {
    // First fetch to populate cache
    const first = await fetchConnectorToCache(
      "github",
      cacheDir,
      dataConnectorsDir,
    );
    expect(first.updated).toBe(true);

    // Second fetch with matching version
    const second = await fetchConnectorToCache(
      "github",
      cacheDir,
      dataConnectorsDir,
      "1.2.0",
    );
    expect(second.updated).toBe(false);
    expect(second.version).toBe("1.2.0");
    expect(second.connectorPath).toBe(first.connectorPath);
  });

  it("downloads when currentVersion differs from registry version", async () => {
    // First fetch to populate cache
    await fetchConnectorToCache("github", cacheDir, dataConnectorsDir);

    // Second fetch with outdated version
    const result = await fetchConnectorToCache(
      "github",
      cacheDir,
      dataConnectorsDir,
      "1.1.0",
    );
    expect(result.updated).toBe(true);
    expect(result.previousVersion).toBe("1.1.0");
    expect(result.version).toBe("1.2.0");
  });

  it("re-downloads when cached file is missing despite version match", async () => {
    // Fetch, then delete the cached file
    const first = await fetchConnectorToCache(
      "github",
      cacheDir,
      dataConnectorsDir,
    );
    await fs.rm(first.connectorPath);

    // Should re-download even though version matches
    const second = await fetchConnectorToCache(
      "github",
      cacheDir,
      dataConnectorsDir,
      "1.2.0",
    );
    expect(second.updated).toBe(true);
    const content = await fs.readFile(second.connectorPath, "utf8");
    expect(content).toBe(MOCK_SCRIPT);
  });

  it("falls back to cache when registry is unreachable", async () => {
    // First fetch to populate cache
    const first = await fetchConnectorToCache(
      "github",
      cacheDir,
      dataConnectorsDir,
    );

    // Remove the local registry so it's "unreachable"
    await fs.rm(path.join(dataConnectorsDir, "registry.json"));

    // Without dataConnectorsDir, it would try remote (which would fail in test).
    // But the offline fallback uses findCachedConnectorScript, so we need
    // to use no dataConnectorsDir and stub fetch to fail.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("Network unreachable");
    };
    try {
      const result = await fetchConnectorToCache(
        "github",
        cacheDir,
        undefined,
        "1.2.0",
      );
      expect(result.updated).toBe(false);
      expect(result.version).toBe("1.2.0");
      expect(result.connectorPath).toBe(first.connectorPath);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when registry is unreachable and no cache exists", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("Network unreachable");
    };
    try {
      await expect(fetchConnectorToCache("github", cacheDir)).rejects.toThrow(
        "Network unreachable",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when registry is unreachable and no currentVersion", async () => {
    // Even with cached file, if no currentVersion we can't return it safely
    await fetchConnectorToCache("github", cacheDir, dataConnectorsDir);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("Network unreachable");
    };
    try {
      await expect(fetchConnectorToCache("github", cacheDir)).rejects.toThrow(
        "Network unreachable",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("verifies checksum on fresh downloads", async () => {
    const registryWithChecksum = {
      connectors: [
        {
          ...MOCK_REGISTRY.connectors[0],
          checksums: { script: "sha256:badhash" },
        },
      ],
    };
    await fs.writeFile(
      path.join(dataConnectorsDir, "registry.json"),
      JSON.stringify(registryWithChecksum),
    );

    await expect(
      fetchConnectorToCache("github", cacheDir, dataConnectorsDir),
    ).rejects.toThrow("Checksum mismatch");
  });
});
