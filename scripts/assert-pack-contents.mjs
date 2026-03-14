import { spawnSync } from "node:child_process";

const requiredPaths = [
  "dist/cli/bin.js",
  "dist/cli/index.js",
  "dist/runtime/managed-playwright.js",
];

const raw = runNpmPackDryRun();

const manifest = JSON.parse(raw);
if (!Array.isArray(manifest) || manifest.length === 0) {
  throw new Error("npm pack --json --dry-run returned no manifest data.");
}

const [packResult] = manifest;
const files = Array.isArray(packResult.files) ? packResult.files : [];
const filePaths = new Set(files.map((file) => file.path));

for (const requiredPath of requiredPaths) {
  if (!filePaths.has(requiredPath)) {
    throw new Error(
      `Packed npm tarball is missing required file: ${requiredPath}`,
    );
  }
}

if (files.length < 20) {
  throw new Error(
    `Packed npm tarball unexpectedly small: ${files.length} files.`,
  );
}

console.log(
  `npm pack validation passed with ${files.length} files and required CLI/runtime entries present.`,
);

function runNpmPackDryRun() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["pack", "--json", "--dry-run"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `npm pack --json --dry-run failed with code ${result.status ?? "unknown"}\n${result.stderr ?? ""}`,
    );
  }

  return result.stdout;
}
