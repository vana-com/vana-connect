import { readdirSync, statSync } from "node:fs";
import path from "node:path";

function getArgMap(argv) {
  const args = new Map();

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }

  return args;
}

function listFiles(dir, predicate = () => true) {
  try {
    return readdirSync(dir)
      .map((name) => path.join(dir, name))
      .filter((filePath) => statSync(filePath).isFile())
      .filter(predicate)
      .sort();
  } catch {
    return [];
  }
}

const args = getArgMap(process.argv);
const releaseDir = args.get("release-dir") ?? "artifacts/release";
const packageManagersDir =
  args.get("package-managers-dir") ?? "artifacts/package-managers";
const demoPreviewDir = args.get("demo-preview-dir") ?? "artifacts/demo-preview";

const releaseFiles = listFiles(
  releaseDir,
  (filePath) =>
    filePath.endsWith(".tar.gz") ||
    filePath.endsWith(".zip") ||
    filePath.endsWith(".sha256"),
);
const packageManagerFiles = listFiles(path.join(packageManagersDir, "homebrew"))
  .concat(
    listFiles(path.join(packageManagersDir, "winget"), (filePath) =>
      filePath.endsWith(".yaml"),
    ),
  )
  .sort();
const demoPreviewFiles = [
  ...listFiles(
    path.join(demoPreviewDir, "docs", "transcripts"),
    (filePath) => filePath.endsWith(".txt") || filePath.endsWith(".md"),
  ),
  ...listFiles(
    path.join(demoPreviewDir, "transcripts"),
    (filePath) => filePath.endsWith(".txt") || filePath.endsWith(".md"),
  ),
  ...listFiles(
    path.join(demoPreviewDir, "docs", "vhs"),
    (filePath) => filePath.endsWith(".gif") || filePath.endsWith(".svg"),
  ),
  ...listFiles(
    path.join(demoPreviewDir, "vhs"),
    (filePath) => filePath.endsWith(".gif") || filePath.endsWith(".svg"),
  ),
].sort();

for (const file of releaseFiles.concat(packageManagerFiles, demoPreviewFiles)) {
  process.stdout.write(`${file}\n`);
}
