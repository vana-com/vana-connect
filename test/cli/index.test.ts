import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockListAvailableSources = vi.fn();
const mockDetectPersonalServerTarget = vi.fn();
const mockIngestResult = vi.fn();
const mockReadCliState = vi.fn();
const mockUpdateSourceState = vi.fn();
const mockConfirm = vi.fn();
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

    async *runConnector() {
      for (const event of runConnectorEvents) {
        yield event;
      }
    }
  },
}));

vi.mock("../../src/connectors/registry.js", () => ({
  listAvailableSources: mockListAvailableSources,
}));

vi.mock("@inquirer/prompts", () => ({
  confirm: mockConfirm,
  input: vi.fn(),
  password: vi.fn(),
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

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
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

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      runtime: "installed",
      runtimePath: "/tmp/playwright/chrome",
      personalServer: "available",
      personalServerUrl: "http://localhost:8080",
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

      → Environment
      Runtime: installed
        /tmp/playwright/chrome
      Personal Server: unavailable

      → Sources
      → Needs attention
      Shop [legacy] [manual step]
        Run \`vana connect shop\` without \`--no-input\` to complete the manual browser step.
        Updated: <timestamp>

      → Connected
      GitHub [interactive] [local]
        Inspect the latest local dataset with \`vana data show github\`.
        Updated: <timestamp>
        /tmp/.dataconnect/github-result.json
      "
    `);
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
      .map((line) => JSON.parse(line));

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

  it("shows collected data in json mode", async () => {
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

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      source: "github",
      path: "/tmp/.dataconnect/github-result.json",
      summary: {
        lines: ["Profile: tnunamak", "Repositories: 1", "1 repository"],
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

      • Profile: tnunamak
      • Repositories: 2
      • Starred: 0

      Path: /tmp/.dataconnect/github-result.json
      Updated: <timestamp>
      State: Saved locally

      → Next
      • Print the path with \`vana data path github\`.
      • Check overall status with \`vana status\`.
      "
    `);
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

    expect(exitCode).toBe(0);
    expect(
      JSON.parse(stdout).datasets.map(
        (item: { source: string }) => item.source,
      ),
    ).toEqual(["github", "chatgpt"]);
  });

  it("shows collected data paths in json mode", async () => {
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

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      source: "github",
      path: "/tmp/.dataconnect/github-result.json",
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

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout)).toEqual({
      error: "dataset_not_found",
      source: "github",
      message: "No collected dataset found for GitHub.",
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

  it("prints source_required in json mode when connect source is missing", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "--json"]);

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout)).toEqual({
      error: "source_required",
      message: "Specify a source. Run `vana sources` to see available options.",
    });
  });

  it("fails cleanly when connect source is missing in a non-interactive shell", async () => {
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
      "Specify a source. Run `vana sources` to see available options.",
    );
    expect(stdout).not.toContain("Choose a source to connect:");
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
    expect(stdout).toContain("Cancelled. No source was connected.");
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
        type: "progress-update",
        source: "github",
        logPath: "/tmp/logs/run.log",
        phase: { step: 2, total: 3, label: "Repositories" },
        message: "Fetching repositories...",
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
    expect(stdout).toContain("Repositories: Fetching repositories...");
    expect(stdout).toContain("Saved locally");
    expect(stdout).toContain("/tmp/.dataconnect/github-result.json");
    expect(stdout).toContain("Next");
    expect(stdout).toContain("vana data show github");
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
    expect(stdout).toContain("Personal Server sync failed: server exploded");
    expect(mockUpdateSourceState).toHaveBeenLastCalledWith(
      "github",
      expect.objectContaining({
        lastRunOutcome: "ingest_failed",
        dataState: "ingest_failed",
        lastError: "server exploded",
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
      .map((line) => JSON.parse(line));
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
    mockListAvailableSources.mockResolvedValue([]);
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
    expect(stdout).toContain("No connector is available for steam right now.");
    expect(stdout).toContain("→ Next");
    expect(stdout).toContain("Browse available sources with `vana sources`.");
    expect(stdout).toContain("Then connect one with `vana connect <source>`.");
    expect(stdout).toContain("vana connect <source>");
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
