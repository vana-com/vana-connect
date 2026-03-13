import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sea from "node:sea";

import { ensureParentDir, getDataConnectHome } from "../core/index.js";

const RUNTIME_ASSET_KEYS = [
  "runtime-assets/playwright-runner/index.cjs",
  "runtime-assets/playwright-runner/package.json",
  "runtime-assets/playwright-runner/package-lock.json",
  "runtime-assets/playwright-runner/entitlements.plist",
  "runtime-assets/playwright-runner/scripts/build.js",
] as const;

export interface BundledRuntimePaths {
  playwrightRunnerDir: string;
}

export async function getBundledRuntimePaths(): Promise<BundledRuntimePaths> {
  if (!sea.isSea()) {
    return {
      playwrightRunnerDir: fileSystemRuntimeAssetPath("playwright-runner"),
    };
  }

  const extractionRoot = path.join(
    getDataConnectHome(),
    "bundled-runtime-assets",
    "sea",
  );

  for (const assetKey of RUNTIME_ASSET_KEYS) {
    const relativePath = assetKey.replace(/^runtime-assets\//, "");
    const targetPath = path.join(extractionRoot, relativePath);
    if (fs.existsSync(targetPath)) {
      continue;
    }

    const raw = sea.getRawAsset(assetKey);
    if (!raw) {
      throw new Error(`Missing embedded SEA asset: ${assetKey}`);
    }

    await ensureParentDir(targetPath);
    await fsp.writeFile(targetPath, Buffer.from(raw));
  }

  return {
    playwrightRunnerDir: path.join(extractionRoot, "playwright-runner"),
  };
}

function fileSystemRuntimeAssetPath(relativePath: string): string {
  return fileURLToPath(
    new URL(`../../runtime-assets/${relativePath}`, import.meta.url),
  );
}
