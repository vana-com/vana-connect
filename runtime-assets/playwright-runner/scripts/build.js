/**
 * Build script for playwright-runner
 *
 * Creates standalone binaries with bundled Node.js and copies Playwright browsers.
 */

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  statSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir, platform, arch } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");

// Determine current platform
const PLATFORM = platform();
const ARCH = arch();

function log(msg) {
  console.log(`[build] ${msg}`);
}

function exec(cmd, opts = {}) {
  log(`Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

// Get Playwright browser path
function getPlaywrightBrowserPath() {
  // Playwright stores browsers in different locations depending on OS:
  // - macOS: ~/Library/Caches/ms-playwright
  // - Linux: ~/.cache/ms-playwright
  // - Windows: %LOCALAPPDATA%\ms-playwright
  if (PLATFORM === "darwin") {
    return join(homedir(), "Library", "Caches", "ms-playwright");
  } else if (PLATFORM === "win32") {
    return join(process.env.LOCALAPPDATA || "", "ms-playwright");
  }
  return join(homedir(), ".cache", "ms-playwright");
}

// Find the chromium directory
function findChromiumDir(basePath) {
  if (!existsSync(basePath)) {
    return null;
  }

  const entries = readdirSync(basePath);
  const chromiumDir = entries.find((e) => e.startsWith("chromium-"));

  if (chromiumDir) {
    return join(basePath, chromiumDir);
  }
  return null;
}

// Get pkg target for current platform
function getPkgTarget() {
  const nodeVersion = "node20";

  if (PLATFORM === "darwin") {
    return ARCH === "arm64"
      ? `${nodeVersion}-macos-arm64`
      : `${nodeVersion}-macos-x64`;
  } else if (PLATFORM === "win32") {
    return `${nodeVersion}-win-x64`;
  } else {
    return `${nodeVersion}-linux-x64`;
  }
}

// Get output binary name
function getOutputName() {
  const base = "playwright-runner";
  if (PLATFORM === "win32") {
    return `${base}.exe`;
  }
  return base;
}

async function build() {
  // Check for --lean flag (production builds without bundled Chromium)
  const isLean = process.argv.includes("--lean");

  log(`Starting ${isLean ? "LEAN " : ""}build...`);
  if (isLean) {
    log(
      "Lean mode: Chromium will NOT be bundled (downloaded on-demand at runtime)",
    );
  }

  // Clean dist
  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true });
  }
  mkdirSync(DIST, { recursive: true });

  // Only install browsers if not lean build (needed for pkg to bundle playwright-core)
  if (!isLean) {
    log("Ensuring Playwright browsers are installed...");
    exec("npx playwright install chromium");
  }

  // Build with pkg
  const target = getPkgTarget();
  const outputName = getOutputName();
  const outputPath = join(DIST, outputName);

  log(`Building for target: ${target}`);
  exec(
    `npx pkg index.cjs -t ${target} -o "${outputPath}" --no-bytecode --public-packages '*' --public`,
  );

  // Copy Playwright browser (only for non-lean builds)
  if (!isLean) {
    const browserSrc = getPlaywrightBrowserPath();
    const chromiumDir = findChromiumDir(browserSrc);

    if (chromiumDir) {
      const browserDest = join(DIST, "browsers");
      mkdirSync(browserDest, { recursive: true });

      const chromiumDirName =
        chromiumDir.split("/").pop() || chromiumDir.split("\\").pop();
      const destPath = join(browserDest, chromiumDirName);

      log(`Copying Chromium from ${chromiumDir} to ${destPath}...`);
      cpSync(chromiumDir, destPath, { recursive: true });

      log("Browser copied successfully");
    } else {
      log(
        'WARNING: Could not find Chromium browser. Run "npx playwright install chromium" first.',
      );
    }
  } else {
    log("Skipping browser copy (lean build)");
  }

  // Sign the binary on macOS (required for it to run after being copied)
  if (PLATFORM === "darwin") {
    log("Signing binary for macOS...");
    try {
      execSync(`codesign --force --sign - "${outputPath}"`, {
        stdio: "inherit",
      });
      log("Binary signed successfully");
    } catch {
      log(
        "Warning: Failed to sign binary (may cause issues running the binary)",
      );
    }
  }

  log("Build complete!");
  log(`Output: ${DIST}`);

  // List output
  const files = readdirSync(DIST);
  log("Contents:");
  for (const file of files) {
    const stat = statSync(join(DIST, file));
    const size = stat.isDirectory()
      ? "dir"
      : `${(stat.size / 1024 / 1024).toFixed(1)}MB`;
    log(`  ${file} (${size})`);
  }
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
