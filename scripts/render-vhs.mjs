import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tapesDir = path.join(repoRoot, "docs", "vhs");
const fixtureHome = path.join(tapesDir, "fixtures", "demo-home");
const fixturesRoot = path.join(tapesDir, "fixtures");
const linuxSeaBinaryPath = path.join(
  repoRoot,
  "artifacts",
  "sea",
  "vana-linux-x64",
  "vana",
);
const VHS_DOCKER_IMAGE = "ghcr.io/charmbracelet/vhs:latest";
const tapes = [
  "status-and-sources.tape",
  "data-inspection.tape",
  "connect-success.tape",
];
const DEFAULT_TAPE_TIMEOUT_MS = 180_000;

function main() {
  prepareFixtures();
  const connectorsDir = resolveDataConnectorsDir();
  const { env, cleanup, tempRoot, binDir } = prepareRenderEnv(connectorsDir);
  env.VANA_DEMO_FAST_SUCCESS = "1";
  if (connectorsDir) {
    env.VANA_DATA_CONNECTORS_DIR = connectorsDir;
  }
  const runner = resolveRunner({ tempRoot, binDir, connectorsDir });
  try {
    for (const tape of tapes) {
      const tapePath = path.join(tapesDir, tape);
      const outputPath = tapePath.replace(/\.tape$/, ".gif");
      if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath, { force: true });
      }
      process.stdout.write(`[vhs] rendering ${tape}\n`);
      runTape(runner, tapePath, env);
      if (!fs.existsSync(outputPath)) {
        throw new Error(
          `VHS did not produce ${path.relative(repoRoot, outputPath)}.`,
        );
      }
      process.stdout.write(
        `[vhs] rendered ${path.relative(repoRoot, outputPath)}\n`,
      );
    }
  } finally {
    cleanup();
  }
}

function prepareFixtures() {
  execFileSync("node", ["./scripts/prepare-vhs-fixtures.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function resolveRunner({ tempRoot, binDir, connectorsDir }) {
  if (commandExists("vhs")) {
    return { command: "vhs", args: [] };
  }
  if (commandExists("docker")) {
    if (!fs.existsSync(linuxSeaBinaryPath)) {
      throw new Error(
        `Docker-based VHS rendering requires ${path.relative(
          repoRoot,
          linuxSeaBinaryPath,
        )}. Build it first with \`pnpm build:sea -- --artifact-name vana-linux-x64 --platform linux --arch x64 --archive-format tar.gz --binary-name vana\`.`,
      );
    }
    ensureDockerImage(VHS_DOCKER_IMAGE);

    const dockerEnvArgs = [
      "-e",
      `HOME=${fixtureHome}`,
      "-e",
      `PATH=${binDir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      ...(connectorsDir
        ? ["-e", `VANA_DATA_CONNECTORS_DIR=${connectorsDir}`]
        : []),
    ];
    return {
      command: "docker",
      args: [
        "run",
        "--rm",
        "-v",
        `${repoRoot}:${repoRoot}`,
        "-v",
        `${tempRoot}:${tempRoot}`,
        "-w",
        repoRoot,
        ...dockerEnvArgs,
        VHS_DOCKER_IMAGE,
      ],
    };
  }
  throw new Error(
    "VHS is not available. Install `vhs` or Docker to render demo tapes.",
  );
}

function runTape(runner, tapePath, env) {
  const timeout = resolveTapeTimeout();
  try {
    execFileSync(runner.command, [...runner.args, tapePath], {
      cwd: repoRoot,
      env,
      stdio: "inherit",
      timeout,
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(
        `VHS timed out after ${timeout}ms while rendering ${path.basename(tapePath)}.`,
      );
    }
    throw error;
  }
}

function prepareRenderEnv(connectorsDir) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vana-vhs-"));
  const binDir = path.join(tempRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const launcherPath = path.join(binDir, "vana");
  const launcherTarget = fs.existsSync(linuxSeaBinaryPath)
    ? linuxSeaBinaryPath
    : path.join(repoRoot, "dist", "cli", "bin.js");
  const launcherExec = fs.existsSync(linuxSeaBinaryPath)
    ? `exec "${launcherTarget}" "$@"`
    : `exec node "${launcherTarget}" "$@"`;
  fs.writeFileSync(
    launcherPath,
    `#!/usr/bin/env bash
set -euo pipefail
${launcherExec}
`,
    "utf8",
  );
  fs.chmodSync(launcherPath, 0o755);

  const env = {
    ...process.env,
    HOME: fixtureHome,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    ...(connectorsDir ? { VANA_DATA_CONNECTORS_DIR: connectorsDir } : {}),
  };

  return {
    env,
    tempRoot,
    binDir,
    cleanup() {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

function commandExists(command) {
  try {
    execFileSync("bash", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function ensureDockerImage(image) {
  try {
    execFileSync("docker", ["image", "inspect", image], {
      stdio: "ignore",
    });
  } catch {
    process.stdout.write(`[vhs] pulling ${image}\n`);
    execFileSync("docker", ["pull", image], {
      stdio: "inherit",
    });
  }
}

function resolveDataConnectorsDir() {
  const fixtureRepo = path.join(fixturesRoot, "demo-data-connectors");
  if (fs.existsSync(path.join(fixtureRepo, "registry.json"))) {
    return fixtureRepo;
  }

  if (process.env.VANA_DATA_CONNECTORS_DIR) {
    return process.env.VANA_DATA_CONNECTORS_DIR;
  }

  const siblingRepo = path.resolve(repoRoot, "..", "data-connectors");
  return fs.existsSync(siblingRepo) ? siblingRepo : null;
}

function resolveTapeTimeout() {
  const raw = process.env.VANA_VHS_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_TAPE_TIMEOUT_MS;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TAPE_TIMEOUT_MS;
}

function isTimeoutError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ETIMEDOUT" || error.signal === "SIGTERM")
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
}
