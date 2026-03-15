import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockExecFileSync = vi.fn();

vi.mock("node:fs", () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    readdirSync: mockReaddirSync,
  },
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}));

describe("importChromeCookies", () => {
  const originalPlatform = process.platform;
  const originalHome = process.env.HOME;
  const originalLocalAppData = process.env.LOCALAPPDATA;
  const originalOverride = process.env.VANA_ENABLE_SYSTEM_COOKIE_IMPORT;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ profile: { last_used: "Default" } }),
    );
    mockExecFileSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
    process.env.HOME = originalHome;
    process.env.LOCALAPPDATA = originalLocalAppData;
    if (originalOverride === undefined) {
      delete process.env.VANA_ENABLE_SYSTEM_COOKIE_IMPORT;
    } else {
      process.env.VANA_ENABLE_SYSTEM_COOKIE_IMPORT = originalOverride;
    }
  });

  it("skips system cookie import on Windows by default", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
    process.env.LOCALAPPDATA = "C:\\Users\\Tim\\AppData\\Local";
    delete process.env.VANA_ENABLE_SYSTEM_COOKIE_IMPORT;

    mockExistsSync.mockReturnValue(true);

    const { importChromeCookies } =
      await import("../../src/runtime/playwright/browser.js");

    importChromeCookies("C:\\profile", "C:\\browser\\chrome.exe");

    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("can invoke sqlite3 on Windows when the explicit override is enabled", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
    process.env.LOCALAPPDATA = "C:\\Users\\Tim\\AppData\\Local";
    process.env.VANA_ENABLE_SYSTEM_COOKIE_IMPORT = "1";

    mockExistsSync.mockImplementation((target: string) => {
      const normalized = target.replace(/\//g, "\\");
      return (
        normalized === "C:\\browser\\chrome.exe" ||
        normalized ===
          "C:\\Users\\Tim\\AppData\\Local\\Google\\Chrome\\User Data" ||
        normalized ===
          "C:\\Users\\Tim\\AppData\\Local\\Google\\Chrome\\User Data\\Local State" ||
        normalized ===
          "C:\\Users\\Tim\\AppData\\Local\\Google\\Chrome\\User Data\\Default" ||
        normalized ===
          "C:\\Users\\Tim\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cookies" ||
        normalized === "C:\\profile\\Default\\Cookies"
      );
    });

    const { importChromeCookies } =
      await import("../../src/runtime/playwright/browser.js");

    importChromeCookies("C:\\profile", "C:\\browser\\chrome.exe");

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "sqlite3",
      [
        expect.stringContaining("C:\\profile"),
        expect.stringContaining("ATTACH DATABASE"),
      ],
      { stdio: "ignore" },
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("C:\\profile"),
      expect.stringContaining("T"),
      "utf8",
    );
  });

  it("skips system cookie import on Linux by default", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });
    process.env.HOME = "/home/tim";

    mockExistsSync.mockReturnValue(true);

    const { importChromeCookies } =
      await import("../../src/runtime/playwright/browser.js");

    importChromeCookies("/profile", "/browser/chrome");

    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("swallows sqlite3 failures under the explicit Linux override", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });
    process.env.HOME = "/home/tim";
    process.env.VANA_ENABLE_SYSTEM_COOKIE_IMPORT = "1";

    mockExistsSync.mockImplementation((target: string) =>
      [
        "/browser/chrome",
        "/home/tim/.config/google-chrome",
        "/home/tim/.config/google-chrome/Local State",
        "/home/tim/.config/google-chrome/Default",
        "/home/tim/.config/google-chrome/Default/Cookies",
        "/profile/Default/Cookies",
      ].includes(target),
    );
    mockExecFileSync.mockImplementation(() => {
      throw new Error("sqlite3 not found");
    });

    const { importChromeCookies } =
      await import("../../src/runtime/playwright/browser.js");

    expect(() =>
      importChromeCookies("/profile", "/browser/chrome"),
    ).not.toThrow();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
