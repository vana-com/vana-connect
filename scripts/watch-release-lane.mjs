import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_REPO = "vana-com/vana-connect";
const DEFAULT_TAP_REPO = "vana-com/homebrew-vana";
const DEFAULT_TAP_WORKFLOW = "sync-formula.yml";
const DEFAULT_TAP_LOCAL_PATH = "/home/tnunamak/code/homebrew-vana";
const DEFAULT_POLL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 45 * 60_000;

function main() {
  const options = parseArgs(process.argv.slice(2));
  const branch = options.branch ?? getCurrentBranch(options.repo);
  const headSha = options.headSha ?? getCurrentHeadSha();
  const releaseTag = options.releaseTag ?? `canary-${slugify(branch)}`;

  log(`Watching release lane for ${branch} @ ${headSha.slice(0, 7)}`);

  if (!options.syncOnly) {
    waitForWorkflow({
      repo: options.repo,
      workflow: "CI",
      branch,
      headSha,
      pollMs: options.pollMs,
      timeoutMs: options.timeoutMs,
    });
    waitForWorkflow({
      repo: options.repo,
      workflow: "Canary Release",
      branch,
      headSha,
      pollMs: options.pollMs,
      timeoutMs: options.timeoutMs,
    });
  }

  if (options.skipTap) {
    log("Skipping tap sync.");
    return;
  }

  const previousTapRunId = getLatestRunId({
    repo: options.tapRepo,
    workflow: "Sync Formula",
  });

  log(`Triggering formula sync for ${releaseTag}`);
  execCommand("gh", [
    "workflow",
    "run",
    options.tapWorkflow,
    "--repo",
    options.tapRepo,
    "-f",
    `release_tag=${releaseTag}`,
  ]);

  const tapRun = waitForNewWorkflowRun({
    repo: options.tapRepo,
    workflow: "Sync Formula",
    previousRunId: previousTapRunId,
    pollMs: options.pollMs,
    timeoutMs: options.timeoutMs,
  });
  waitForRunCompletion({
    repo: options.tapRepo,
    runId: tapRun.databaseId,
    pollMs: options.pollMs,
    timeoutMs: options.timeoutMs,
  });

  if (fs.existsSync(options.tapLocalPath)) {
    log(`Refreshing local tap at ${options.tapLocalPath}`);
    execCommand("git", ["-C", options.tapLocalPath, "pull", "--ff-only"]);
    const formulaPath = path.join(options.tapLocalPath, "Formula", "vana.rb");
    if (fs.existsSync(formulaPath)) {
      const lines = fs
        .readFileSync(formulaPath, "utf8")
        .split("\n")
        .slice(0, 24);
      log(`Current tap formula preview:\n${lines.join("\n")}`);
    }
  }

  if (options.skipVerify) {
    log("Skipping published installer verification.");
    return;
  }

  log(`Running published installer verification for ${releaseTag}`);
  execCommand("sh", [
    "./scripts/test-install-github-release.sh",
    "--version",
    releaseTag,
    "--branch",
    branch,
    "--repo",
    options.repo,
  ]);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tapRepo: DEFAULT_TAP_REPO,
    tapWorkflow: DEFAULT_TAP_WORKFLOW,
    tapLocalPath: DEFAULT_TAP_LOCAL_PATH,
    pollMs: DEFAULT_POLL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    syncOnly: false,
    skipTap: false,
    skipVerify: false,
    branch: undefined,
    headSha: undefined,
    releaseTag: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--":
        break;
      case "--repo":
        options.repo = argv[++index];
        break;
      case "--branch":
        options.branch = argv[++index];
        break;
      case "--head-sha":
        options.headSha = argv[++index];
        break;
      case "--release-tag":
        options.releaseTag = argv[++index];
        break;
      case "--tap-repo":
        options.tapRepo = argv[++index];
        break;
      case "--tap-workflow":
        options.tapWorkflow = argv[++index];
        break;
      case "--tap-local-path":
        options.tapLocalPath = argv[++index];
        break;
      case "--poll-ms":
        options.pollMs = Number(argv[++index]);
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(argv[++index]);
        break;
      case "--sync-only":
        options.syncOnly = true;
        break;
      case "--skip-tap":
        options.skipTap = true;
        break;
      case "--skip-verify":
        options.skipVerify = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function waitForWorkflow({
  repo,
  workflow,
  branch,
  headSha,
  pollMs,
  timeoutMs,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const run = getWorkflowRun({ repo, workflow, branch, headSha });
    if (!run) {
      log(`Waiting for ${workflow} run for ${headSha.slice(0, 7)}...`);
      sleep(pollMs);
      continue;
    }

    if (run.status !== "completed") {
      log(`${workflow}: ${run.status} (${run.url})`);
      sleep(pollMs);
      continue;
    }

    if (run.conclusion !== "success") {
      throw new Error(`${workflow} failed: ${run.url}`);
    }

    log(`${workflow}: success`);
    return run;
  }

  throw new Error(`Timed out waiting for ${workflow}`);
}

function waitForNewWorkflowRun({
  repo,
  workflow,
  previousRunId,
  pollMs,
  timeoutMs,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const run = getLatestRun({ repo, workflow });
    if (run && (!previousRunId || run.databaseId > previousRunId)) {
      log(`Detected ${workflow} run ${run.databaseId}`);
      return run;
    }

    log(`Waiting for ${workflow} run to appear...`);
    sleep(pollMs);
  }

  throw new Error(`Timed out waiting for ${workflow} run`);
}

function waitForRunCompletion({ repo, runId, pollMs, timeoutMs }) {
  const startedAt = Date.now();
  let lastStatus = "unknown";
  while (Date.now() - startedAt < timeoutMs) {
    const workflowRun = JSON.parse(
      execCommand("gh", [
        "run",
        "view",
        String(runId),
        "--repo",
        repo,
        "--json",
        "status,conclusion,url",
      ]),
    );
    lastStatus = workflowRun.status;
    if (workflowRun.status !== "completed") {
      log(`Workflow run ${runId}: ${workflowRun.status} (${workflowRun.url})`);
      sleep(pollMs);
      continue;
    }

    if (workflowRun.conclusion !== "success") {
      throw new Error(`Workflow run ${runId} failed: ${workflowRun.url}`);
    }

    log(`Workflow run ${runId}: success`);
    return;
  }

  throw new Error(
    `Timed out waiting for workflow run ${runId} (last status: ${lastStatus}). Increase --timeout-ms if the workflow is healthy but slow.`,
  );
}

function getWorkflowRun({ repo, workflow, branch, headSha }) {
  const runs = JSON.parse(
    execCommand("gh", [
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      workflow,
      "--branch",
      branch,
      "--commit",
      headSha,
      "--limit",
      "1",
      "--json",
      "databaseId,workflowName,status,conclusion,headSha,url,displayTitle",
    ]),
  );
  return runs[0] ?? null;
}

function getLatestRun({ repo, workflow }) {
  const runs = JSON.parse(
    execCommand("gh", [
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      workflow,
      "--limit",
      "1",
      "--json",
      "databaseId,workflowName,status,conclusion,headSha,url,displayTitle",
    ]),
  );
  return runs[0] ?? null;
}

function getLatestRunId({ repo, workflow }) {
  return getLatestRun({ repo, workflow })?.databaseId ?? null;
}

function getCurrentBranch(repo) {
  const remote = execCommand("gh", ["repo", "view", repo, "--json", "name"], {
    allowFailure: true,
  });
  if (!remote) {
    return execCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  }
  return execCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
}

function getCurrentHeadSha() {
  return execCommand("git", ["rev-parse", "HEAD"]).trim();
}

function slugify(value) {
  return value.replace(/[/_]/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
}

function execCommand(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    if (options.allowFailure) {
      return "";
    }
    const stderr = error.stderr?.toString?.() ?? "";
    const stdout = error.stdout?.toString?.() ?? "";
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${stdout}${stderr}`.trim(),
    );
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function log(message) {
  process.stdout.write(`[release] ${message}\n`);
}

main();
