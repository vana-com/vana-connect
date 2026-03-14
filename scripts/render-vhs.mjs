import fs from "node:fs";
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

  const runner = resolveRunner();
  for (const tape of tapes) {
    const tapePath = path.join(tapesDir, tape);
    const outputPath = tapePath.replace(/\.tape$/, ".svg");
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath, { force: true });
    }
    runTape(runner, tapePath);
    process.stdout.write(
      `[vhs] rendered ${path.relative(repoRoot, outputPath)}\n`,
    );
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
    return {
      command: "docker",
      args: [
        "run",
        "--rm",
        "-v",
        `${repoRoot}:${repoRoot}`,
        "-w",
        repoRoot,
        "-e",
        `HOME=${fixtureHome}`,
        "-e",
        `VANA_DATA_CONNECTORS_DIR=${connectorsDir}`,
        "ghcr.io/charmbracelet/vhs",
      ],
    };
  }
  throw new Error(
    "VHS is not available. Install `vhs` or Docker to render demo tapes.",
  );
}

function runTape(runner, tapePath) {
  const env = {
    ...process.env,
    HOME: fixtureHome,
    ...(connectorsDir ? { VANA_DATA_CONNECTORS_DIR: connectorsDir } : {}),
  };
  execFileSync(runner.command, [...runner.args, tapePath], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
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
