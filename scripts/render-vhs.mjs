import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tapesDir = path.join(repoRoot, "docs", "vhs");
const fixturesRoot = path.join(tapesDir, "fixtures");
const linuxSeaBinaryPath = path.join(
  repoRoot,
  "artifacts",
  "sea",
  "vana-linux-x64",
  "vana",
);
const VHS_DOCKER_IMAGE = "ghcr.io/charmbracelet/vhs:latest";
const DEFAULT_TAPE_TIMEOUT_MS = 180_000;

/**
 * Each tape entry specifies the tape file name and which environment it needs.
 *
 * Environment types:
 *   "seeded"       — fixture HOME with data, VANA_DEMO_FAST_SUCCESS=1
 *   "fresh"        — empty HOME (no prior state)
 *   "seeded-input" — fixture HOME with data, NO VANA_DEMO_FAST_SUCCESS
 */
const tapes = [
  { tape: "help.tape", env: "seeded" },
  { tape: "data-help.tape", env: "seeded" },
  { tape: "setup.tape", env: "seeded" },
  { tape: "status.tape", env: "seeded" },
  { tape: "doctor.tape", env: "seeded" },
  { tape: "logs.tape", env: "seeded" },
  { tape: "sources.tape", env: "seeded" },
  { tape: "sources-github.tape", env: "seeded" },
  { tape: "collect.tape", env: "seeded" },
  { tape: "collect-github.tape", env: "seeded" },
  { tape: "server-status.tape", env: "seeded" },
  { tape: "server-sync.tape", env: "seeded" },
  { tape: "server-data.tape", env: "seeded" },
  { tape: "data-list.tape", env: "seeded" },
  { tape: "data-list-empty.tape", env: "fresh" },
  { tape: "data-show-github.tape", env: "seeded" },
  { tape: "data-show-github-missing.tape", env: "fresh" },
  { tape: "data-path-github.tape", env: "seeded" },
  { tape: "connect-github-no-input.tape", env: "fresh" },
  {
    tape: "connect-github-session-reuse-no-input.tape",
    env: "seeded-input",
  },
  { tape: "connect-shop-no-input.tape", env: "seeded" },
  { tape: "connect-shop.tape", env: "seeded" },
  { tape: "connect-steam.tape", env: "seeded" },
  { tape: "connect-steam-no-input.tape", env: "seeded" },
  // Runs last — mutates fixture state by writing a new result file
  { tape: "connect-github-success.tape", env: "seeded", resetFixtures: true },
];

async function main() {
  prepareFixtures();
  const connectorsDir = resolveDataConnectorsDir();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vana-vhs-"));
  const binDir = path.join(tempRoot, "bin");
  prepareBinDir(binDir);

  // Create a fresh HOME for "fresh" env tapes
  const freshHome = path.join(tempRoot, "fresh-home");
  fs.mkdirSync(freshHome, { recursive: true });

  const fixtureHome = path.join(fixturesRoot, "demo-home");

  const basePath = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
  const baseEnvFields = {
    ...(connectorsDir ? { VANA_DATA_CONNECTORS_DIR: connectorsDir } : {}),
  };

  // Build the three environment variants
  const envs = {
    seeded: {
      ...process.env,
      HOME: fixtureHome,
      PATH: basePath,
      VANA_DEMO_FAST_SUCCESS: "1",
      ...baseEnvFields,
    },
    fresh: {
      ...process.env,
      HOME: freshHome,
      PATH: basePath,
      ...baseEnvFields,
    },
    "seeded-input": {
      ...process.env,
      HOME: fixtureHome,
      PATH: basePath,
      ...baseEnvFields,
    },
  };
  // Ensure VANA_DEMO_FAST_SUCCESS is NOT set for seeded-input
  delete envs["seeded-input"].VANA_DEMO_FAST_SUCCESS;

  const runner = resolveRunner({ tempRoot, binDir, connectorsDir });

  try {
    for (const entry of tapes) {
      if (entry.resetFixtures) {
        process.stdout.write(
          `[vhs] re-preparing fixtures before ${entry.tape}\n`,
        );
        prepareFixtures();
      }
      const tapePath = path.join(tapesDir, entry.tape);
      const outputPath = tapePath.replace(/\.tape$/, ".gif");
      if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath, { force: true });
      }
      const env = envs[entry.env];
      process.stdout.write(`[vhs] rendering ${entry.tape} (${entry.env})\n`);
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
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function prepareFixtures() {
  execFileSync("node", ["./scripts/prepare-vhs-fixtures.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function prepareBinDir(binDir) {
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
}

function resolveRunner({ tempRoot }) {
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
    return {
      command: "docker",
      isDocker: true,
      baseArgs: [
        "run",
        "--rm",
        // Run as the host user so VHS doesn't create root-owned files
        // in mounted volumes (fixture HOME, temp dir). Without this,
        // re-preparing fixtures fails with EACCES on .cache/ etc.
        "--user",
        `${process.getuid()}:${process.getgid()}`,
        "-v",
        `${repoRoot}:${repoRoot}`,
        "-v",
        `${tempRoot}:${tempRoot}`,
        "-w",
        repoRoot,
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
    if (runner.isDocker) {
      // Docker needs env vars passed explicitly via -e flags so VHS
      // inside the container sees HOME, PATH, and other overrides.
      const dockerEnvArgs = [];
      const forwardKeys = [
        "HOME",
        "PATH",
        "VANA_DEMO_FAST_SUCCESS",
        "VANA_DATA_CONNECTORS_DIR",
      ];
      for (const key of forwardKeys) {
        if (env[key] != null) {
          dockerEnvArgs.push("-e", `${key}=${env[key]}`);
        }
      }
      execFileSync(
        runner.command,
        [...runner.baseArgs, ...dockerEnvArgs, VHS_DOCKER_IMAGE, tapePath],
        { cwd: repoRoot, stdio: "inherit", timeout },
      );
    } else {
      execFileSync(runner.command, [...runner.args, tapePath], {
        cwd: repoRoot,
        env,
        stdio: "inherit",
        timeout,
      });
    }
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(
        `VHS timed out after ${timeout}ms while rendering ${path.basename(tapePath)}.`,
      );
    }
    throw error;
  }
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
