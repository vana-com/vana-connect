import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) {
    continue;
  }

  const key = arg.slice(2);
  const next = process.argv[index + 1];
  const value = next && !next.startsWith("--") ? next : "true";
  args.set(key, value);
  if (value !== "true") {
    index += 1;
  }
}

const releaseTag = args.get("release-tag");
const packageVersion = args.get("package-version");
const releaseRepo = args.get("release-repo") ?? "vana-com/vana-connect";
const artifactsDir = path.resolve(
  repoRoot,
  args.get("artifacts-dir") ?? "artifacts/release",
);
const outputDir = path.resolve(
  repoRoot,
  args.get("output-dir") ?? "artifacts/package-managers",
);

if (!releaseTag || !packageVersion) {
  throw new Error(
    "--release-tag and --package-version are required to generate package-manager metadata.",
  );
}

await fsp.rm(outputDir, { recursive: true, force: true });
await fsp.mkdir(outputDir, { recursive: true });

const releaseBaseUrl = `https://github.com/${releaseRepo}/releases/download/${releaseTag}`;
const assets = await loadReleaseAssets(artifactsDir);

await generateHomebrewFormula({
  outputDir,
  releaseBaseUrl,
  packageVersion,
  assets,
});

await generateWingetManifest({
  outputDir,
  releaseBaseUrl,
  packageVersion,
  assets,
});

process.stdout.write(
  `Generated package-manager metadata in ${outputDir} for ${releaseTag} (${packageVersion})\n`,
);

async function loadReleaseAssets(baseDir) {
  const files = await fsp.readdir(baseDir);
  const assetMap = new Map();

  for (const file of files) {
    if (!file.endsWith(".sha256")) {
      continue;
    }

    const checksumFile = path.join(baseDir, file);
    const checksumContents = await fsp.readFile(checksumFile, "utf8");
    const [sha256, assetName] = checksumContents.trim().split(/\s+/);
    assetMap.set(assetName, { sha256 });
  }

  return {
    linuxX64: requireAsset(assetMap, "vana-linux-x64.tar.gz"),
    darwinX64: requireAsset(assetMap, "vana-darwin-x64.tar.gz"),
    darwinArm64: requireAsset(assetMap, "vana-darwin-arm64.tar.gz"),
    win32X64: requireAsset(assetMap, "vana-win32-x64.zip"),
  };
}

function requireAsset(assetMap, assetName) {
  const asset = assetMap.get(assetName);
  if (!asset) {
    throw new Error(`Missing checksum metadata for ${assetName}`);
  }

  return {
    name: assetName,
    sha256: asset.sha256,
  };
}

async function generateHomebrewFormula({
  outputDir,
  releaseBaseUrl,
  packageVersion,
  assets,
}) {
  const formulaDir = path.join(outputDir, "homebrew");
  await fsp.mkdir(formulaDir, { recursive: true });
  const formulaPath = path.join(formulaDir, "vana.rb");
  const formula = `class Vana < Formula
  desc "Vana Connect CLI"
  homepage "https://github.com/${releaseRepo}"
  version "${packageVersion}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "${releaseBaseUrl}/${assets.darwinArm64.name}"
      sha256 "${assets.darwinArm64.sha256}"
    else
      url "${releaseBaseUrl}/${assets.darwinX64.name}"
      sha256 "${assets.darwinX64.sha256}"
    end
  end

  on_linux do
    url "${releaseBaseUrl}/${assets.linuxX64.name}"
    sha256 "${assets.linuxX64.sha256}"
  end

  def install
    payload_root = Dir.children(buildpath)
      .reject { |entry| entry.start_with?(".") }
      .find { |entry| File.directory?(buildpath/entry) } || "."

    libexec.install Dir[(buildpath/payload_root/"*").to_s]
    (bin/"vana").write_env_script libexec/"vana", VANA_APP_ROOT: libexec/"app"
  end

  test do
    assert_match "runtime", shell_output("#{bin}/vana status --json")
  end
end
`;
  await fsp.writeFile(formulaPath, formula, "utf8");
}

async function generateWingetManifest({
  outputDir,
  releaseBaseUrl,
  packageVersion,
  assets,
}) {
  const packageIdentifier = "Vana.Connect";
  const manifestVersion = "1.10.0";
  const wingetDir = path.join(
    outputDir,
    "winget",
    packageIdentifier,
    packageVersion,
  );
  await fsp.mkdir(wingetDir, { recursive: true });

  const versionManifest = `PackageIdentifier: ${packageIdentifier}
PackageVersion: ${packageVersion}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${manifestVersion}
`;

  const defaultLocaleManifest = `PackageIdentifier: ${packageIdentifier}
PackageVersion: ${packageVersion}
PackageLocale: en-US
Publisher: Vana
PublisherUrl: https://vana.org
PublisherSupportUrl: https://github.com/${releaseRepo}/issues
PackageName: Vana Connect
PackageUrl: https://github.com/${releaseRepo}
License: MIT
LicenseUrl: https://github.com/${releaseRepo}/blob/main/LICENSE
ShortDescription: Install and run the Vana Connect CLI for data portability workflows.
Description: Vana Connect is a local-first CLI for connecting supported data sources, collecting exports, and syncing them to your Personal Server when available.
Tags:
  - cli
  - data-portability
  - vana
  - automation
ReleaseNotesUrl: https://github.com/${releaseRepo}/releases/tag/${releaseTag}
ManifestType: defaultLocale
ManifestVersion: ${manifestVersion}
`;

  const installerManifest = `PackageIdentifier: ${packageIdentifier}
PackageVersion: ${packageVersion}
InstallerType: zip
NestedInstallerType: portable
Commands:
  - vana
UpgradeBehavior: install
Installers:
  - Architecture: x64
    InstallerUrl: ${releaseBaseUrl}/${assets.win32X64.name}
    InstallerSha256: ${assets.win32X64.sha256}
    NestedInstallerFiles:
      - RelativeFilePath: vana-win32-x64/vana.exe
        PortableCommandAlias: vana
ManifestType: installer
ManifestVersion: ${manifestVersion}
`;

  await Promise.all([
    fsp.writeFile(
      path.join(wingetDir, `${packageIdentifier}.yaml`),
      versionManifest,
      "utf8",
    ),
    fsp.writeFile(
      path.join(wingetDir, `${packageIdentifier}.locale.en-US.yaml`),
      defaultLocaleManifest,
      "utf8",
    ),
    fsp.writeFile(
      path.join(wingetDir, `${packageIdentifier}.installer.yaml`),
      installerManifest,
      "utf8",
    ),
  ]);
}
