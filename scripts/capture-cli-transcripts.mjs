import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const transcriptsMd = path.join(repoRoot, "docs", "CLI-TRANSCRIPTS.md");
const fixturesRoot = path.join(repoRoot, "docs", "vhs", "fixtures");

async function main() {
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
    { marker: "help", argv: ["vana"], env: seededEnv },
    { marker: "data-help", argv: ["vana", "data"], env: seededEnv },
    { marker: "setup", argv: ["vana", "setup"], env: seededEnv },
    { marker: "status", argv: ["vana", "status"], env: seededEnv },
    { marker: "doctor", argv: ["vana", "doctor"], env: seededEnv },
    { marker: "logs", argv: ["vana", "logs"], env: seededEnv },
    { marker: "sources", argv: ["vana", "sources"], env: seededEnv },
    { marker: "data-list", argv: ["vana", "data", "list"], env: seededEnv },
    {
      marker: "data-list-empty",
      argv: ["vana", "data", "list"],
      env: freshEnv,
    },
    {
      marker: "data-show-github",
      argv: ["vana", "data", "show", "github"],
      env: seededEnv,
    },
    {
      marker: "data-show-github-missing",
      argv: ["vana", "data", "show", "github"],
      env: freshEnv,
      allowFailure: true,
    },
    {
      marker: "data-path-github",
      argv: ["vana", "data", "path", "github"],
      env: seededEnv,
    },
    {
      marker: "connect-github-success",
      argv: ["vana", "connect", "github"],
      env: seededEnv,
    },
    {
      marker: "connect-github-no-input",
      argv: ["vana", "connect", "github", "--no-input"],
      env: freshEnv,
      allowFailure: true,
    },
    {
      marker: "connect-github-session-reuse-no-input",
      argv: ["vana", "connect", "github", "--no-input"],
      env: seededInputEnv,
      allowFailure: true,
    },
    {
      marker: "connect-shop-no-input",
      argv: ["vana", "connect", "shop", "--no-input"],
      env: seededEnv,
      allowFailure: true,
    },
    {
      marker: "connect-shop",
      argv: ["vana", "connect", "shop"],
      env: seededEnv,
      allowFailure: true,
    },
    {
      marker: "connect-steam",
      argv: ["vana", "connect", "steam"],
      env: seededEnv,
      allowFailure: true,
    },
    {
      marker: "connect-steam-no-input",
      argv: ["vana", "connect", "steam", "--no-input"],
      env: seededEnv,
      allowFailure: true,
    },
  ];

  let mdContent = await fsp.readFile(transcriptsMd, "utf8");

  for (const command of commands) {
    const cmdLine = `$ ${command.argv.join(" ")}`;
    const output = normalizeTranscript(
      run(command.argv, command.env, command.allowFailure),
    );
    const block = `\`\`\`\n${cmdLine}\n\n${output.trimEnd()}\n\`\`\``;

    const beginTag = `<!-- BEGIN:${command.marker} -->`;
    const endTag = `<!-- END:${command.marker} -->`;
    const pattern = new RegExp(
      `${escapeRegex(beginTag)}[\\s\\S]*?${escapeRegex(endTag)}`,
    );

    if (!pattern.test(mdContent)) {
      process.stderr.write(
        `[transcript] WARNING: marker ${command.marker} not found in CLI-TRANSCRIPTS.md\n`,
      );
      continue;
    }

    mdContent = mdContent.replace(pattern, `${beginTag}\n${block}\n${endTag}`);
    process.stdout.write(`[transcript] updated ${command.marker}\n`);
  }

  await fsp.writeFile(transcriptsMd, mdContent, "utf8");
  process.stdout.write(
    `[transcript] wrote ${path.relative(repoRoot, transcriptsMd)}\n`,
  );

  await fsp.rm(tempRoot, { recursive: true, force: true });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
