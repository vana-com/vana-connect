import { execFileSync } from "node:child_process";

const REQUIRED_ASSETS = [
  "help.gif",
  "data-help.gif",
  "setup.gif",
  "status.gif",
  "doctor.gif",
  "logs.gif",
  "sources.gif",
  "data-list.gif",
  "data-list-empty.gif",
  "data-show-github.gif",
  "data-show-github-missing.gif",
  "data-path-github.gif",
  "connect-github-no-input.gif",
  "connect-github-session-reuse-no-input.gif",
  "connect-shop-no-input.gif",
  "connect-shop.gif",
  "connect-steam.gif",
  "connect-steam-no-input.gif",
  "connect-github-success.gif",
];

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

function main() {
  const args = getArgMap(process.argv);
  const repo = args.get("repo") ?? "vana-com/vana-connect";
  const tag = args.get("tag");

  if (!tag) {
    throw new Error("Missing required --tag argument.");
  }

  const output = execFileSync(
    "gh",
    [
      "release",
      "view",
      tag,
      "--repo",
      repo,
      "--json",
      "assets",
      "--jq",
      ".assets[].name",
    ],
    { encoding: "utf8" },
  );

  const assetNames = new Set(
    output
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const missing = REQUIRED_ASSETS.filter((name) => !assetNames.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Release ${tag} is missing demo assets: ${missing.join(", ")}`,
    );
  }

  process.stdout.write(
    `[release] Demo assets present for ${tag}: ${REQUIRED_ASSETS.join(", ")}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
