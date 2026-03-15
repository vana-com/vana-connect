import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

import { chromium, type BrowserContext } from "playwright";

const CHROME_PATHS: Record<NodeJS.Platform, string | undefined> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  linux: "/usr/bin/google-chrome",
  aix: undefined,
  android: undefined,
  freebsd: undefined,
  haiku: undefined,
  openbsd: undefined,
  cygwin: undefined,
  netbsd: undefined,
  sunos: undefined,
};

const CHROME_PROFILE_DIRS: Record<NodeJS.Platform, string | undefined> = {
  darwin: path.join(
    process.env.HOME || "",
    "Library",
    "Application Support",
    "Google",
    "Chrome",
  ),
  win32: path.join(
    process.env.LOCALAPPDATA || "",
    "Google",
    "Chrome",
    "User Data",
  ),
  linux: path.join(process.env.HOME || "", ".config", "google-chrome"),
  aix: undefined,
  android: undefined,
  freebsd: undefined,
  haiku: undefined,
  openbsd: undefined,
  cygwin: undefined,
  netbsd: undefined,
  sunos: undefined,
};

export function getBrowserCacheDir(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }

  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [path.join(home, ".dataconnect", "browsers")];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return candidates[0];
}

export function getSystemChromePath(): string | null {
  const chromePath = CHROME_PATHS[process.platform];
  if (chromePath && fs.existsSync(chromePath)) {
    return chromePath;
  }

  if (process.platform === "win32") {
    const altPaths = [
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(
        process.env.LOCALAPPDATA || "",
        "Google\\Chrome\\Application\\chrome.exe",
      ),
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for (const candidate of altPaths) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function getDownloadedChromiumPath(): string | null {
  const cacheDir = getBrowserCacheDir();
  if (!fs.existsSync(cacheDir)) {
    return null;
  }

  const chromiumDir = fs
    .readdirSync(cacheDir)
    .find(
      (entry) => entry.startsWith("chromium-") && !entry.includes("headless"),
    );
  if (!chromiumDir) {
    return null;
  }

  const chromiumPath = path.join(cacheDir, chromiumDir);
  const candidates =
    process.platform === "darwin"
      ? [
          path.join(
            chromiumPath,
            "chrome-mac-arm64",
            "Google Chrome for Testing.app",
            "Contents",
            "MacOS",
            "Google Chrome for Testing",
          ),
          path.join(
            chromiumPath,
            "chrome-mac",
            "Google Chrome for Testing.app",
            "Contents",
            "MacOS",
            "Google Chrome for Testing",
          ),
          path.join(
            chromiumPath,
            "chrome-mac-arm64",
            "Chromium.app",
            "Contents",
            "MacOS",
            "Chromium",
          ),
          path.join(
            chromiumPath,
            "chrome-mac",
            "Chromium.app",
            "Contents",
            "MacOS",
            "Chromium",
          ),
        ]
      : process.platform === "win32"
        ? [
            path.join(chromiumPath, "chrome-win", "chrome.exe"),
            path.join(chromiumPath, "chrome-win64", "chrome.exe"),
          ]
        : [
            path.join(chromiumPath, "chrome-linux", "chrome"),
            path.join(chromiumPath, "chrome-linux64", "chrome"),
          ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function isSystemChrome(browserPath: string | null): boolean {
  if (!browserPath) {
    return false;
  }

  const lower = browserPath.toLowerCase();
  if (
    lower.includes(".databridge") ||
    lower.includes("chromium") ||
    lower.includes("chrome for testing")
  ) {
    return false;
  }

  return true;
}

export function getChromeProfileDir(chromeRoot: string): string | null {
  const localStatePath = path.join(chromeRoot, "Local State");
  if (fs.existsSync(localStatePath)) {
    try {
      const localState = JSON.parse(
        fs.readFileSync(localStatePath, "utf8"),
      ) as {
        profile?: { last_used?: string };
      };
      const lastUsed = localState.profile?.last_used;
      if (lastUsed) {
        const profileDir = path.join(chromeRoot, lastUsed);
        if (fs.existsSync(profileDir)) {
          return profileDir;
        }
      }
    } catch {
      // Ignore malformed local state and fall back to Default.
    }
  }

  const defaultDir = path.join(chromeRoot, "Default");
  return fs.existsSync(defaultDir) ? defaultDir : null;
}

export function supportsSystemChromeCookieImport(): boolean {
  if (process.env.VANA_ENABLE_SYSTEM_COOKIE_IMPORT === "1") {
    return true;
  }

  // Treat this as a macOS-only enhancement until we have explicit
  // validation for other platforms. The core CLI path should not depend on it.
  return process.platform === "darwin";
}

export function importChromeCookies(
  userDataDir: string,
  browserPath: string | null,
): void {
  if (!supportsSystemChromeCookieImport()) {
    return;
  }

  if (!isSystemChrome(browserPath)) {
    return;
  }

  const markerFile = path.join(userDataDir, ".cookies-imported");
  if (fs.existsSync(markerFile)) {
    return;
  }

  const chromeRoot = CHROME_PROFILE_DIRS[process.platform];
  if (!chromeRoot || !fs.existsSync(chromeRoot)) {
    return;
  }

  const sourceProfileDir = getChromeProfileDir(chromeRoot);
  if (!sourceProfileDir) {
    return;
  }

  const sourceCookies = path.join(sourceProfileDir, "Cookies");
  if (!fs.existsSync(sourceCookies)) {
    return;
  }

  const targetCookies = path.join(userDataDir, "Default", "Cookies");
  if (!fs.existsSync(targetCookies)) {
    return;
  }

  const sourceDb = sourceCookies.replace(/'/g, "''");
  const sql = `
ATTACH DATABASE '${sourceDb}' AS src;
INSERT OR REPLACE INTO main.cookies
SELECT * FROM src.cookies;
DETACH DATABASE src;
`;

  try {
    execFileSync("sqlite3", [targetCookies, sql.replace(/\n/g, " ")], {
      stdio: "ignore",
    });
    fs.writeFileSync(markerFile, `${new Date().toISOString()}\n`, "utf8");
  } catch {
    // Cookie import is opportunistic; continue if sqlite3 is unavailable.
  }
}

export function resolveBrowserPath(): string {
  let browserPath: string | null = null;

  if (!process.env.DATACONNECT_SIMULATE_NO_CHROME) {
    browserPath = getSystemChromePath();
  }

  if (!browserPath) {
    browserPath = getDownloadedChromiumPath();
  }

  if (!browserPath) {
    throw new Error(
      "No browser available. Run `vana setup` to install Chromium before connecting a source.",
    );
  }

  return browserPath;
}

export async function launchPersistentContext(
  userDataDir: string,
  headless: boolean,
  browserPath: string | null,
): Promise<BrowserContext> {
  fs.mkdirSync(userDataDir, { recursive: true });

  const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] =
    {
      headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=MediaRouter,DialMediaRouteProvider",
      ],
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

  if (browserPath) {
    launchOptions.executablePath = browserPath;
  }

  if (isSystemChrome(browserPath)) {
    launchOptions.ignoreDefaultArgs = ["--use-mock-keychain"];
  }

  return chromium.launchPersistentContext(userDataDir, launchOptions);
}

export function getDefaultUserDataDir(slug: string): string {
  return path.join(os.homedir(), ".dataconnect", "browser-profiles", slug);
}
