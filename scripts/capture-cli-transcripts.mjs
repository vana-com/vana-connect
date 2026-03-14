import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const transcriptsDir = path.join(repoRoot, "docs", "transcripts");
const fixturesRoot = path.join(repoRoot, "docs", "vhs", "fixtures");

async function main() {
  await fsp.mkdir(transcriptsDir, { recursive: true });
  const tempRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "vana-transcripts-"),
  );
  const workingHome = path.join(tempRoot, "home");
  const freshHome = path.join(tempRoot, "fresh-home");
  await prepareFixtures(workingHome);
  await fsp.mkdir(freshHome, { recursive: true });
  const connectorsDir = resolveDataConnectorsDir();
  const binDir = path.join(tempRoot, "bin");
  await prepareDemoBin(binDir);

  const seededEnv = {
    ...process.env,
    HOME: workingHome,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    VANA_DEMO_FAST_SUCCESS: "1",
    ...(connectorsDir ? { VANA_DATA_CONNECTORS_DIR: connectorsDir } : {}),
  };
  const freshEnv = {
    ...process.env,
    HOME: freshHome,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    ...(connectorsDir ? { VANA_DATA_CONNECTORS_DIR: connectorsDir } : {}),
  };
  const seededInputEnv = {
    ...seededEnv,
  };
  delete seededInputEnv.VANA_DEMO_FAST_SUCCESS;

  const commands = [
    {
      name: "status.txt",
      argv: ["vana", "status"],
      env: seededEnv,
    },
    {
      name: "doctor.txt",
      argv: ["vana", "doctor"],
      env: seededEnv,
    },
    {
      name: "setup.txt",
      argv: ["vana", "setup"],
      env: seededEnv,
    },
    {
      name: "sources.txt",
      argv: ["vana", "sources"],
      env: seededEnv,
    },
    {
      name: "data-list.txt",
      argv: ["vana", "data", "list"],
      env: seededEnv,
    },
    {
      name: "data-list-empty.txt",
      argv: ["vana", "data", "list"],
      env: freshEnv,
    },
    {
      name: "data-show-github.txt",
      argv: ["vana", "data", "show", "github"],
      env: seededEnv,
    },
    {
      name: "data-show-github-missing.txt",
      argv: ["vana", "data", "show", "github"],
      env: freshEnv,
      allowFailure: true,
    },
    {
      name: "data-path-github.txt",
      argv: ["vana", "data", "path", "github"],
      env: seededEnv,
    },
    {
      name: "connect-github-success.txt",
      argv: ["vana", "connect", "github"],
      env: seededEnv,
    },
    {
      name: "connect-github-no-input.txt",
      argv: ["vana", "connect", "github", "--no-input"],
      env: freshEnv,
      allowFailure: true,
    },
    {
      name: "connect-github-session-reuse-no-input.txt",
      argv: ["vana", "connect", "github", "--no-input"],
      env: seededInputEnv,
      allowFailure: true,
    },
    {
      name: "connect-shop-no-input.txt",
      argv: ["vana", "connect", "shop", "--no-input"],
      env: seededEnv,
      allowFailure: true,
    },
    {
      name: "connect-steam-no-input.txt",
      argv: ["vana", "connect", "steam", "--no-input"],
      env: seededEnv,
      allowFailure: true,
    },
  ];

  for (const command of commands) {
    const output = normalizeTranscript(
      run(command.argv, command.env, command.allowFailure),
    );
    const filePath = path.join(transcriptsDir, command.name);
    await fsp.writeFile(filePath, output, "utf8");
    process.stdout.write(
      `[transcript] wrote ${path.relative(repoRoot, filePath)}\n`,
    );
  }

  await fsp.rm(tempRoot, { recursive: true, force: true });
}

function prepareFixtures(homeRoot) {
  execFileSync("node", ["./scripts/prepare-vhs-fixtures.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(homeRoot ? { VANA_VHS_HOME_ROOT: homeRoot } : {}),
    },
    stdio: "inherit",
  });
}

async function prepareDemoBin(binDir) {
  await fsp.mkdir(binDir, { recursive: true });
  const launcherPath = path.join(binDir, "vana");
  const launcher = `#!/usr/bin/env bash
set -euo pipefail
exec node "${path.join(repoRoot, "dist", "cli", "bin.js")}" "$@"
`;
  await fsp.writeFile(launcherPath, launcher, "utf8");
  await fsp.chmod(launcherPath, 0o755);
}

function run(argv, env, allowFailure = false) {
  try {
    return execFileSync(argv[0], argv.slice(1), {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = error.stdout?.toString?.() ?? "";
    const stderr = error.stderr?.toString?.() ?? "";
    if (allowFailure) {
      return `${stdout}${stderr}`.trimEnd() + "\n";
    }
    throw new Error(`${stdout}${stderr}`.trim());
  }
}

function normalizeTranscript(output) {
  return output.replace(
    /(~\/\.dataconnect\/logs\/(?:run|fetch|setup)-[A-Za-z0-9_-]+)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.log/g,
    "$1-<timestamp>.log",
  );
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

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
