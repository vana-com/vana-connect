import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LEGACY_LOCAL_STORAGE_KEY = "vana.connect.admin.apps";

class MemoryLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
}

function setupWindow(): MemoryLocalStorage {
  const memory = new MemoryLocalStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
  return memory;
}

function tearDownWindow(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: undefined,
  });
}

describe("admin-apps-storage", () => {
  let storage: MemoryLocalStorage;

  beforeEach(() => {
    storage = setupWindow();
    vi.resetModules();
  });

  afterEach(() => {
    tearDownWindow();
  });

  describe("readLegacyAdminApps", () => {
    it("returns rows from localStorage without mutating", async () => {
      const sample = [
        {
          id: "uuid-1",
          name: "Localhost",
          url: "http://localhost:3001",
          createdAt: "2026-04-01T00:00:00.000Z",
          builderId: "0xabc",
          ownerAddress: "0x1234567890123456789012345678901234567890",
        },
      ];
      storage.setItem(LEGACY_LOCAL_STORAGE_KEY, JSON.stringify(sample));

      const mod = await import("./admin-apps-storage");
      const got = mod.readLegacyAdminApps();
      expect(got).toEqual(sample);
      // Mutation guarantee: localStorage untouched.
      expect(storage.getItem(LEGACY_LOCAL_STORAGE_KEY)).toBe(
        JSON.stringify(sample),
      );
    });

    it("returns empty for missing localStorage key without writing anything", async () => {
      const mod = await import("./admin-apps-storage");
      const got = mod.readLegacyAdminApps();
      expect(got).toEqual([]);
      expect(storage.length).toBe(0);
    });

    it("returns empty when JSON is malformed and does not throw", async () => {
      storage.setItem(LEGACY_LOCAL_STORAGE_KEY, "{not json");
      const mod = await import("./admin-apps-storage");
      expect(mod.readLegacyAdminApps()).toEqual([]);
      // Malformed entry left in place so the user can recover.
      expect(storage.getItem(LEGACY_LOCAL_STORAGE_KEY)).toBe("{not json");
    });

    it("filters out non-RegisteredAdminApp shapes from a mixed array", async () => {
      const mixed = [
        {
          id: "good",
          name: "Good",
          url: "http://example.com",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
        { id: "bad-no-url", name: "Bad" },
        "not-an-object",
        null,
      ];
      storage.setItem(LEGACY_LOCAL_STORAGE_KEY, JSON.stringify(mixed));
      const mod = await import("./admin-apps-storage");
      const got = mod.readLegacyAdminApps();
      expect(got).toHaveLength(1);
      expect(got[0].id).toBe("good");
    });
  });

  describe("dismissLegacyAdminApps", () => {
    it("removes the legacy localStorage key when called", async () => {
      storage.setItem(
        LEGACY_LOCAL_STORAGE_KEY,
        JSON.stringify([
          {
            id: "x",
            name: "App",
            url: "http://example.com",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ]),
      );
      const mod = await import("./admin-apps-storage");
      mod.dismissLegacyAdminApps();
      expect(storage.getItem(LEGACY_LOCAL_STORAGE_KEY)).toBeNull();
    });

    it("does not destroy data the caller didn't explicitly dismiss", async () => {
      // SAFETY REGRESSION: PR #126's auto-migration cleared localStorage
      // even when every save 400'd. dismissLegacyAdminApps replaces that
      // path with an explicit caller-driven clear. Verify the act of
      // *reading* legacy entries never clears them.
      const sample = [
        {
          id: "untouched",
          name: "Untouched",
          url: "http://example.com",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      ];
      storage.setItem(LEGACY_LOCAL_STORAGE_KEY, JSON.stringify(sample));
      const mod = await import("./admin-apps-storage");
      // Read multiple times — none should mutate.
      mod.readLegacyAdminApps();
      mod.readLegacyAdminApps();
      mod.readLegacyAdminApps();
      expect(
        JSON.parse(storage.getItem(LEGACY_LOCAL_STORAGE_KEY) as string),
      ).toEqual(sample);
    });
  });

  describe("module exports", () => {
    it("does not export migrateLegacyAdminApps", async () => {
      // Auto-migration was removed because legacy localStorage rows lack
      // user identity. Re-introducing this export would silently re-enable
      // the data-loss path; the regression test catches that.
      const mod = await import("./admin-apps-storage");
      expect(
        (mod as Record<string, unknown>).migrateLegacyAdminApps,
      ).toBeUndefined();
    });
  });
});
