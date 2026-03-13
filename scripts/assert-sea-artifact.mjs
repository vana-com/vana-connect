import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fsp } from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

const artifactDir = path.resolve(requiredArg(args, "artifact-dir"));
const archivePath = path.resolve(requiredArg(args, "archive"));
const checksumPath = path.resolve(requiredArg(args, "checksum"));
const platform = requiredArg(args, "platform");
const binaryName = args.get("binary-name") ?? (platform === "win32" ? "vana.exe" : "vana");

await assertExists(artifactDir, `Artifact directory was not found: ${artifactDir}`);
await assertExists(archivePath, `Artifact archive was not found: ${archivePath}`);
await assertExists(checksumPath, `Artifact checksum file was not found: ${checksumPath}`);

const requiredDirectoryEntries = [
  binaryName,
  "app/sea-entry.cjs",
  "app/package.json",
  "app/dist/cli/bin.js",
  "app/dist/cli/main.js",
  "app/dist/runtime/managed-playwright.js",
];

for (const relativePath of requiredDirectoryEntries) {
  const candidate = path.join(artifactDir, relativePath);
  await assertExists(candidate, `SEA artifact directory is missing required file: ${candidate}`);
}

const archiveEntries = listArchiveEntries({ archivePath, platform });
for (const relativePath of requiredDirectoryEntries) {
  const expectedSuffix = `/${relativePath.replaceAll("\\", "/")}`;
  const hasEntry = archiveEntries.some(
    (entry) => entry === relativePath || entry.endsWith(expectedSuffix),
  );
  if (!hasEntry) {
    throw new Error(
      `SEA archive is missing required entry: ${relativePath}\nArchive: ${archivePath}`,
    );
  }
}

const expectedDigest = (await fsp.readFile(checksumPath, "utf8"))
  .trim()
  .split(/\s+/)[0];
if (!expectedDigest) {
  throw new Error(`Checksum file did not contain a digest: ${checksumPath}`);
}

const actualDigest = await sha256(archivePath);
if (expectedDigest !== actualDigest) {
  throw new Error(
    `SEA archive checksum mismatch for ${archivePath}\nExpected: ${expectedDigest}\nActual:   ${actualDigest}`,
  );
}

const archiveStat = await fsp.stat(archivePath);
if (archiveStat.size < 1024 * 100) {
  throw new Error(
    `SEA archive is unexpectedly small: ${archivePath} (${archiveStat.size} bytes)`,
  );
}

console.log(
  `SEA artifact validation passed for ${path.basename(archivePath)} with ${archiveEntries.length} archive entries.`,
);

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : "true";
    parsed.set(key, value);
    if (value !== "true") {
      index += 1;
    }
  }
  return parsed;
}

function requiredArg(argsMap, key) {
  const value = argsMap.get(key);
  if (!value || value === "true") {
    throw new Error(`Missing required argument: --${key}`);
  }
  return value;
}

async function assertExists(targetPath, message) {
  try {
    await fsp.access(targetPath);
  } catch {
    throw new Error(message);
  }
}

function listArchiveEntries({ archivePath, platform }) {
  if (platform === "win32") {
    const raw = execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::OpenRead('${escapePowerShellPath(archivePath)}').Entries | ForEach-Object { $_.FullName }`,
    ], {
      encoding: "utf8",
    });
    return raw
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  const raw = execFileSync("tar", ["-tzf", archivePath], {
    encoding: "utf8",
  });
  return raw
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function escapePowerShellPath(input) {
  return input.replace(/'/g, "''");
}

async function sha256(filePath) {
  const buffer = await fsp.readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}
