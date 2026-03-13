import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) {
    continue;
  }

  const key = arg.slice(2);
  const next = process.argv[index + 1];
  const value = next && !next.startsWith("--") ? next : "true";
  args.set(key, value);
  if (value !== "true") {
    index += 1;
  }
}

const artifactDir = path.join(repoRoot, "artifacts", "sea");
const scratchDir = path.join(repoRoot, ".sea-work", "build-sea");
const targetName = `vana-${process.platform}-${process.arch}`;
const outputPath = path.resolve(
  repoRoot,
  args.get("output") ?? path.join(artifactDir, targetName),
);
const tarballPath = `${outputPath}.tar.gz`;
const checksumPath = `${tarballPath}.sha256`;

const distCliMain = path.join(repoRoot, "dist", "cli", "main.js");
await assertExists(
  distCliMain,
  "dist/cli/main.js was not found. Run `pnpm build` first.",
);

await fsp.mkdir(artifactDir, { recursive: true });
await fsp.rm(scratchDir, { recursive: true, force: true });
await fsp.mkdir(scratchDir, { recursive: true });

const entryPath = path.join(scratchDir, "entry.mjs");
const bundlePath = path.join(scratchDir, "bundle.cjs");
const configPath = path.join(scratchDir, "sea-config.json");

await fsp.writeFile(
  entryPath,
  [
    "import { runCli } from '../../dist/cli/main.js';",
    "",
    "runCli(process.argv).catch((error) => {",
    "  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));",
    "  process.exitCode = 1;",
    "});",
    "",
  ].join("\n"),
  "utf8",
);

await build({
  entryPoints: [entryPath],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node25",
  outfile: bundlePath,
  logLevel: "silent",
});

const assetPaths = [
  "runtime-assets/run-connector.cjs",
  "runtime-assets/playwright-runner/index.cjs",
  "runtime-assets/playwright-runner/package.json",
  "runtime-assets/playwright-runner/package-lock.json",
  "runtime-assets/playwright-runner/entitlements.plist",
  "runtime-assets/playwright-runner/scripts/build.js",
];

const config = {
  main: bundlePath,
  output: outputPath,
  disableExperimentalSEAWarning: true,
  assets: Object.fromEntries(
    assetPaths.map((assetPath) => [assetPath, path.join(repoRoot, assetPath)]),
  ),
};

await fsp.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
await run(process.execPath, ["--build-sea", configPath], {
  cwd: repoRoot,
});

if (args.has("smoke")) {
  const smokeHome = path.join(scratchDir, "home");
  await fsp.rm(smokeHome, { recursive: true, force: true });
  await fsp.mkdir(smokeHome, { recursive: true });
  await run(outputPath, ["status", "--json"], {
    cwd: repoRoot,
    env: { ...process.env, HOME: smokeHome },
  });
}

await run(
  "tar",
  [
    "-czf",
    tarballPath,
    "-C",
    path.dirname(outputPath),
    path.basename(outputPath),
  ],
  {
    cwd: repoRoot,
  },
);

const tarballDigest = await sha256(tarballPath);
await fsp.writeFile(
  checksumPath,
  `${tarballDigest}  ${path.basename(tarballPath)}\n`,
  "utf8",
);

process.stdout.write(`Built SEA executable: ${outputPath}\n`);
process.stdout.write(`Built SEA tarball: ${tarballPath}\n`);
process.stdout.write(`Built SEA checksum: ${checksumPath}\n`);

async function assertExists(filePath, message) {
  try {
    await fsp.access(filePath);
  } catch {
    throw new Error(message);
  }
}

async function run(command, commandArgs, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function sha256(filePath) {
  const buffer = await fsp.readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}
