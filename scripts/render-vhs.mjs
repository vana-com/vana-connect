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
const tapes = [
  "status-and-sources.tape",
  "data-inspection.tape",
  "connect-success.tape",
];

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

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
}
