import { execFileSync } from "node:child_process";

const requiredPaths = [
  "dist/cli/bin.js",
  "dist/cli/index.js",
  "dist/runtime/managed-playwright.js",
];

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const raw = execFileSync(npmCommand, ["pack", "--json", "--dry-run"], {
  encoding: "utf8",
});

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
