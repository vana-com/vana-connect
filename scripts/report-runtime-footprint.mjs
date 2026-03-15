import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function main() {
  const dataHome = path.join(os.homedir(), ".dataconnect");
  const browserCacheDir =
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(dataHome, "browsers");

  const report = {
    generatedAt: new Date().toISOString(),
    paths: {
      dataHome,
      browserCacheDir,
      browserProfilesDir: path.join(dataHome, "browser-profiles"),
      connectorsDir: path.join(dataHome, "connectors"),
      logsDir: path.join(dataHome, "logs"),
    },
    sizes: {
      dataHome: await describePath(dataHome),
      browserCacheDir: await describePath(browserCacheDir),
      browserProfilesDir: await describePath(
        path.join(dataHome, "browser-profiles"),
      ),
      connectorsDir: await describePath(path.join(dataHome, "connectors")),
      logsDir: await describePath(path.join(dataHome, "logs")),
      packageRuntime: {
        playwright: await describeNodeModule("playwright"),
        playwrightCore: await describePlaywrightCore(),
        chromiumBidi: await describeNodeModule("chromium-bidi"),
      },
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function describeNodeModule(
  packageName,
  fallbackSpecifier = packageName,
) {
  try {
    const packageRoot = resolvePackageRoot(packageName, fallbackSpecifier);
    const info = await describePath(packageRoot);
    return {
      packageRoot,
      ...info,
    };
  } catch {
    return {
      exists: false,
      bytes: 0,
      files: 0,
    };
  }
}

async function describePlaywrightCore() {
  try {
    const playwrightRoot = resolvePackageRoot("playwright", "playwright");
    const siblingRoot = path.resolve(playwrightRoot, "..", "playwright-core");
    const info = await describePath(siblingRoot);
    if (info.exists) {
      return {
        packageRoot: siblingRoot,
        ...info,
      };
    }
  } catch {
    // Fall through to generic resolution below.
  }

  return describeNodeModule(
    "playwright-core",
    "playwright-core/lib/server/registry/index",
  );
}

function resolvePackageRoot(packageName, fallbackSpecifier) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    const entryPath = require.resolve(fallbackSpecifier);
    let current = path.dirname(entryPath);

    while (current !== path.dirname(current)) {
      const packageJsonPath = path.join(current, "package.json");
      try {
        require(packageJsonPath);
        return current;
      } catch {
        current = path.dirname(current);
      }
    }

    throw new Error(`Could not resolve package root for ${packageName}`);
  }
}

async function describePath(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      return {
        exists: true,
        bytes: stats.size,
        files: 1,
      };
    }

    const { bytes, files } = await walkSize(targetPath);
    return {
      exists: true,
      bytes,
      files,
    };
  } catch {
    return {
      exists: false,
      bytes: 0,
      files: 0,
    };
  }
}

async function walkSize(root) {
  let bytes = 0;
  let files = 0;
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkSize(entryPath);
      bytes += nested.bytes;
      files += nested.files;
      continue;
    }

    if (entry.isFile()) {
      const stats = await fs.stat(entryPath);
      bytes += stats.size;
      files += 1;
    }
  }

  return { bytes, files };
}

await main();
