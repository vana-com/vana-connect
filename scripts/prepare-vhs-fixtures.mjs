import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturesRoot = path.join(repoRoot, "docs", "vhs", "fixtures");
const homeRoot = process.env.VANA_VHS_HOME_ROOT
  ? path.resolve(process.env.VANA_VHS_HOME_ROOT)
  : path.join(fixturesRoot, "demo-home");
const demoDataConnectorsRoot = path.join(fixturesRoot, "demo-data-connectors");
const dataConnectRoot = path.join(homeRoot, ".dataconnect");

async function main() {
  await fs.rm(homeRoot, { recursive: true, force: true });
  await fs.rm(demoDataConnectorsRoot, { recursive: true, force: true });

  await seedDemoHome();
  await seedDemoDataConnectors();

  process.stdout.write(
    `Prepared VHS fixtures at ${homeRoot} with demo connectors at ${demoDataConnectorsRoot}\n`,
  );
}

async function seedDemoHome() {
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
        lastResultPath: path.join(dataConnectRoot, "last-result.json"),
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
    path.join(dataConnectRoot, "last-result.json"),
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
}

async function seedDemoDataConnectors() {
  await fs.mkdir(
    path.join(demoDataConnectorsRoot, "skills", "vana-connect", "scripts"),
    { recursive: true },
  );
  await fs.mkdir(path.join(demoDataConnectorsRoot, "connectors", "github"), {
    recursive: true,
  });
  await fs.mkdir(path.join(demoDataConnectorsRoot, "connectors", "shop"), {
    recursive: true,
  });
  await fs.mkdir(path.join(demoDataConnectorsRoot, "connectors", "spotify"), {
    recursive: true,
  });

  await fs.writeFile(
    path.join(demoDataConnectorsRoot, "registry.json"),
    `${JSON.stringify(
      {
        connectors: [
          {
            id: "github",
            name: "GitHub",
            company: "github",
            description:
              "Exports your GitHub profile, repositories, and starred repositories using Playwright browser automation.",
            files: {
              script: "connectors/github/github-playwright.js",
            },
          },
          {
            id: "shop",
            name: "Shop",
            company: "shop",
            description:
              "Exports your Shop app order history using Playwright browser automation.",
            files: {
              script: "connectors/shop/shop-playwright.js",
            },
          },
          {
            id: "spotify",
            name: "Spotify",
            company: "spotify",
            description:
              "Exports your Spotify playlists using Playwright browser automation.",
            files: {
              script: "connectors/spotify/spotify-playwright.js",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await fs.writeFile(
    path.join(
      demoDataConnectorsRoot,
      "connectors",
      "github",
      "github-playwright.js",
    ),
    `const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await page.setData("status", "Checking GitHub login...");

  if (process.env.VANA_DEMO_FAST_SUCCESS !== "1") {
    await page.requestInput({
      message: "Log in to GitHub",
      schema: {
        type: "object",
        properties: {
          username: { type: "string" },
          password: { type: "string", format: "password" },
        },
      },
    });
  }

  await delay(120);
  await page.setData(
    "status",
    "Login confirmed. Collecting data in background...",
  );
  await page.setProgress({
    phase: { step: 1, total: 3, label: "Profile" },
    message: "Fetching profile...",
  });
  await delay(90);
  await page.setProgress({
    phase: { step: 2, total: 3, label: "Repositories" },
    message: "Fetched 2 repositories",
    count: 2,
  });
  await delay(90);
  await page.setProgress({
    phase: { step: 3, total: 3, label: "Starred" },
    message: "Fetched 0 starred repositories",
    count: 0,
  });
  await delay(90);

  return {
    profile: { username: "tnunamak" },
    repositories: [{ name: "vana-connect" }, { name: "data-connectors" }],
    starred: [],
    exportSummary: {
      count: 2,
      label: "items",
      details: "2 repositories, 0 starred",
    },
  };
})();
`,
    "utf8",
  );

  await fs.writeFile(
    path.join(
      demoDataConnectorsRoot,
      "connectors",
      "shop",
      "shop-playwright.js",
    ),
    `(async () => {
  await page.showBrowser("https://shop.app/account/order-history");
  await page.promptUser(
    "Finish signing in to Shop in the browser window.",
    async () => false,
    1,
  );
})();
`,
    "utf8",
  );

  await fs.writeFile(
    path.join(
      demoDataConnectorsRoot,
      "connectors",
      "spotify",
      "spotify-playwright.js",
    ),
    `(async () => {
  await page.requestInput({
    message: "Connect Spotify",
    schema: {
      type: "object",
      properties: {
        email: { type: "string" },
      },
    },
  });

  return {
    profile: { username: "tnunamak" },
    playlists: [{ name: "Data Portability" }, { name: "Build Flow" }],
  };
})();
`,
    "utf8",
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
