import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cliDataListSchema,
  cliDataPathSchema,
  cliDataShowSchema,
  cliDoctorSchema,
  cliEventSchema,
  datasetNotFoundErrorSchema,
  cliSourcesSchema,
  cliStatusSchema,
  sourceRequiredErrorSchema,
} from "../../src/core/cli-types.js";

const mockListAvailableSources = vi.fn();
const mockDetectPersonalServerTarget = vi.fn();
const mockIngestResult = vi.fn();
const mockReadCliState = vi.fn();
const mockUpdateSourceState = vi.fn();
const mockConfirm = vi.fn();
const mockInput = vi.fn();
const mockPassword = vi.fn();
const mockSelect = vi.fn();
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockExistsSync = vi.fn();

let runtimeState = "installed";
let fetchConnectorResult = {
  connectorPath: "/tmp/connectors/valve/steam-playwright.js",
  logPath: "/tmp/logs/fetch.log",
};
let runConnectorEvents: Array<Record<string, unknown>> = [];

vi.mock("../../src/runtime/index.js", () => ({
  findDataConnectorsDir: vi.fn(() => "/tmp/data-connectors"),
  ManagedPlaywrightRuntime: class {
    get state() {
      return runtimeState;
    }

    get runtimePath() {
      return runtimeState === "installed" ? "/tmp/playwright/chrome" : null;
    }

    async ensureInstalled() {
      runtimeState = "installed";
      return {
        runtime: "installed",
        runtimePath: "/tmp/playwright/chrome",
        logPath: "/tmp/logs/setup.log",
      };
    }

    async fetchConnector() {
      return fetchConnectorResult;
    }

    async *runConnector(options?: {
      noInput?: boolean;
      onNeedInput?: (payload: {
        message?: string;
        fields: string[];
      }) => Promise<Record<string, string>>;
    }) {
      for (const event of runConnectorEvents) {
        if (
          event.type === "needs-input" &&
          !options?.noInput &&
          options?.onNeedInput
        ) {
          await options.onNeedInput({
            message:
              typeof event.message === "string" ? event.message : undefined,
            fields: Array.isArray(event.fields)
              ? event.fields.filter(
                  (field): field is string => typeof field === "string",
                )
              : [],
          });
          continue;
        }
        yield event;
      }
    }
  },
}));

vi.mock("../../src/connectors/registry.js", () => ({
  listAvailableSources: mockListAvailableSources,
}));

vi.mock("@inquirer/prompts", () => ({
  Separator: class {
    type = "separator";
    separator: string;

    constructor(separator = "") {
      this.separator = separator;
    }
  },
  confirm: mockConfirm,
  input: mockInput,
  password: mockPassword,
  select: mockSelect,
}));

vi.mock("../../src/personal-server/index.js", () => ({
  detectPersonalServerTarget: mockDetectPersonalServerTarget,
  ingestResult: mockIngestResult,
}));

vi.mock("../../src/core/index.js", async () => {
  const actual = await vi.importActual<object>("../../src/core/index.js");
  return {
    ...actual,
    readCliState: mockReadCliState,
    updateSourceState: mockUpdateSourceState,
    getBrowserProfilesDir: vi.fn(() => "/tmp/browser-profiles"),
    getLastResultPath: vi.fn(() => "/tmp/.dataconnect/last-result.json"),
  };
});

vi.mock("node:fs", () => ({
  default: {
    existsSync: mockExistsSync,
  },
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: mockReaddir,
    readFile: mockReadFile,
  },
}));

