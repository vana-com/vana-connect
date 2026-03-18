import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const DEFAULT_RELEASE_REPO = "vana-com/vana-connect";
const DEFAULT_TAP_PATH = "/home/tnunamak/code/homebrew-vana/Formula/vana.rb";

function parseArgs(argv) {
  const options = {
    releaseRepo: DEFAULT_RELEASE_REPO,
    formulaPath: DEFAULT_TAP_PATH,
    releaseTag: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--release-repo":
        options.releaseRepo = argv[++index];
        break;
      case "--formula-path":
        options.formulaPath = argv[++index];
        break;
      case "--release-tag":
        options.releaseTag = argv[++index];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.releaseTag) {
    throw new Error("--release-tag is required");
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const formulaPath = path.resolve(options.formulaPath);
  const formula = await fs.readFile(formulaPath, "utf8");

  const assetChecksums = getReleaseAssetChecksums({
    releaseRepo: options.releaseRepo,
    releaseTag: options.releaseTag,
  });

  assertFormulaContains(
    formula,
    options.releaseTag,
    "vana-darwin-arm64.tar.gz",
    assetChecksums.get("vana-darwin-arm64.tar.gz"),
  );
  assertFormulaContains(
    formula,
    options.releaseTag,
    "vana-darwin-x64.tar.gz",
    assetChecksums.get("vana-darwin-x64.tar.gz"),
  );
  assertFormulaContains(
    formula,
    options.releaseTag,
    "vana-linux-x64.tar.gz",
    assetChecksums.get("vana-linux-x64.tar.gz"),
  );

  process.stdout.write(
    `Homebrew formula matches ${options.releaseRepo}@${options.releaseTag}\n`,
  );
}

function getReleaseAssetChecksums({ releaseRepo, releaseTag }) {
  const output = execFileSync(
    "gh",
    ["release", "view", releaseTag, "--repo", releaseRepo, "--json", "assets"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const release = JSON.parse(output);
  const checksums = new Map();
  for (const asset of release.assets ?? []) {
    if (!asset.name.endsWith(".sha256")) {
      continue;
    }

    const checksumText = execFileSync(
      "gh",
      [
        "release",
        "download",
        releaseTag,
        "--repo",
        releaseRepo,
        "--pattern",
        asset.name,
        "--output",
        "-",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
    const [sha256, assetName] = checksumText.split(/\s+/);
    checksums.set(assetName, sha256);
  }
  return checksums;
}

function assertFormulaContains(formula, releaseTag, assetName, expectedSha) {
  if (!expectedSha) {
    throw new Error(`Missing published checksum for ${assetName}`);
  }

  if (!formula.includes(`/releases/download/${releaseTag}/${assetName}`)) {
    throw new Error(
      `Formula does not reference ${assetName} from ${releaseTag}`,
    );
  }

  if (!formula.includes(`sha256 "${expectedSha}"`)) {
    throw new Error(`Formula checksum mismatch for ${assetName}`);
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
