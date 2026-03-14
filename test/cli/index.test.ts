import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockListAvailableSources = vi.fn();
const mockDetectPersonalServerTarget = vi.fn();
const mockIngestResult = vi.fn();
const mockReadCliState = vi.fn();
const mockUpdateSourceState = vi.fn();
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
        },
      },
    });
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        profile: { username: "tridengineer" },
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
      data: {
        profile: { username: "tridengineer" },
        repositories: [{ name: "vana-connect" }],
        exportSummary: { details: "1 repository" },
      },
    });
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
});
