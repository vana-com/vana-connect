import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tapesDir = path.join(repoRoot, "docs", "vhs");
const connectorsDir = resolveDataConnectorsDir();
const fixtureHome = path.join(tapesDir, "fixtures", "demo-home");
const tapes = [
  "status-and-sources.tape",
  "data-inspection.tape",
  "connect-guided.tape",
];

function main() {
  prepareFixtures();
  const { env, cleanup } = prepareRenderEnv();

  const runner = resolveRunner();
  try {
    for (const tape of tapes) {
      const tapePath = path.join(tapesDir, tape);
      const outputPath = tapePath.replace(/\.tape$/, ".gif");
      if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath, { force: true });
      }
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

function resolveRunner() {
  if (commandExists("vhs")) {
    return { command: "vhs", args: [] };
  }
  if (commandExists("docker")) {
    const dockerEnvArgs = [
      "-e",
      `HOME=${fixtureHome}`,
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
        "-w",
        repoRoot,
        ...dockerEnvArgs,
        "ghcr.io/charmbracelet/vhs",
      ],
    };
  }
  throw new Error(
    "VHS is not available. Install `vhs` or Docker to render demo tapes.",
  );
}

function runTape(runner, tapePath, env) {
  execFileSync(runner.command, [...runner.args, tapePath], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
}

function prepareRenderEnv() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vana-vhs-"));
  const binDir = path.join(tempRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const launcherPath = path.join(binDir, "vana");
  fs.writeFileSync(
    launcherPath,
    `#!/usr/bin/env bash
set -euo pipefail
exec node "${path.join(repoRoot, "dist", "cli", "bin.js")}" "$@"
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

function resolveDataConnectorsDir() {
  if (process.env.VANA_DATA_CONNECTORS_DIR) {
    return process.env.VANA_DATA_CONNECTORS_DIR;
  }

  const siblingRepo = path.resolve(repoRoot, "..", "data-connectors");
  return fs.existsSync(siblingRepo) ? siblingRepo : null;
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
}