describe("runCli", () => {
  let stdout = "";
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = "";
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write);

    mockListAvailableSources.mockReset();
    mockDetectPersonalServerTarget.mockReset();
    mockIngestResult.mockReset();
    mockReadCliState.mockReset();
    mockUpdateSourceState.mockReset();
    mockConfirm.mockReset();
    mockSelect.mockReset();
    mockReaddir.mockReset();
    mockReadFile.mockReset();
    mockExistsSync.mockReset();

    runtimeState = "installed";
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/valve/steam-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [];

    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "unavailable",
      url: null,
    });
    mockIngestResult.mockResolvedValue([
      { type: "ingest-skipped", reason: "personal_server_unavailable" },
    ]);
    mockReadCliState.mockResolvedValue({ version: 1, sources: {} });
    mockConfirm.mockResolvedValue(true);
    mockSelect.mockResolvedValue("github");
    mockReaddir.mockRejectedValue(new Error("missing"));
    mockReadFile.mockRejectedValue(new Error("missing"));
    mockExistsSync.mockReturnValue(false);
    process.exitCode = 0;
  });

  afterEach(() => {
    writeSpy.mockRestore();
    vi.clearAllMocks();
    vi.resetModules();
  });

  function normalizeRenderedTimestamps(output: string): string {
    return output.replace(/Updated: .+/g, "Updated: <timestamp>");
  }

  it("lists available sources in json mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub" },
      { id: "steam", name: "Steam" },
    ]);
    mockReaddir
      .mockResolvedValueOnce([
        {
          isDirectory: () => true,
          name: "github",
        },
      ])
      .mockResolvedValueOnce(["github-playwright.js"]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "sources", "--json"]);
    const parsed = cliSourcesSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toEqual({
      count: 2,
      recommendedSource: { id: "github", name: "GitHub", installed: true },
      summary: {
        readyCount: 2,
        manualCount: 0,
        installedCount: 1,
      },
      sources: [
        { id: "github", name: "GitHub", installed: true },
        { id: "steam", name: "Steam", installed: false },
      ],
    });
  });

  it("prints structured status output in json mode", async () => {
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        steam: {
          sessionPresent: true,
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
        },
      },
    });
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status", "--json"]);
    const parsed = cliStatusSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toMatchObject({
      cliVersion: "0.8.1",
      channel: "stable",
      installMethod: "development",
      runtime: "installed",
      runtimePath: "/tmp/playwright/chrome",
      personalServer: "available",
      personalServerUrl: "http://localhost:8080",
      nextSteps: expect.arrayContaining([
        "Inspect the latest dataset with `vana data show steam`.",
      ]),
      summary: {
        sourceCount: 1,
        needsAttentionCount: 0,
        connectedCount: 1,
        installedCount: 0,
        localCount: 1,
        syncedCount: 0,
        syncFailedCount: 0,
      },
      sources: [
        {
          source: "steam",
          installed: false,
          sessionPresent: true,
          dataState: "collected_local",
        },
      ],
    });
  });

  it("prints the CLI version with --version", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "--version"]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("0.8.1");
  });

  it("prints the CLI version with the version command", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "version"]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("0.8.1");
  });

  it("shows operational commands in top-level help", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("version");
    expect(stdout).toContain("doctor");
    expect(stdout).toContain(
      "connect [options] [source]  Connect a source and collect data",
    );
    expect(stdout).toContain("vana doctor");
    expect(stdout).toContain("vana connect github");
  });

  it("shows examples in connect help", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Connect a source and collect data");
    expect(stdout).toContain("vana connect");
    expect(stdout).toContain("vana connect github --json --no-input");
  });

  it("shows examples in data show help", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data", "show", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Show a collected dataset");
    expect(stdout).toContain("vana data show github");
    expect(stdout).toContain("vana data show github --json | jq '.summary'");
  });

  it("prints structured doctor output in json mode", async () => {
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
        },
      },
    });
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "unavailable",
      url: null,
    });
    mockExistsSync.mockImplementation((target: string) =>
      [
        "/tmp/playwright/chrome",
        "/tmp/browser-profiles",
        "/tmp/.dataconnect",
      ].includes(target),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "doctor", "--json"]);
    const parsed = cliDoctorSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toMatchObject({
      cliVersion: "0.8.1",
      channel: "stable",
      installMethod: "development",
      runtime: "installed",
      runtimePath: "/tmp/playwright/chrome",
      personalServer: "unavailable",
      paths: {
        executable: expect.any(String),
        appRoot: expect.any(String),
        dataHome: expect.stringMatching(/\.dataconnect$/),
        stateFile: expect.stringMatching(
          /\.dataconnect\/vana-connect-state\.json$/,
        ),
        connectorCache: expect.stringMatching(/\.dataconnect\/connectors$/),
        browserProfiles: "/tmp/browser-profiles",
        logs: expect.stringMatching(/\.dataconnect\/logs$/),
      },
      lifecycle: {
        upgrade: "git pull && pnpm install && pnpm build",
        uninstall:
          "Remove the local checkout and any generated ~/.dataconnect state.",
      },
      checks: expect.arrayContaining([
        expect.objectContaining({
          key: "cli",
          status: "ok",
        }),
        expect.objectContaining({
          key: "runtime",
          status: "ok",
        }),
      ]),
      nextSteps: expect.any(Array),
    });
  });

  it("renders lifecycle guidance in human doctor output", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "doctor"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Vana Connect doctor");
    expect(stdout).toContain("Install");
    expect(stdout).toContain("Paths");
    expect(stdout).toContain("Lifecycle");
    expect(stdout).toContain("git pull && pnpm install && pnpm build");
  });

  it("renders a stable human transcript for setup when already installed", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "setup"]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatchInlineSnapshot(`
      "Vana Connect setup

      → Runtime
      The local runtime is already installed.
        Browser:          /tmp/playwright/chrome

      → Next
        • Check overall status with \`vana status\`.
        • Connect GitHub with \`vana connect github\`.
      "
    `);
  });

  it("renders a stable human transcript for setup when installation runs", async () => {
    runtimeState = "missing";
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "setup", "--yes"]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatchInlineSnapshot(`
      "Vana Connect setup

      → Runtime
      ✓ Runtime ready.
        Setup log: /tmp/logs/setup.log

      → Next
        • Check overall status with \`vana status\`.
        • Connect GitHub with \`vana connect github\`.
      "
    `);
  });

  it("shows nuanced source details in human status output", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          sessionPresent: true,
          lastRunAt: "2026-03-14T13:10:03.677Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/.dataconnect/github-result.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Connected");
    expect(stdout).toContain("GitHub [interactive] [local]");
    expect(stdout).toContain("vana data show github");
    expect(stdout).toContain("/tmp/.dataconnect/github-result.json");
    expect(stdout).toContain("/tmp/playwright/chrome");
  });

  it("renders a stable human transcript for status", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
      {
        id: "shop",
        name: "Shop",
        authMode: "legacy",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          sessionPresent: true,
          lastRunAt: "2026-03-14T13:10:03.677Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/.dataconnect/github-result.json",
        },
        shop: {
          lastRunAt: "2026-03-14T13:11:10.000Z",
          lastRunOutcome: "legacy_auth",
          dataState: "none",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    expect(normalizeRenderedTimestamps(stdout)).toMatchInlineSnapshot(`
      "Vana Connect status

      need attention (1) • connected (1)

      → Environment
        Runtime:          installed
        Browser:          /tmp/playwright/chrome
        Personal Server:  unavailable

      → Needs attention (1)
      Shop [legacy] [manual step]
        Run \`vana connect shop\` without \`--no-input\` to complete the manual browser step.
        Updated: <timestamp>

      → Connected (1)
      GitHub [interactive] [local]
        Inspect the latest local dataset with \`vana data show github\`.
        Session:          Saved for faster reconnects.
        State:            Saved locally
        Updated: <timestamp>
        Path:             /tmp/.dataconnect/github-result.json

      → Next
        • Complete the manual browser step for Shop with \`vana connect shop\`.
        • Inspect the data you already collected with \`vana data show github\`.
      "
    `);
  });

  it("guides first run from status when the runtime is already installed", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {},
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Connect GitHub with `vana connect github`.");
  });

  it("guides first run from status when the runtime is missing", async () => {
    runtimeState = "missing";
    mockListAvailableSources.mockResolvedValue([]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {},
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Install the local runtime with `vana setup`.");
    expect(stdout).toContain("Inspect install health with `vana doctor`.");
  });

  it("fails cleanly in json mode when input is required", async () => {
    runConnectorEvents = [
      {
        type: "needs-input",
        source: "steam",
        message: "Steam needs credentials",
        fields: ["username", "password"],
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "connect",
      "steam",
      "--json",
      "--no-input",
    ]);

    const lines = stdout
      .trim()
      .split("\n")
      .map((line) => cliEventSchema.parse(JSON.parse(line)));

    expect(exitCode).toBe(1);
    expect(lines).toContainEqual(
      expect.objectContaining({
        type: "needs-input",
        source: "steam",
      }),
    );
    expect(lines).toContainEqual(
      expect.objectContaining({
        type: "outcome",
        status: "needs_input",
        source: "steam",
      }),
    );
  });

  it("shows a clear human message when input is required in no-input mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
        description: "Exports GitHub data.",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "needs-input",
        source: "github",
        message: "Log in to GitHub",
        fields: ["username", "password"],
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "connect",
      "github",
      "--no-input",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("→ Input required");
    expect(stdout).toContain(
      "GitHub needs additional input before it can connect.",
    );
    expect(stdout).toContain(
      "Because `--no-input` is enabled, Vana stopped before prompting in this terminal.",
    );
    expect(stdout).toContain("Run `vana connect github` without `--no-input`.");
  });

  it("prints a clean manual-step message for legacy connectors in no-input mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "shop",
        name: "Shop",
        authMode: "legacy",
        description: "Exports Shop data.",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/shop/shop-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "legacy-auth",
        source: "shop",
        message:
          "This source needs a manual browser step, but prompting is disabled in --no-input mode.",
        logPath: "/tmp/logs/run.log",
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "connect",
      "shop",
      "--no-input",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(
      "Shop still needs a manual browser step on this machine.",
    );
    expect(stdout).toContain(
      "Because `--no-input` is enabled, Vana stopped before opening that session.",
    );
    expect(stdout).toContain("Run `vana connect shop` without `--no-input`.");
    expect(stdout).toContain("Run log:");
    expect(stdout).toContain("/tmp/logs/run.log");
    expect(stdout).not.toContain("LegacyAuthError");
  });

  it("prints a human manual-step message for legacy connectors", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "shop",
        name: "Shop",
        authMode: "legacy",
        description: "Exports Shop data.",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/shop/shop-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "legacy-auth",
        source: "shop",
        message: "Shop requires a manual browser step",
        logPath: "/tmp/logs/run.log",
      },
    ];
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "darwin",
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "shop"]);

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain(
      "Shop still needs a manual browser step on this machine.",
    );
    expect(stdout).toContain(
      "Vana Connect could not continue this older connector flow automatically yet.",
    );
    expect(stdout).toContain(
      "Complete the browser step locally, then rerun `vana connect shop`.",
    );
    expect(stdout).not.toContain(
      "Because `--no-input` is enabled, Vana stopped before opening that session.",
    );
  });

  it("fails gracefully for legacy connectors without a local display server", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "shop",
        name: "Shop",
        authMode: "legacy",
        description: "Exports Shop data.",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/shop/shop-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    mockExistsSync.mockImplementation(
      (target: string) =>
        typeof target === "string" && target.includes("shop-playwright"),
    );
    const originalPlatform = process.platform;
    const originalDisplay = process.env.DISPLAY;
    const originalWayland = process.env.WAYLAND_DISPLAY;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "shop"]);

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
    if (originalDisplay) {
      process.env.DISPLAY = originalDisplay;
    }
    if (originalWayland) {
      process.env.WAYLAND_DISPLAY = originalWayland;
    }

    expect(exitCode).toBe(1);
    expect(stdout).toContain("→ Manual step required");
    expect(stdout).toContain(
      "no local display server is available. Run this command in a desktop session or use xvfb-run.",
    );
    expect(stdout).toContain("Run this command in a desktop session.");
    expect(stdout).toContain("xvfb-run -a vana connect shop");
  });

  it("shows collected data in json mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastResultPath: "/tmp/.dataconnect/github-result.json",
          lastRunAt: "2026-03-14T13:10:03.677Z",
          dataState: "collected_local",
        },
      },
    });
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        profile: { username: "tnunamak" },
        repositories: [{ name: "vana-connect" }],
        exportSummary: { details: "1 repository" },
      }),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "data",
      "show",
      "github",
      "--json",
    ]);
    const parsed = cliDataShowSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toEqual({
      source: "github",
      name: "GitHub",
      path: "/tmp/.dataconnect/github-result.json",
      summary: {
        lines: ["Profile: tnunamak", "Repositories: 1"],
      },
      lastRunAt: "2026-03-14T13:10:03.677Z",
      dataState: "collected_local",
      data: {
        profile: { username: "tnunamak" },
        repositories: [{ name: "vana-connect" }],
        exportSummary: { details: "1 repository" },
      },
    });
  });

  it("renders a stable human transcript for data show", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastRunAt: "2026-03-14T13:10:03.677Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/.dataconnect/github-result.json",
        },
      },
    });
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        profile: { username: "tnunamak" },
        repositories: [{ name: "vana-connect" }, { name: "data-connectors" }],
        starred: [],
      }),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data", "show", "github"]);

    expect(exitCode).toBe(0);
    expect(normalizeRenderedTimestamps(stdout)).toMatchInlineSnapshot(`
      "GitHub data

      → Summary
        • Profile: tnunamak
        • Repositories: 2
        • Starred: 0

        Path:             /tmp/.dataconnect/github-result.json
        Updated: <timestamp>
        State:            Saved locally

      → Next
        • Print the path with \`vana data path github\`.
        • Reconnect GitHub with \`vana connect github\`.
        • Connect another source with \`vana sources\`.
        • Check overall status with \`vana status\`.
      "
    `);
  });

  it("returns guided next steps when data show is missing in json mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {},
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "data",
      "show",
      "github",
      "--json",
    ]);
    const parsed = datasetNotFoundErrorSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(1);
    expect(parsed).toEqual({
      error: "dataset_not_found",
      source: "github",
      message:
        "No collected dataset found for GitHub. Run `vana connect github` first.",
      nextSteps: ["Run `vana connect github` to collect data."],
    });
  });

  it("shows guided next steps when data show is missing in human mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
      },
      {
        id: "spotify",
        name: "Spotify",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        spotify: {
          lastResultPath: "/tmp/.dataconnect/spotify-result.json",
          dataState: "collected_local",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data", "show", "github"]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(
      "No collected dataset found for GitHub. Run `vana connect github` first.",
    );
    expect(stdout).toContain("→ Next");
    expect(stdout).toContain("Collect data with `vana connect github`.");
    expect(stdout).toContain("Inspect other datasets with `vana data list`.");
  });

  it("renders a stable human transcript for data path", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastRunAt: "2026-03-14T13:10:03.677Z",
          dataState: "collected_local",
          lastResultPath: "/tmp/.dataconnect/github-result.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data", "path", "github"]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("/tmp/.dataconnect/github-result.json\n");
  });

  it("orders collected datasets by most recent run first", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "chatgpt", name: "ChatGPT", authMode: "legacy" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastResultPath: "/tmp/.dataconnect/github-result.json",
          lastRunAt: "2026-03-14T13:10:03.677Z",
          dataState: "collected_local",
        },
        chatgpt: {
          lastResultPath: "/tmp/.dataconnect/chatgpt-result.json",
          lastRunAt: "2026-03-14T12:10:03.677Z",
          dataState: "collected_local",
        },
      },
    });
    mockReadFile.mockImplementation(async (filePath: string) =>
      JSON.stringify({
        profile: {
          username: filePath.includes("github") ? "tnunamak" : "chatgpt",
        },
      }),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data", "list", "--json"]);
    const parsed = cliDataListSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toMatchObject({
      count: 2,
      latestDataset: {
        source: "github",
        name: "GitHub",
        authMode: "interactive",
        dataState: "collected_local",
      },
      summary: {
        localCount: 2,
        syncedCount: 0,
        syncFailedCount: 0,
      },
      datasets: [
        {
          source: "github",
          name: "GitHub",
          authMode: "interactive",
          dataState: "collected_local",
        },
        {
          source: "chatgpt",
          name: "ChatGPT",
          authMode: "legacy",
          dataState: "collected_local",
        },
      ],
    });
  });

  it("renders a stable human transcript for data list", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "spotify", name: "Spotify", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastResultPath: "/tmp/.dataconnect/github-result.json",
          lastRunAt: "2026-03-14T13:10:03.677Z",
          dataState: "collected_local",
        },
        spotify: {
          lastResultPath: "/tmp/.dataconnect/spotify-result.json",
          lastRunAt: "2026-03-13T16:23:00.000Z",
          dataState: "collected_local",
        },
      },
    });
    mockReadFile.mockImplementation(async (filePath: string) =>
      JSON.stringify(
        filePath.includes("github")
          ? {
              profile: { username: "tnunamak" },
              repositories: [
                { name: "vana-connect" },
                { name: "data-connect" },
              ],
              starred: [],
            }
          : {
              profile: { username: "tnunamak" },
              playlists: [{ name: "Focus" }, { name: "Deep Work" }],
            },
      ),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data", "list"]);

    expect(exitCode).toBe(0);
    expect(normalizeRenderedTimestamps(stdout)).toMatchInlineSnapshot(`
      "Collected data (2)

      local dataset (2) • synced dataset (0)

      GitHub [local]
        Profile: tnunamak
        Repositories: 2
        Starred: 0
        State:            Saved locally
        Updated: <timestamp>
        Path:             /tmp/.dataconnect/github-result.json

      Spotify [local]
        Profile: tnunamak
        Playlists: 2
        State:            Saved locally
        Updated: <timestamp>
        Path:             /tmp/.dataconnect/spotify-result.json

      → Next
        • Inspect GitHub with \`vana data show github\`.
        • Or print its path with \`vana data path github\`.
        • Connect another source with \`vana sources\`.
      "
    `);
  });

  it("guides the first data collection from data list when nothing is collected", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {},
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data", "list"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("No local datasets collected yet.");
    expect(stdout).toContain("→ Next");
    expect(stdout).toContain(
      "Collect your first dataset with `vana connect github`.",
    );
    expect(stdout).toContain("Check overall status with `vana status`.");
  });

  it("shows collected data paths in json mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastResultPath: "/tmp/.dataconnect/github-result.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "data",
      "path",
      "github",
      "--json",
    ]);
    const parsed = cliDataPathSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toEqual({
      source: "github",
      name: "GitHub",
      path: "/tmp/.dataconnect/github-result.json",
      lastRunAt: null,
      dataState: null,
    });
  });

  it("returns a structured error when a collected dataset path is missing", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "data",
      "path",
      "github",
      "--json",
    ]);
    const parsed = datasetNotFoundErrorSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(1);
    expect(parsed).toEqual({
      error: "dataset_not_found",
      source: "github",
      name: "GitHub",
      message:
        "No collected dataset found for GitHub. Run `vana connect github` first.",
    });
  });

  it("prioritizes higher-maturity sources in human output", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "chatgpt",
        name: "ChatGPT",
        description: "Exports ChatGPT data.",
        authMode: "legacy",
      },
      {
        id: "github",
        name: "GitHub",
        description: "Exports GitHub data.",
        authMode: "interactive",
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "sources"]);

    expect(exitCode).toBe(0);
    const renderedLines = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) => line.startsWith("GitHub") || line.startsWith("ChatGPT"),
      );
    const githubIndex = renderedLines.findIndex((line) =>
      line.startsWith("GitHub"),
    );
    const chatgptIndex = renderedLines.findIndex((line) =>
      line.startsWith("ChatGPT"),
    );
    expect(githubIndex).toBeGreaterThanOrEqual(0);
    expect(chatgptIndex).toBeGreaterThanOrEqual(0);
    expect(githubIndex).toBeLessThan(chatgptIndex);
    expect(stdout).toContain("Ready now");
    expect(stdout).toContain("Manual steps");
  });

  it("renders a stable human transcript for sources", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        description: "Exports GitHub data.",
        authMode: "interactive",
      },
      {
        id: "spotify",
        name: "Spotify",
        description: "Exports Spotify data.",
        authMode: "interactive",
      },
      {
        id: "chatgpt",
        name: "ChatGPT",
        description: "Exports ChatGPT data.",
        authMode: "legacy",
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "sources"]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatchInlineSnapshot(`
      "Available sources (3)

      ready now (2) • with manual step (1)

      → Ready now (2)
      GitHub [interactive]
        Exports GitHub data.
        Flow: prompts in this terminal when the source needs input.
      Spotify [interactive]
        Exports Spotify data.
        Flow: prompts in this terminal when the source needs input.

      → Manual steps (1)
      ChatGPT [legacy]
        Exports ChatGPT data.
        Flow: finishes with a manual browser step on this machine.

      → Next
        • Start with GitHub using \`vana connect github\`.
        • Or browse the guided picker with \`vana connect\`.
      "
    `);
  });

  it("orders status output by what needs attention first", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "spotify", name: "Spotify", authMode: "legacy" },
      { id: "steam", name: "Steam" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastRunOutcome: "needs_input",
          lastError: "Log in to GitHub",
        },
        spotify: {
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/.dataconnect/spotify-result.json",
        },
        steam: {
          lastRunOutcome: "connector_unavailable",
          lastError: "No connector is available for steam right now.",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    const githubIndex = stdout.indexOf("GitHub [interactive] [needs input]");
    const steamIndex = stdout.indexOf("Steam [unavailable]");
    const spotifyIndex = stdout.indexOf("Spotify [legacy] [local]");
    expect(githubIndex).toBeGreaterThanOrEqual(0);
    expect(steamIndex).toBeGreaterThanOrEqual(0);
    expect(spotifyIndex).toBeGreaterThanOrEqual(0);
    expect(githubIndex).toBeLessThan(steamIndex);
    expect(steamIndex).toBeLessThan(spotifyIndex);
  });

  it("suggests reviewing collected data when multiple sources are already connected", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "spotify", name: "Spotify", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/.dataconnect/github-result.json",
        },
        spotify: {
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/.dataconnect/spotify-result.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "Review your collected data with `vana data list`.",
    );
    expect(stdout).toContain("Connect another source with `vana sources`.");
  });

  it("prints source_required in json mode when connect source is missing", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "--json"]);
    const parsed = sourceRequiredErrorSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(1);
    expect(parsed).toEqual({
      error: "source_required",
      message:
        "Specify a source. Start with `vana connect github`, or run `vana sources` to see available options.",
      suggestedSource: {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    });
  });

  it("fails cleanly when connect source is missing in a non-interactive shell", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    const originalStdoutTty = process.stdout.isTTY;
    const originalStdinTty = process.stdin.isTTY;
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect"]);

    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutTty,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinTty,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain(
      "Specify a source. Start with `vana connect github`, or run `vana sources` to see available options.",
    );
    expect(stdout).not.toContain("Choose a source to connect:");
  });

  it("groups guided connect choices by readiness", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "spotify", name: "Spotify", authMode: "interactive" },
      { id: "shop", name: "Shop", authMode: "legacy" },
    ]);
    mockSelect.mockResolvedValueOnce("github");

    const originalStdoutTty = process.stdout.isTTY;
    const originalStdinTty = process.stdin.isTTY;
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });

    const { runCli } = await import("../../src/cli/index.js");
    await runCli(["node", "vana", "connect"]);

    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutTty,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinTty,
    });

    const choices = mockSelect.mock.calls[0]?.[0]?.choices;
    expect(choices).toBeDefined();
    expect(choices[0]).toMatchObject({
      type: "separator",
      separator: "Ready now",
    });
    expect(choices[1]).toMatchObject({ value: "github" });
    expect(choices[2]).toMatchObject({ value: "spotify" });
    expect(choices[3]).toMatchObject({ type: "separator", separator: "" });
    expect(choices[4]).toMatchObject({
      type: "separator",
      separator: "Manual steps",
    });
    expect(choices[5]).toMatchObject({ value: "shop" });
  });

  it("prints a clear message when the guided source picker is cancelled", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    const promptError = new Error("prompt aborted");
    promptError.name = "ExitPromptError";
    mockSelect.mockRejectedValueOnce(promptError);
    const originalStdoutTty = process.stdout.isTTY;
    const originalStdinTty = process.stdin.isTTY;
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect"]);

    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutTty,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinTty,
    });

    expect(exitCode).toBe(1);
    expect(mockSelect).toHaveBeenCalled();
    expect(stdout).toContain("1 ready source");
    expect(stdout).toContain("vana connect <source>");
    expect(stdout).toContain("Cancelled. No source was connected.");
    expect(stdout).toContain("vana sources");
  });

  it("renders a stable human transcript for guided connect cancellation", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        description: "Exports GitHub data.",
        authMode: "interactive",
      },
      {
        id: "shop",
        name: "Shop",
        description: "Exports Shop data.",
        authMode: "legacy",
      },
    ]);
    const promptError = new Error("prompt aborted");
    promptError.name = "ExitPromptError";
    mockSelect.mockRejectedValueOnce(promptError);
    const originalStdoutTty = process.stdout.isTTY;
    const originalStdinTty = process.stdin.isTTY;
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect"]);

    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutTty,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinTty,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toMatchInlineSnapshot(`
      "Connect data

        1 ready source • 1 with manual step
      Choose a source to connect:
        Or jump straight in with \`vana connect <source>\`.
      Cancelled. No source was connected.
        Browse sources any time with \`vana sources\`.
      "
    `);
  });

  it("prints a clear message when runtime setup is declined", async () => {
    runtimeState = "missing";
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockConfirm.mockResolvedValueOnce(false);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    expect(exitCode).toBe(1);
    expect(mockConfirm).toHaveBeenCalledWith({
      message: "Install the local runtime now?",
      default: true,
    });
    expect(stdout).toContain("Cancelled. Runtime setup was not started.");
  });

  it("prints a human success summary after collection completes", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        description:
          "Exports your GitHub profile, repositories, and starred repositories using Playwright browser automation.",
        authMode: "interactive",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "status-update",
        source: "github",
        logPath: "/tmp/logs/run.log",
        message: "Checking GitHub login...",
      },
      {
        type: "progress-update",
        source: "github",
        logPath: "/tmp/logs/run.log",
        phase: { step: 2, total: 3, label: "Repositories" },
        message: "Fetching repositories...",
      },
      {
        type: "status-update",
        source: "github",
        logPath: "/tmp/logs/run.log",
        message: "Complete! 2 repositories and 0 starred repos collected.",
      },
      {
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/.dataconnect/github-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        profile: { username: "tnunamak" },
        repositories: [{ name: "vana-connect" }, { name: "data-connect" }],
        starred: [],
      }),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Connected GitHub.");
    expect(stdout).toContain(
      "Collected your GitHub data and saved it locally.",
    );
    expect(stdout).toContain("Collected");
    expect(stdout).toContain("Profile: tnunamak");
    expect(stdout).toContain("Repositories: 2");
    expect(stdout).toContain("Checking GitHub login...");
    expect(stdout).toContain("Repositories (2/3): Fetching repositories...");
    expect(stdout).not.toContain(
      "Complete! 2 repositories and 0 starred repos collected.",
    );
    expect(stdout).toContain("Saved locally");
    expect(stdout).toContain("/tmp/.dataconnect/github-result.json");
    expect(stdout).toContain("Session:");
    expect(stdout).toContain("Saved for faster reconnects.");
    expect(stdout).toContain("Server:");
    expect(stdout).toContain("Unavailable, so this run stayed local.");
    expect(stdout).toContain("Next");
    expect(stdout).toContain("vana data show github");
    expect(stdout).toContain("vana sources");
  });

  it("handles cancelled terminal input cleanly during connect", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "needs-input",
        source: "github",
        message: "Log in to GitHub",
        fields: ["username", "password"],
        logPath: "/tmp/logs/run.log",
      },
    ];
    const promptError = new Error("prompt aborted");
    promptError.name = "ExitPromptError";
    mockInput.mockRejectedValueOnce(promptError);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("→ Cancelled");
    expect(stdout).toContain(
      "Stopped before GitHub finished collecting your data.",
    );
    expect(stdout).toContain("No credentials were sent anywhere.");
    expect(stdout).toContain("Resume with `vana connect github`.");
    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "github",
      expect.objectContaining({
        lastRunOutcome: "needs_input",
        lastError: "Cancelled before input was completed.",
      }),
    );
  });

  it("records ingest failures as local data with sync failure state", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/.dataconnect/github-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    mockIngestResult.mockResolvedValue([
      {
        type: "ingest-failed",
        source: "github",
        target: "http://localhost:8080",
        message: "server exploded",
      },
    ]);
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        profile: { username: "tnunamak" },
      }),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Saved locally");
    expect(stdout).toContain("Server:");
    expect(stdout).toContain("Sync failed: server exploded");
    expect(mockUpdateSourceState).toHaveBeenLastCalledWith(
      "github",
      expect.objectContaining({
        lastRunOutcome: "ingest_failed",
        dataState: "ingest_failed",
        lastError: "server exploded",
      }),
    );
  });

  it("shows saved and synced details when Personal Server ingest succeeds", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/.dataconnect/github-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });
    mockIngestResult.mockResolvedValue([
      {
        type: "ingest-complete",
        source: "github",
        target: "http://localhost:8080",
      },
    ]);
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        profile: { username: "tnunamak" },
      }),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "Collected your GitHub data and synced it to your Personal Server.",
    );
    expect(stdout).toContain("Saved and synced");
    expect(stdout).toContain("/tmp/.dataconnect/github-result.json");
    expect(stdout).toContain("Saved for faster reconnects.");
    expect(stdout).toContain(
      "Your data is now available in your Personal Server.",
    );
    expect(mockUpdateSourceState).toHaveBeenLastCalledWith(
      "github",
      expect.objectContaining({
        lastRunOutcome: "connected_and_ingested",
        dataState: "ingested_personal_server",
      }),
    );
  });

  it("returns connector_unavailable when no connector exists", async () => {
    mockListAvailableSources.mockResolvedValue([]);
    fetchConnectorResult = undefined as never;
    const runtimeImport = await import("../../src/runtime/index.js");
    const fetchSpy = vi
      .spyOn(runtimeImport.ManagedPlaywrightRuntime.prototype, "fetchConnector")
      .mockRejectedValueOnce(
        new Error("No connector is available for Steam right now."),
      );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "connect",
      "steam",
      "--json",
    ]);

    fetchSpy.mockRestore();

    expect(exitCode).toBe(1);
    const lines = stdout
      .trim()
      .split("\n")
      .map((line) => cliEventSchema.parse(JSON.parse(line)));
    expect(lines).toContainEqual(
      expect.objectContaining({
        type: "outcome",
        status: "connector_unavailable",
        source: "steam",
        reason: "No connector is available for Steam right now.",
      }),
    );
  });

  it("shows next steps when no connector exists in human mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
      {
        id: "shop",
        name: "Shop",
        authMode: "legacy",
      },
    ]);
    fetchConnectorResult = undefined as never;
    const runtimeImport = await import("../../src/runtime/index.js");
    const fetchSpy = vi
      .spyOn(runtimeImport.ManagedPlaywrightRuntime.prototype, "fetchConnector")
      .mockRejectedValueOnce(
        new Error("No connector is available for steam right now."),
      );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "steam"]);

    fetchSpy.mockRestore();

    expect(exitCode).toBe(1);
    expect(stdout).toContain("No connector is available for Steam right now.");
    expect(stdout).toContain("→ Next");
    expect(stdout).toContain("Try GitHub with `vana connect github`.");
    expect(stdout).toContain("Browse available sources with `vana sources`.");
  });

  it("mentions reusable sessions when a browser profile exists", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "needs-input",
        source: "github",
        message: "Log in to GitHub",
        fields: ["username", "password"],
      },
    ];
    mockExistsSync.mockImplementation(
      (value) =>
        typeof value === "string" && value.includes("github-playwright"),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "connect",
      "github",
      "--no-input",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(
      "Found an existing GitHub session. Reusing it if it is still valid...",
    );
  });
});
