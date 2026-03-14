import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturesRoot = path.join(repoRoot, "docs", "vhs", "fixtures");
const homeRoot = path.join(fixturesRoot, "demo-home");
const dataConnectRoot = path.join(homeRoot, ".dataconnect");

async function main() {
  await fs.rm(homeRoot, { recursive: true, force: true });

  await fs.mkdir(path.join(dataConnectRoot, "connectors", "github"), {
    recursive: true,
  });
  await fs.mkdir(path.join(dataConnectRoot, "connectors", "shop"), {
    recursive: true,
  });
  await fs.mkdir(path.join(dataConnectRoot, "connectors", "spotify"), {
    recursive: true,
  });
  await fs.mkdir(
    path.join(dataConnectRoot, "browsers", "chromium-1200", "chrome-linux64"),
    {
      recursive: true,
    },
  );
  await fs.mkdir(path.join(dataConnectRoot, "logs"), { recursive: true });

  await fs.writeFile(
    path.join(dataConnectRoot, "connectors", "github", "github-playwright.js"),
    "// demo fixture\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(dataConnectRoot, "connectors", "shop", "shop-playwright.js"),
    "// demo fixture\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(
      dataConnectRoot,
      "connectors",
      "spotify",
      "spotify-playwright.js",
    ),
    "// demo fixture\n",
    "utf8",
  );

  const browserPath = path.join(
    dataConnectRoot,
    "browsers",
    "chromium-1200",
    "chrome-linux64",
    "chrome",
  );
  await fs.writeFile(browserPath, "", "utf8");
  await fs.chmod(browserPath, 0o755);

  const state = {
    version: 1,
    sources: {
      github: {
        sessionPresent: true,
        lastRunAt: "2026-03-14T13:10:03.677Z",
        lastRunOutcome: "connected_local_only",
        dataState: "collected_local",
        lastResultPath: path.join(dataConnectRoot, "github-result.json"),
      },
      shop: {
        lastRunAt: "2026-03-14T13:11:10.000Z",
        lastRunOutcome: "legacy_auth",
        dataState: "none",
      },
      steam: {
        lastRunAt: "2026-03-14T13:12:00.000Z",
        lastRunOutcome: "connector_unavailable",
        dataState: "none",
        lastError: "No connector is available for steam right now.",
      },
      spotify: {
        lastRunAt: "2026-03-13T21:23:00.000Z",
        lastRunOutcome: "connected_local_only",
        dataState: "collected_local",
        lastResultPath: path.join(dataConnectRoot, "spotify-result.json"),
      },
    },
  };

  await fs.writeFile(
    path.join(dataConnectRoot, "vana-connect-state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );

  await fs.writeFile(
    path.join(dataConnectRoot, "github-result.json"),
    `${JSON.stringify(
      {
        profile: { username: "tnunamak" },
        repositories: [{ name: "vana-connect" }, { name: "data-connectors" }],
        starred: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(dataConnectRoot, "spotify-result.json"),
    `${JSON.stringify(
      {
        profile: { username: "tnunamak" },
        playlists: [{ name: "Data Portability" }, { name: "Build Flow" }],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.stdout.write(`Prepared VHS fixtures at ${homeRoot}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
