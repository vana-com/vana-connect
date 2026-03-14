import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const transcriptsDir = path.join(repoRoot, "docs", "transcripts");
const fixtureHome = path.join(repoRoot, "docs", "vhs", "fixtures", "demo-home");
const connectorsDir = resolveDataConnectorsDir();

async function main() {
  prepareFixtures();
  await fsp.mkdir(transcriptsDir, { recursive: true });
  const tempRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), "vana-transcripts-"),
  );
  const workingHome = path.join(tempRoot, "home");
  await fsp.cp(fixtureHome, workingHome, { recursive: true });

  const env = {
    ...process.env,
    HOME: workingHome,
    ...(connectorsDir ? { VANA_DATA_CONNECTORS_DIR: connectorsDir } : {}),
  };

  const commands = [
    {
      name: "status.txt",
      argv: ["node", "dist/cli/bin.js", "status"],
    },
    {
      name: "sources.txt",
      argv: ["node", "dist/cli/bin.js", "sources"],
    },
    {
      name: "data-list.txt",
      argv: ["node", "dist/cli/bin.js", "data", "list"],
    },
    {
      name: "data-show-github.txt",
      argv: ["node", "dist/cli/bin.js", "data", "show", "github"],
    },
    {
      name: "connect-steam-no-input.txt",
      argv: ["node", "dist/cli/bin.js", "connect", "steam", "--no-input"],
      allowFailure: true,
    },
  ];

  for (const command of commands) {
    const output = run(command.argv, env, command.allowFailure);
    const filePath = path.join(transcriptsDir, command.name);
    await fsp.writeFile(filePath, output, "utf8");
    process.stdout.write(
      `[transcript] wrote ${path.relative(repoRoot, filePath)}\n`,
    );
  }

  await fsp.rm(tempRoot, { recursive: true, force: true });
}

function prepareFixtures() {
  execFileSync("node", ["./scripts/prepare-vhs-fixtures.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
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

function resolveDataConnectorsDir() {
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
