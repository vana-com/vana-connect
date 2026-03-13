import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const platform = args.get("platform") ?? process.platform;
const arch = args.get("arch") ?? process.arch;
const binaryName =
  args.get("binary-name") ?? (platform === "win32" ? "vana.exe" : "vana");
const targetName = args.get("artifact-name") ?? `vana-${platform}-${arch}`;
const archiveFormat =
  args.get("archive-format") ?? (platform === "win32" ? "zip" : "tar.gz");
const targetDir = path.join(artifactDir, targetName);
const outputPath = path.resolve(
  repoRoot,
  args.get("output") ?? path.join(targetDir, binaryName),
);
const archivePath = path.join(artifactDir, `${targetName}.${archiveFormat}`);
const checksumPath = `${archivePath}.sha256`;
const appPayloadPath = path.join(path.dirname(outputPath), "app");

const distCliMain = path.join(repoRoot, "dist", "cli", "main.js");
await assertExists(
  distCliMain,
  "dist/cli/main.js was not found. Run `pnpm build` first.",
);

await fsp.mkdir(artifactDir, { recursive: true });
await removePath(scratchDir);
await fsp.mkdir(scratchDir, { recursive: true });
await removePath(path.dirname(outputPath));
await fsp.mkdir(path.dirname(outputPath), { recursive: true });

const launcherPath = path.join(scratchDir, "launcher.cjs");
const configPath = path.join(scratchDir, "sea-config.json");
await writeLauncher(launcherPath);
await buildLauncher(outputPath, launcherPath, configPath);
await stageAppPayload(appPayloadPath);

if (args.has("smoke")) {
  const smokeHome = path.join(scratchDir, "home");
  await removePath(smokeHome);
  await fsp.mkdir(smokeHome, { recursive: true });
  await run(outputPath, ["status", "--json"], {
    cwd: repoRoot,
    env: { ...process.env, HOME: smokeHome },
  });
}

await createArchive({
  archiveFormat,
  archivePath,
  targetParentDir: path.dirname(path.dirname(outputPath)),
  targetName: path.basename(path.dirname(outputPath)),
});

const archiveDigest = await sha256(archivePath);
await fsp.writeFile(
  checksumPath,
  `${archiveDigest}  ${path.basename(archivePath)}\n`,
  "utf8",
);

process.stdout.write(`Built SEA launcher: ${outputPath}\n`);
process.stdout.write(`Built app payload: ${appPayloadPath}\n`);
process.stdout.write(`Built release archive: ${archivePath}\n`);
process.stdout.write(`Built release checksum: ${checksumPath}\n`);

async function buildLauncher(outputFile, mainFile, configFile) {
  const config = {
    main: mainFile,
    output: outputFile,
    disableExperimentalSEAWarning: true,
  };

  await fsp.writeFile(
    configFile,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
  await run(process.execPath, ["--build-sea", configFile], {
    cwd: repoRoot,
  });
}

async function writeLauncher(outputFile) {
  const launcher = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { createRequire } = require('node:module');",
    "",
    "(async () => {",
    "  const execPath = fs.realpathSync(process.execPath);",
    "  const appRoot = process.env.VANA_APP_ROOT || path.join(path.dirname(execPath), 'app');",
    "  const appEntryPath = path.join(appRoot, 'sea-entry.cjs');",
    "",
    "  if (!fs.existsSync(appEntryPath)) {",
    "    console.error(`Vana app payload was not found at ${appEntryPath}. Reinstall vana or repair the installation.`);",
    "    process.exitCode = 1;",
    "    return;",
    "  }",
    "",
    "  const appRequire = createRequire(appEntryPath);",
    "  const { runCli } = appRequire(appEntryPath);",
    "  const exitCode = await runCli(process.argv);",
    "  if (typeof exitCode === 'number') {",
    "    process.exitCode = exitCode;",
    "  }",
    "})().catch((error) => {",
    "  console.error(error instanceof Error ? (error.stack || error.message) : String(error));",
    "  process.exitCode = 1;",
    "});",
    "",
  ].join("\n");

  await fsp.writeFile(outputFile, launcher, "utf8");
}

async function stageAppPayload(outputDir) {
  await removePath(outputDir);
  await fsp.mkdir(outputDir, { recursive: true });

  await fsp.cp(path.join(repoRoot, "dist"), path.join(outputDir, "dist"), {
    recursive: true,
    force: true,
  });

  const rootPackage = JSON.parse(
    await fsp.readFile(path.join(repoRoot, "package.json"), "utf8"),
  );
  const appPackage = {
    name: "@opendatalabs/connect-app",
    private: true,
    type: "module",
    dependencies: rootPackage.dependencies,
  };
  await fsp.writeFile(
    path.join(outputDir, "package.json"),
    `${JSON.stringify(appPackage, null, 2)}\n`,
    "utf8",
  );

  await run(getNpmCommand(), ["install", "--omit=dev", "--ignore-scripts"], {
    cwd: outputDir,
    env: {
      ...process.env,
      HUSKY: "0",
      npm_config_fund: "false",
      npm_config_audit: "false",
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
    },
  });

  const appEntryPath = path.join(outputDir, "sea-entry.cjs");
  await fsp.writeFile(
    appEntryPath,
    [
      "const path = require('node:path');",
      "const { pathToFileURL } = require('node:url');",
      "",
      "exports.runCli = async function runCli(argv) {",
      "  const cliMainPath = path.join(__dirname, 'dist', 'cli', 'main.js');",
      "  const { runCli } = await import(pathToFileURL(cliMainPath).href);",
      "  return runCli(argv);",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function removePath(targetPath) {
  await fsp.rm(targetPath, { recursive: true, force: true });
}

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

async function createArchive({
  archiveFormat,
  archivePath,
  targetParentDir,
  targetName,
}) {
  if (archiveFormat === "tar.gz") {
    await run("tar", ["-czf", archivePath, "-C", targetParentDir, targetName], {
      cwd: repoRoot,
    });
    return;
  }

  if (archiveFormat === "zip") {
    await fsp.rm(archivePath, { force: true });
    await run(
      process.platform === "win32" ? "powershell" : "pwsh",
      [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${path.join(targetParentDir, targetName)}' -DestinationPath '${archivePath}' -Force`,
      ],
      {
        cwd: targetParentDir,
      },
    );
    return;
  }

  throw new Error(`Unsupported archive format: ${archiveFormat}`);
}
