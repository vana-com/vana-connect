/**
 * Node 25 exposes a partial `localStorage` global unless
 * `--localstorage-file=<path>` is configured. That object shadows jsdom
 * storage in Vitest. Install explicit in-memory Storage fixtures so tests
 * that use `localStorage` / `sessionStorage` behave like a browser.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const localStorageFixture = new MemoryStorage();
const sessionStorageFixture = new MemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageFixture,
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorageFixture,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageFixture,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: sessionStorageFixture,
  });
}
