import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cliDataListSchema,
  cliDataPathSchema,
  cliDataShowSchema,
  cliDoctorSchema,
  cliEventSchema,
  cliLogsSchema,
  cliVersionInfoSchema,
  datasetNotFoundErrorSchema,
  logNotFoundErrorSchema,
  cliSourcesSchema,
  sourceRequiredErrorSchema,
} from "../../src/core/cli-types.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../../package.json") as {
  version: string;
};

const mockListAvailableSources = vi.fn();
const mockDetectPersonalServerTarget = vi.fn();
const mockIngestResult = vi.fn();
const mockResolvePersonalServerAuthConfig = vi.fn();
const mockCreatePersonalServerClient = vi.fn();
const mockReadCliState = vi.fn();
const mockUpdateCliConfig = vi.fn();
const mockUpdateSourceState = vi.fn();
const mockConfirm = vi.fn();
const mockInput = vi.fn();
const mockPassword = vi.fn();
const mockSelect = vi.fn();
const mockSearchSelect = vi.fn();
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockExistsSync = vi.fn();

class ExitPromptError extends Error {
  name = "ExitPromptError";
}

let runtimeState = "installed";
let fetchConnectorResult = {
  connectorPath: "/tmp/connectors/valve/steam-playwright.js",
  logPath: "/tmp/logs/fetch.log",
};
let runConnectorEvents: Array<Record<string, unknown>> = [];
const mockRunSelfHostedLoginFlow = vi.fn();
const mockRunDeviceCodeFlow = vi.fn();
const mockSaveCredentials = vi.fn();

vi.mock("../../src/runtime/index.js", () => ({
  findDataConnectorsDir: vi.fn(() => "/tmp/data-connectors"),
  ManagedPlaywrightRuntime: class {
    get capabilities() {
      return {
        supportsHeaded: true,
        supportsManagedProfiles: true,
        supportsScreenshots: true,
      };
    }

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

const mockReadCachedConnectorMetadata = vi.fn();

vi.mock("../../src/connectors/registry.js", () => ({
  listAvailableSources: mockListAvailableSources,
  readCachedConnectorMetadata: mockReadCachedConnectorMetadata,
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

vi.mock("../../src/cli/search-select.js", () => ({
  searchSelect: mockSearchSelect,
}));

vi.mock("../../src/skills/index.js", () => ({
  listAvailableSkills: vi.fn().mockResolvedValue([]),
  installSkill: vi.fn().mockResolvedValue({
    installedPath: "/tmp/skills",
    installedPaths: ["/tmp/skills"],
  }),
  readInstalledSkills: vi.fn().mockResolvedValue([]),
  fetchSkillToCache: vi.fn(),
  getSkillsCacheDir: vi.fn(() => "/tmp/.vana/skills"),
  findSkillsDir: vi.fn(() => null),
  getClaudeSkillsDir: vi.fn(() => "/tmp/.claude/skills"),
  getAgentsSkillsDir: vi.fn(() => "/tmp/.agents/skills"),
  getSkillInstallDirs: vi.fn(() => ["/tmp/.agents/skills"]),
  isClaudeCodeInstalled: vi.fn(() => false),
}));

vi.mock("../../src/personal-server/index.js", () => ({
  detectPersonalServerTarget: mockDetectPersonalServerTarget,
  ingestResult: mockIngestResult,
  resolvePersonalServerAuthConfig: mockResolvePersonalServerAuthConfig,
}));

vi.mock("../../src/personal-server/client.js", () => ({
  createPersonalServerClient: mockCreatePersonalServerClient,
}));

vi.mock("../../src/core/index.js", async () => {
  const actual = await vi.importActual<object>("../../src/core/index.js");
  return {
    ...actual,
    readCliState: mockReadCliState,
    readCliConfig: vi.fn().mockResolvedValue({}),
    updateCliConfig: mockUpdateCliConfig,
    updateSourceState: mockUpdateSourceState,
    getBrowserProfilesDir: vi.fn(() => "/tmp/browser-profiles"),
    getSourceResultPath: vi.fn((s: string) => `/tmp/.vana/results/${s}.json`),
    rotateResult: vi.fn(),
  };
});

vi.mock("../../src/cli/auth.js", async () => {
  const actual = await vi.importActual<object>("../../src/cli/auth.js");
  return {
    ...actual,
    runDeviceCodeFlow: mockRunDeviceCodeFlow,
    runSelfHostedLoginFlow: mockRunSelfHostedLoginFlow,
    saveCredentials: mockSaveCredentials,
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
  let stderr = "";
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = "";
    stderr = "";
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write);

    mockListAvailableSources.mockReset();
    mockReadCachedConnectorMetadata.mockReset();
    mockReadCachedConnectorMetadata.mockResolvedValue(null);
    mockDetectPersonalServerTarget.mockReset();
    mockIngestResult.mockReset();
    mockReadCliState.mockReset();
    mockResolvePersonalServerAuthConfig.mockReset();
    mockCreatePersonalServerClient.mockReset();
    mockUpdateSourceState.mockReset();
    mockUpdateCliConfig.mockReset();
    mockUpdateCliConfig.mockResolvedValue(undefined);
    mockConfirm.mockReset();
    mockSelect.mockReset();
    mockSearchSelect.mockReset();
    mockInput.mockReset();
    mockPassword.mockReset();
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
    mockResolvePersonalServerAuthConfig.mockReturnValue(undefined);
    mockCreatePersonalServerClient.mockReturnValue({
      listScopes: vi.fn().mockResolvedValue([]),
    });
    mockReadCliState.mockResolvedValue({ version: 1, sources: {} });
    mockConfirm.mockResolvedValue(true);
    mockSelect.mockResolvedValue("github");
    mockSearchSelect.mockResolvedValue("github");
    mockInput.mockResolvedValue("testuser");
    mockPassword.mockResolvedValue("testpass");
    mockReaddir.mockRejectedValue(new Error("missing"));
    mockReadFile.mockRejectedValue(new Error("missing"));
    mockExistsSync.mockReturnValue(false);
    mockRunDeviceCodeFlow.mockReset();
    mockRunSelfHostedLoginFlow.mockReset();
    mockSaveCredentials.mockReset();
    mockSaveCredentials.mockResolvedValue(undefined);
    process.exitCode = 0;
  });

  afterEach(() => {
    writeSpy.mockRestore();
    stderrSpy.mockRestore();
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
      recommendedSource: {
        id: "github",
        name: "GitHub",
        installed: false,
        dataState: "none",
        lastRunOutcome: null,
        sessionPresent: false,
      },
      nextSteps: [
        "Connect GitHub with `vana connect github`.",
        "Or browse the guided picker with `vana connect`.",
      ],
      summary: {
        connectedCount: 0,
        readyCount: 2,
        manualCount: 0,
        installedCount: 0,
      },
      sources: [
        {
          id: "github",
          name: "GitHub",
          installed: false,
          dataState: "none",
          lastRunOutcome: null,
          sessionPresent: false,
        },
        {
          id: "steam",
          name: "Steam",
          installed: false,
          lastRunOutcome: null,
          sessionPresent: false,
        },
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
    const parsed = JSON.parse(stdout);

    expect(exitCode).toBe(0);
    expect(parsed).toMatchObject({
      runtime: "installed",
      personalServer: "available",
      personalServerUrl: "http://localhost:8080",
      sources: {
        connected: 1,
        needsAttention: 0,
      },
      next: expect.stringContaining("vana data show steam"),
    });
  });

  it("self-hosted login saves credentials and refreshes the active personal server URL", async () => {
    mockRunSelfHostedLoginFlow.mockResolvedValue({
      server: "http://localhost:8080",
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      session_token: "vana_ps_test_token",
      expires_at: "2026-04-22T19:25:14.420Z",
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "login",
      "--server",
      "http://localhost:8080",
    ]);

    expect(exitCode).toBe(0);
    expect(mockSaveCredentials).toHaveBeenCalledWith({
      account: {
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        session_token: "",
        expires_at: "2026-04-22T19:25:14.420Z",
      },
      personal_server: {
        url: "http://localhost:8080",
        session_token: "vana_ps_test_token",
        expires_at: "2026-04-22T19:25:14.420Z",
      },
    });
    expect(mockUpdateCliConfig).toHaveBeenCalledWith({
      personalServerUrl: "http://localhost:8080",
    });
  });

  it("renders self-hosted login as a flow transcript", async () => {
    mockRunSelfHostedLoginFlow.mockImplementation(
      async (_serverUrl: string, onLoginUrl: (url: string) => void) => {
        onLoginUrl("http://localhost:8080/auth/device/approve?session=abc");
        return {
          server: "http://localhost:8080",
          address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          session_token: "vana_ps_test_token",
          expires_at: "2026-04-22T19:25:14.420Z",
        };
      },
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "login",
      "--server",
      "http://localhost:8080",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Log in to http://localhost:8080");
    expect(stderr).toContain("Open this URL in your browser:");
    expect(stderr).toContain(
      "http://localhost:8080/auth/device/approve?session=abc",
    );
    expect(stderr).toContain("Logged in to http://localhost:8080");
    expect(stderr).toContain("Credentials saved to ~/.vana/auth.json");
    expect(stderr).not.toContain("!");
    expect(stderr).not.toContain("Logging in to http://localhost:8080...");
  });

  it("renders cloud login as a flow transcript", async () => {
    mockRunDeviceCodeFlow.mockImplementation(async (callbacks) => {
      callbacks.onCode(
        "ABCD-EFGH",
        "https://account.vana.org/auth/device/approve",
      );
      callbacks.onWaiting();
      const creds = {
        account: {
          address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          session_token: "vana_account_session",
          expires_at: "2026-04-22T19:25:14.420Z",
        },
        personal_server: {
          url: "https://0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266.myvana.app",
          session_token: "vana_ps_session",
          expires_at: "2026-04-22T19:25:14.420Z",
        },
      };
      await callbacks.onAuthorized(creds);
      return creds;
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "login"]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Log in to Vana");
    expect(stderr).toContain("Open this URL in your browser:");
    expect(stderr).toContain("https://account.vana.org/auth/device/approve");
    expect(stderr).toContain("Enter this code:");
    expect(stderr).toContain("ABCD-EFGH");
    expect(stderr).toContain("Logged in as 0xf39F...266");
    expect(stderr).toContain("Personal Server:");
    expect(stderr).toContain("Credentials saved to ~/.vana/auth.json");
    expect(stderr).not.toContain("!");
    expect(stderr).not.toContain("Logging in to Vana...");
  });

  it("prints the CLI version with --version", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "--version"]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(PKG_VERSION);
  });

  it("prints the CLI version with the version command", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "version"]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`${PKG_VERSION} (stable, development checkout)`);
  });

  it("prints structured version info in json mode", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "version", "--json"]);
    const parsed = cliVersionInfoSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toEqual({
      cliVersion: PKG_VERSION,
      channel: "stable",
      installMethod: "development",
    });
  });

  it("detects installer metadata from VANA_APP_ROOT in json mode", async () => {
    const originalAppRoot = process.env.VANA_APP_ROOT;
    process.env.VANA_APP_ROOT = "/tmp/vana/current/app";

    try {
      const { runCli } = await import("../../src/cli/index.js");
      const exitCode = await runCli(["node", "vana", "version", "--json"]);
      const parsed = cliVersionInfoSchema.parse(JSON.parse(stdout));

      expect(exitCode).toBe(0);
      expect(parsed).toEqual({
        cliVersion: PKG_VERSION,
        channel: "stable",
        installMethod: "installer",
      });
    } finally {
      if (originalAppRoot === undefined) {
        delete process.env.VANA_APP_ROOT;
      } else {
        process.env.VANA_APP_ROOT = originalAppRoot;
      }
    }
  });

  it("detects canary channel from installer release path in json mode", async () => {
    const originalAppRoot = process.env.VANA_APP_ROOT;
    process.env.VANA_APP_ROOT =
      "/tmp/vana/releases/canary-feat-connect-cli-v1/app";

    try {
      const { runCli } = await import("../../src/cli/index.js");
      const exitCode = await runCli(["node", "vana", "version", "--json"]);
      const parsed = cliVersionInfoSchema.parse(JSON.parse(stdout));

      expect(exitCode).toBe(0);
      expect(parsed).toEqual({
        cliVersion: PKG_VERSION,
        channel: "canary",
        installMethod: "installer",
      });
    } finally {
      if (originalAppRoot === undefined) {
        delete process.env.VANA_APP_ROOT;
      } else {
        process.env.VANA_APP_ROOT = originalAppRoot;
      }
    }
  });

  it("shows operational commands in top-level help", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "Connect sources, collect data, and inspect it locally.",
    );
    expect(stdout).toContain("version");
    expect(stdout).toContain("doctor");
    expect(stdout).toContain("vana logs");
    expect(stdout).toContain(
      "connect [options] [source]  Connect a source and collect data",
    );
    expect(stdout).toContain("Quick start:");
    expect(stdout).toContain("Data:");
    expect(stdout).toContain("Server:");
    expect(stdout).toContain("More:");
    expect(stdout).toContain("vana doctor");
    expect(stdout).toContain("vana data list");
    expect(stdout).toContain("vana data show <src>");
  });

  it("shows top-level help and exits successfully with no arguments", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "Connect sources, collect data, and inspect it locally.",
    );
    expect(stdout).toContain("Commands:");
    expect(stdout).toContain("vana status");
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

  it("shows data help and exits successfully with no subcommand", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "Inspect collected datasets, paths, and summaries",
    );
    expect(stdout).toContain("vana data list");
    expect(stdout).toContain("vana data show github");
  });

  it("prints structured doctor output in json mode", async () => {
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastRunAt: "2026-03-14T13:10:03.677Z",
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
        "/tmp/.vana",
      ].includes(target),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "doctor", "--json"]);
    const parsed = cliDoctorSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toMatchObject({
      cliVersion: PKG_VERSION,
      channel: "stable",
      installMethod: "development",
      runtime: "installed",
      runtimePath: "/tmp/playwright/chrome",
      personalServer: "unavailable",
      capabilities: {
        supportsHeaded: true,
        supportsManagedProfiles: true,
        supportsScreenshots: true,
      },
      paths: {
        executable: expect.any(String),
        appRoot: null,
        dataHome: expect.stringMatching(/\.vana$/),
        stateFile: expect.stringMatching(/\.vana\/vana-connect-state\.json$/),
        connectorCache: expect.stringMatching(/\.vana\/connectors$/),
        browserProfiles: "/tmp/browser-profiles",
        logs: expect.stringMatching(/\.vana\/logs$/),
      },
      lifecycle: {
        upgrade: "git pull && pnpm install && pnpm build",
        uninstall: "Remove the local checkout and any generated ~/.vana state.",
      },
      summary: {
        trackedSourceCount: 1,
        attentionCount: 0,
        connectedCount: 1,
      },
      recentSources: [
        expect.objectContaining({
          source: "github",
          dataState: "collected_local",
          lastRunOutcome: "connected_local_only",
        }),
      ],
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
    expect(stdout).toContain("Attention");
    expect(stdout).toContain("Connected");
    expect(stdout).toContain("git pull && pnpm install && pnpm build");
    expect(stdout).not.toContain("App root:");
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
      Runtime
      The local runtime is already installed.
        Browser:       /tmp/playwright/chrome

        Next: \`vana connect github\`
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
      Runtime
      ✓ Runtime ready.
        Setup log: /tmp/logs/setup.log

        Next: \`vana connect github\`
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
          lastResultPath: "/tmp/.vana/github-result.json",
        },
        shop: {
          lastRunAt: "2026-03-14T13:11:10.000Z",
          lastRunOutcome: "legacy_auth",
          dataState: "none",
          lastLogPath: "/tmp/.vana/logs/run-shop.log",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Runtime");
    expect(stdout).toContain("Sources");
    expect(stdout).toContain("connected");
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
          lastResultPath: "/tmp/.vana/github-result.json",
        },
        shop: {
          lastRunAt: "2026-03-14T13:11:10.000Z",
          lastRunOutcome: "legacy_auth",
          dataState: "none",
          lastLogPath: "/tmp/.vana/logs/run-shop.log",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    expect(normalizeRenderedTimestamps(stdout)).toMatchInlineSnapshot(`
      "Vana Connect

        Runtime:       installed
        Personal Server: not connected
        Account:       Not logged in
        Auth:          Run \`vana login\` to authenticate
        Sources:       1 healthy, 1 needs attention
        Pending sync:  1 dataset(s)

      Needs attention (1)
          Shop:        manual step
          ↳ Manual auth step required. Run \`vana connect shop\`.

      Healthy (1)
          GitHub:      local

        Next: \`vana connect shop\`
      "
    `);
  });

  it("hides raw sync payloads in human status output", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "chatgpt", name: "ChatGPT", authMode: "interactive" },
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "youtube", name: "YouTube", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        chatgpt: {
          lastRunOutcome: "needs_input",
          lastError: "ChatGPT needs login",
        },
        github: {
          lastRunOutcome: "connected_and_ingested",
          dataState: "ingested_personal_server",
          lastCollectedAt: "2026-03-23T16:00:00.000Z",
        },
        youtube: {
          lastRunOutcome: "connected_local_only",
          dataState: "ingest_failed",
          lastCollectedAt: "2026-03-23T16:05:00.000Z",
          ingestScopes: [
            {
              scope: "youtube.subscriptions",
              status: "failed",
              error:
                'HTTP 401: {"error":{"code":401,"errorCode":"MISSING_AUTH","message":"Missing authentication"}}',
            },
            {
              scope: "youtube.playlists",
              status: "failed",
              error:
                'HTTP 401: {"error":{"code":401,"errorCode":"MISSING_AUTH","message":"Missing authentication"}}',
            },
          ],
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Needs attention (2)");
    expect(stdout).toContain("Healthy (1)");
    expect(stdout).toContain(
      "Authentication required for 2 scopes. Run `vana connect youtube`.",
    );
    expect(stdout).not.toContain('HTTP 401: {"error"');
    expect(stdout).toContain("Next: `vana connect youtube`");
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
    expect(stdout).toContain("Next:");
    expect(stdout).toContain("vana connect github");
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
    // Compact status shows only the single most important next step
    expect(stdout).toContain("Next:");
    expect(stdout).toContain("vana setup");
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
    expect(stderr).toContain(
      "GitHub needs credentials. Run without --no-input to authenticate.",
    );
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
    expect(stderr).toContain("Manual step required for Shop.");
    expect(stderr).toContain(
      "Complete the browser step locally, then rerun vana connect shop.",
    );
    expect(stderr).not.toContain("LegacyAuthError");
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
    expect(stderr).toContain("Manual step required for Shop.");
    expect(stderr).toContain(
      "Complete the browser step locally, then rerun vana connect shop.",
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
    expect(stderr).toContain(
      "Shop requires a browser window, but no display is available.",
    );
    expect(stderr).toContain("Run this command in a desktop terminal.");
  });

  it("guides recovery for runtime errors during connect", async () => {
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
        type: "runtime-error",
        source: "github",
        message: "Browser navigation failed",
        logPath: "/tmp/logs/run.log",
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Problem connecting GitHub.");
    expect(stderr).toContain("Browser navigation failed");
    expect(stderr).toContain("Retry: vana connect github");
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
          lastResultPath: "/tmp/.vana/github-result.json",
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
      path: "/tmp/.vana/github-result.json",
      summary: {
        lines: [
          "Profile: tnunamak",
          "Repositories: 1",
          "Latest repos: vana-connect",
        ],
      },
      lastRunAt: "2026-03-14T13:10:03.677Z",
      dataState: "collected_local",
      nextSteps: [
        "Print the path with `vana data path github`.",
        "Reconnect GitHub with `vana connect github`.",
        "Connect another source with `vana sources`.",
      ],
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
          lastResultPath: "/tmp/.vana/github-result.json",
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

        Profile: tnunamak
        Repositories: 2
        Latest repos: vana-connect, data-connectors
        Starred: 0

        Path:          /tmp/.vana/github-result.json
        Updated: <timestamp>
        State:         Saved locally

        Next: \`vana connect github\`
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
          lastResultPath: "/tmp/.vana/spotify-result.json",
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
    expect(stdout).toContain("Next: `vana connect github`");
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
          lastResultPath: "/tmp/.vana/github-result.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "data", "path", "github"]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("/tmp/.vana/github-result.json\n");
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
          lastResultPath: "/tmp/.vana/github-result.json",
          lastRunAt: "2026-03-14T13:10:03.677Z",
          dataState: "collected_local",
        },
        chatgpt: {
          lastResultPath: "/tmp/.vana/chatgpt-result.json",
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
      nextSteps: [
        "Inspect GitHub with `vana data show github`.",
        "Or print its path with `vana data path github`.",
        "Connect another source with `vana sources`.",
      ],
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
          lastResultPath: "/tmp/.vana/github-result.json",
          lastRunAt: "2026-03-14T13:10:03.677Z",
          dataState: "collected_local",
        },
        spotify: {
          lastResultPath: "/tmp/.vana/spotify-result.json",
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

      Dataset (2) · Local only (2) · Synced (0)

      GitHub local
        Profile: tnunamak
        Repositories: 2
        Latest repos: vana-connect, data-connect
        Starred: 0
        State:         Saved locally
        Updated: <timestamp>
        Path:          /tmp/.vana/github-result.json

      Spotify local
        Profile: tnunamak
        Playlists: 2
        Playlists: Focus, Deep Work
        State:         Saved locally
        Updated: <timestamp>
        Path:          /tmp/.vana/spotify-result.json

        Next: \`vana data show github\`
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
    expect(stdout).toContain("No datasets yet.");
    expect(stdout).toContain("Next: `vana connect github`");
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
          lastResultPath: "/tmp/.vana/github-result.json",
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
      path: "/tmp/.vana/github-result.json",
      lastRunAt: null,
      dataState: null,
      nextSteps: [
        "Inspect the dataset with `vana data show github`.",
        "Reconnect GitHub with `vana connect github`.",
      ],
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

  it("lists stored run logs in json mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "shop", name: "Shop", authMode: "legacy" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastRunAt: "2026-03-14T13:10:03.677Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastLogPath: "/tmp/.vana/logs/run-github.log",
        },
        shop: {
          lastRunAt: "2026-03-14T13:11:10.000Z",
          lastRunOutcome: "legacy_auth",
          dataState: "none",
          lastLogPath: "/tmp/.vana/logs/run-shop.log",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "logs", "--json"]);
    const parsed = cliLogsSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed).toEqual({
      count: 2,
      latestLog: {
        source: "shop",
        name: "Shop",
        path: "/tmp/.vana/logs/run-shop.log",
        lastRunAt: "2026-03-14T13:11:10.000Z",
        lastRunOutcome: "legacy_auth",
        dataState: null,
      },
      nextSteps: [
        "Inspect the latest issue log with `vana logs shop`.",
        "Inspect a successful run with `vana logs github`.",
        "Check overall status with `vana status`.",
      ],
      summary: {
        attentionCount: 1,
        successfulCount: 1,
        localCount: 1,
        syncedCount: 0,
      },
      logs: [
        {
          source: "shop",
          name: "Shop",
          path: "/tmp/.vana/logs/run-shop.log",
          lastRunAt: "2026-03-14T13:11:10.000Z",
          lastRunOutcome: "legacy_auth",
          dataState: null,
        },
        {
          source: "github",
          name: "GitHub",
          path: "/tmp/.vana/logs/run-github.log",
          lastRunAt: "2026-03-14T13:10:03.677Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
        },
      ],
    });
  });

  it("returns a structured log-not-found error in json mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {},
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "logs", "github", "--json"]);
    const parsed = logNotFoundErrorSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(1);
    expect(parsed).toEqual({
      error: "log_not_found",
      source: "github",
      message: "No stored run log found for GitHub.",
      nextSteps: ["Run `vana connect github` to create a new log."],
    });
  });

  it("renders a stable human transcript for logs", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "shop", name: "Shop", authMode: "legacy" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          lastRunAt: "2026-03-14T13:10:03.677Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastLogPath: "/tmp/.vana/logs/run-github.log",
        },
        shop: {
          lastRunAt: "2026-03-14T13:11:10.000Z",
          lastRunOutcome: "legacy_auth",
          dataState: "none",
          lastLogPath: "/tmp/.vana/logs/run-shop.log",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "logs"]);

    expect(exitCode).toBe(0);
    expect(normalizeRenderedTimestamps(stdout)).toMatchInlineSnapshot(`
      "Run logs (2)

      Need attention (1) · Successful (1) · Local (1)

      Needs attention (1)
      Shop manual step
        Path:          /tmp/.vana/logs/run-shop.log
        Updated: <timestamp>

      Successful runs (1)
      GitHub local
        Path:          /tmp/.vana/logs/run-github.log
        Updated: <timestamp>

        Next: \`vana logs shop\`
      "
    `);
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
  });

  it("reports non-overlapping source summary counts in json mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
      {
        id: "spotify",
        name: "Spotify",
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
          dataState: "collected_local",
          lastRunOutcome: "connected_local_only",
          lastResultPath: "/tmp/.vana/github-result.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "sources", "--json"]);
    const parsed = cliSourcesSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed.summary).toEqual({
      connectedCount: 1,
      readyCount: 1,
      manualCount: 1,
      installedCount: 0,
    });
  });

  it("omits a recommended source when only already-connected sources remain", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
      },
      {
        id: "spotify",
        name: "Spotify",
        authMode: "interactive",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          dataState: "collected_local",
          lastRunOutcome: "connected_local_only",
          lastResultPath: "/tmp/.vana/github-result.json",
        },
        spotify: {
          dataState: "ingested_personal_server",
          lastRunOutcome: "connected_and_ingested",
          lastResultPath: "/tmp/.vana/spotify-result.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "sources", "--json"]);
    const parsed = cliSourcesSchema.parse(JSON.parse(stdout));

    expect(exitCode).toBe(0);
    expect(parsed.recommendedSource).toBeNull();
    expect(parsed.nextSteps).toEqual([
      "Inspect what you already collected with `vana data list`.",
      "Or browse the guided picker with `vana connect`.",
    ]);
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
      "Available sources

      GitHub recommended
        Your GitHub data.
      Spotify
        Your Spotify data.
      ChatGPT
        Your ChatGPT data.

        Next: \`vana connect github\`
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
          lastResultPath: "/tmp/.vana/spotify-result.json",
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
    expect(stdout).toContain("1 healthy");
    expect(stdout).toContain("2 need attention");
    expect(stdout).toContain("Next: `vana connect github`");
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
          lastResultPath: "/tmp/.vana/github-result.json",
        },
        spotify: {
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/.vana/spotify-result.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status"]);

    expect(exitCode).toBe(0);
    // Compact status shows only the single most important next step
    expect(stdout).toContain("Next:");
    expect(stdout).toContain("vana data list");
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
    mockSearchSelect.mockResolvedValueOnce("github");

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

    const callArgs = mockSearchSelect.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    const choices = callArgs.choices;
    expect(choices).toContainEqual(
      expect.objectContaining({ value: "github", name: "GitHub" }),
    );
    expect(choices).toContainEqual(
      expect.objectContaining({ value: "spotify", name: "Spotify" }),
    );
    expect(choices).toContainEqual(
      expect.objectContaining({
        value: "shop",
        name: "Shop",
        description: "browser login",
      }),
    );
  });

  it("puts connected sources first in guided connect choices", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
      { id: "spotify", name: "Spotify", authMode: "interactive" },
      { id: "shop", name: "Shop", authMode: "legacy" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          sessionPresent: true,
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/.vana/github-result.json",
        },
      },
    });
    mockSearchSelect.mockResolvedValueOnce("github");

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

    const callArgs = mockSearchSelect.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    const choices = callArgs.choices;
    // GitHub is connected so gets "connected" description
    expect(choices).toContainEqual(
      expect.objectContaining({
        value: "github",
        name: "GitHub",
        description: "connected",
      }),
    );
    expect(choices).toContainEqual(
      expect.objectContaining({ value: "spotify", name: "Spotify" }),
    );
    expect(choices).toContainEqual(
      expect.objectContaining({
        value: "shop",
        name: "Shop",
        description: "browser login",
      }),
    );
  });

  it("prints a clear message when the guided source picker is cancelled", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockSearchSelect.mockRejectedValueOnce(new ExitPromptError());
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
    expect(mockSearchSelect).toHaveBeenCalled();
    expect(stdout).toContain("Cancelled.");
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
    mockSearchSelect.mockRejectedValueOnce(new ExitPromptError());
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
    expect(stdout).toContain("Cancelled.");
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
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Continue?" }),
    );
    expect(stderr).toContain("Cancelled.");
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
        resultPath: "/tmp/.vana/github-result.json",
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
    expect(stderr).toContain("Connected GitHub.");
    expect(stderr).toContain(
      "Collected your GitHub data. Personal Server sync is pending.",
    );
    expect(stderr).toContain("Next:");
    expect(stderr).toContain("vana data show github");
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
    mockInput.mockRejectedValueOnce(new ExitPromptError());

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Cancelled.");
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
        resultPath: "/tmp/.vana/github-result.json",
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
    expect(stderr).toContain("Connected GitHub.");
    expect(stderr).toContain(
      "Collected your GitHub data and saved it locally.",
    );
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
        resultPath: "/tmp/.vana/github-result.json",
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
    expect(stderr).toContain("Connected GitHub.");
    expect(stderr).toContain(
      "Collected your GitHub data and synced it to your Personal Server.",
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
    expect(stderr).toContain("Steam is not available.");
    expect(stderr).toContain("vana sources");
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
    // The new design doesn't narrate session reuse; it simply tries and fails
    expect(stderr).toContain(
      "GitHub needs credentials. Run without --no-input to authenticate.",
    );
  });

  it("shows source detail in json mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        company: "Microsoft",
        description: "Your GitHub data",
        version: "1.2.0",
        exportFrequency: "daily",
        authMode: "interactive",
      },
    ]);
    mockReadCachedConnectorMetadata.mockResolvedValue({
      id: "github",
      version: "1.2.0",
      scopes: [
        { scope: "repos", label: "Repositories", description: "Your repos" },
      ],
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "sources",
      "github",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.id).toBe("github");
    expect(parsed.version).toBe("1.2.0");
    expect(parsed.scopeLabels).toContain("Repositories");
  });

  it("shows source detail in human mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        company: "Microsoft",
        description: "Your GitHub data",
        version: "1.2.0",
        exportFrequency: "daily",
        authMode: "interactive",
      },
    ]);
    mockReadCachedConnectorMetadata.mockResolvedValue({
      id: "github",
      version: "1.2.0",
      scopes: [{ scope: "repos", label: "Repositories" }],
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "sources", "github"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("GitHub");
    expect(stdout).toContain("Collects");
    expect(stdout).toContain("Repositories");
  });

  it("returns error for unknown source detail", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub" },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "sources",
      "nonexistent",
      "--json",
    ]);

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error).toBe("unknown_source");
  });

  it("returns compact JSON from status --json", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          sessionPresent: true,
          lastRunAt: "2026-03-15T10:00:00Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/results/github.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status", "--json"]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.runtime).toBe("installed");
    expect(parsed.personalServer).toBeDefined();
    expect(parsed.sources).toEqual({ connected: 1, needsAttention: 0 });
    expect(parsed.next).toEqual(expect.any(String));
  });

  it("rejects collect when not previously connected", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "collect",
      "github",
      "--json",
    ]);

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error).toBe("not_previously_connected");
  });

  it("allows collect when previously connected", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          sessionPresent: true,
          lastRunAt: "2026-03-15T10:00:00Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/results/github.json",
        },
      },
    });
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/results/github.json",
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "collect", "github"]);

    expect(exitCode).toBe(0);
  });

  it("server sync returns error when no server is available", async () => {
    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "sync", "--json"]);

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.error).toBe("personal_server_unavailable");
  });

  it("server sync succeeds with pending datasets", async () => {
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          lastResultPath: "/tmp/results/github.json",
          dataState: "collected_local",
        },
      },
    });
    mockIngestResult.mockResolvedValue([
      { type: "ingest-complete", source: "github" },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "sync", "--json"]);

    expect(exitCode).toBe(0);
    const lines = stdout.trim().split("\n");
    const lastLine = JSON.parse(lines[lines.length - 1]);
    expect(lastLine.syncedCount).toBe(1);
  });

  it("server sync reports no pending datasets", async () => {
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          lastResultPath: "/tmp/results/github.json",
          dataState: "ingested_personal_server",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "sync", "--json"]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.syncedCount).toBe(0);
  });

  it("collect --all flushes pending sync work even when no sources are due", async () => {
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          exportFrequency: "1d",
          lastCollectedAt: new Date().toISOString(),
          lastResultPath: "/tmp/results/github.json",
          dataState: "ingest_unavailable",
        },
      },
    });
    mockIngestResult.mockResolvedValue([
      {
        type: "ingest-complete",
        source: "github",
        scopeResults: [{ scope: "github.profile", status: "stored" }],
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "collect",
      "--all",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(mockIngestResult).toHaveBeenCalledWith(
      "github",
      "/tmp/results/github.json",
      expect.objectContaining({
        state: "available",
        url: "http://localhost:8080",
      }),
      undefined,
    );

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.syncedPendingCount).toBe(1);
    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "github",
      expect.objectContaining({
        dataState: "ingested_personal_server",
        ingestScopes: expect.arrayContaining([
          expect.objectContaining({
            scope: "github.profile",
            status: "stored",
          }),
        ]),
      }),
    );
  });

  it("doctor shows freshness with relative time", async () => {
    const recentDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          sessionPresent: true,
          lastRunAt: recentDate,
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/results/github.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "doctor"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("1h ago");
  });

  it("status shows version update hint as next step", async () => {
    mockListAvailableSources.mockResolvedValue([
      {
        id: "github",
        name: "GitHub",
        authMode: "interactive",
        version: "2.0.0",
      },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          connectorVersion: "1.0.0",
          sessionPresent: true,
          lastRunAt: "2026-03-15T10:00:00Z",
          lastRunOutcome: "connected_and_ingested",
          dataState: "ingested_personal_server",
          lastResultPath: "/tmp/results/github.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status", "--json"]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    // Compact JSON includes the single most important next step
    expect(parsed.next).toEqual(expect.any(String));
  });

  it("sources table sorts connected first in human mode", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "steam", name: "Steam", authMode: "interactive" },
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          sessionPresent: true,
          lastRunAt: "2026-03-15T10:00:00Z",
          lastRunOutcome: "connected_local_only",
          dataState: "collected_local",
          lastResultPath: "/tmp/results/github.json",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "sources"]);

    expect(exitCode).toBe(0);
    const githubIndex = stdout.indexOf("GitHub");
    const steamIndex = stdout.indexOf("Steam");
    // Connected sources (GitHub) should appear before non-connected (Steam)
    expect(githubIndex).toBeLessThan(steamIndex);
  });

  it("shows per-scope results in post-connect messaging", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/.vana/github-result.json",
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
        scopeResults: [
          { scope: "github.profile", status: "stored" },
          { scope: "github.repositories", status: "stored" },
          { scope: "github.starred", status: "stored" },
        ],
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
    expect(stderr).toContain("Connected GitHub.");
    expect(stderr).toContain(
      "Collected your GitHub data and synced it to your Personal Server.",
    );
    expect(mockUpdateSourceState).toHaveBeenLastCalledWith(
      "github",
      expect.objectContaining({
        ingestScopes: expect.arrayContaining([
          expect.objectContaining({
            scope: "github.profile",
            status: "stored",
          }),
        ]),
      }),
    );
  });

  it("shows partial sync results in post-connect messaging", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/.vana/github-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });
    mockIngestResult.mockResolvedValue([
      {
        type: "ingest-partial",
        source: "github",
        target: "http://localhost:8080",
        scopeResults: [
          { scope: "github.profile", status: "stored" },
          { scope: "github.repositories", status: "stored" },
          {
            scope: "github.starred",
            status: "failed",
            error: "400: schema not registered",
          },
        ],
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
    expect(stderr).toContain("Connected GitHub.");
    expect(stderr).toContain("2/3 scopes synced, 1 failed");
    expect(stderr).toContain("vana server sync");
  });

  it("marks collected data as pending sync when the personal server is unavailable", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/.vana/github-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "unavailable",
      url: null,
      source: null,
      health: null,
    });
    mockIngestResult.mockResolvedValue([
      {
        type: "ingest-skipped",
        source: "github",
        reason: "personal_server_unavailable",
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
    expect(mockUpdateSourceState).toHaveBeenLastCalledWith(
      "github",
      expect.objectContaining({
        dataState: "ingest_unavailable",
        lastResultPath: "/tmp/.vana/github-result.json",
      }),
    );
    expect(stderr).toContain("Personal Server sync is pending.");
  });

  it("includes personalServerInfo in status JSON", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          sessionPresent: true,
          lastRunAt: "2026-03-15T10:00:00Z",
          lastRunOutcome: "connected_and_ingested",
          dataState: "ingested_personal_server",
          lastResultPath: "/tmp/results/github.json",
          ingestScopes: [
            {
              scope: "github.profile",
              status: "stored",
              syncedAt: "2026-03-15T10:00:00Z",
            },
            {
              scope: "github.repositories",
              status: "stored",
              syncedAt: "2026-03-15T10:00:00Z",
            },
          ],
        },
      },
    });
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
      source: "scan",
      health: { status: "ok", version: "0.0.1", uptime: 3600, owner: null },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status", "--json"]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.runtime).toBe("installed");
    expect(parsed.personalServer).toBe("available");
    expect(parsed.personalServerUrl).toBe("http://localhost:8080");
    expect(parsed.sources).toEqual({ connected: 1, needsAttention: 0 });
  });

  it("server sync re-ingests failed scopes", async () => {
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          lastResultPath: "/tmp/results/github.json",
          dataState: "ingested_personal_server",
          ingestScopes: [
            { scope: "github.profile", status: "stored" },
            { scope: "github.starred", status: "failed", error: "timeout" },
          ],
        },
      },
    });
    mockIngestResult.mockResolvedValue([
      {
        type: "ingest-complete",
        source: "github",
        scopeResults: [{ scope: "github.starred", status: "stored" }],
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "sync", "--json"]);

    expect(exitCode).toBe(0);
    expect(mockIngestResult).toHaveBeenCalledWith(
      "github",
      "/tmp/results/github.json",
      expect.objectContaining({
        state: "available",
        url: "http://localhost:8080",
      }),
      { scopes: ["github.starred"] },
    );
    const lines = stdout.trim().split("\n");
    const lastLine = JSON.parse(lines[lines.length - 1]);
    expect(lastLine.syncedCount).toBe(1);
    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "github",
      expect.objectContaining({
        dataState: "ingested_personal_server",
        ingestScopes: expect.arrayContaining([
          expect.objectContaining({
            scope: "github.profile",
            status: "stored",
          }),
          expect.objectContaining({
            scope: "github.starred",
            status: "stored",
          }),
        ]),
      }),
    );
  });

  it("server data command lists scopes from local state", async () => {
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          dataState: "ingested_personal_server",
          ingestScopes: [
            { scope: "github.profile", status: "stored" },
            { scope: "github.repositories", status: "stored" },
            { scope: "github.starred", status: "stored" },
          ],
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "data", "--json"]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.count).toBe(3);
    expect(parsed.scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "github.profile" }),
        expect.objectContaining({ scope: "github.repositories" }),
        expect.objectContaining({ scope: "github.starred" }),
      ]),
    );
  });

  it("server data command prefers remote scopes when personal server auth is available", async () => {
    const listScopes = vi.fn().mockResolvedValue([
      { scope: "github.profile", count: 2 },
      { scope: "github.repositories", count: 8 },
    ]);
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "https://ps.example.com",
      source: "auth",
      health: { status: "ok", version: "1.0.0", uptime: 10, owner: "0xabc" },
    });
    mockResolvePersonalServerAuthConfig.mockReturnValue({
      type: "bearerToken",
      token: "ps-token",
    });
    mockCreatePersonalServerClient.mockReturnValue({ listScopes });
    mockReadCliState.mockResolvedValue({ version: 1, sources: {} });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "data", "--json"]);

    expect(exitCode).toBe(0);
    expect(mockResolvePersonalServerAuthConfig).toHaveBeenCalledWith(
      "https://ps.example.com",
    );
    expect(mockCreatePersonalServerClient).toHaveBeenCalledWith({
      url: "https://ps.example.com",
      auth: { type: "bearerToken", token: "ps-token" },
    });
    expect(listScopes).toHaveBeenCalledWith(undefined);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.source).toBe("remote");
    expect(parsed.count).toBe(2);
    expect(parsed.scopes).toEqual([
      { scope: "github.profile", detail: "2 versions" },
      { scope: "github.repositories", detail: "8 versions" },
    ]);
  });

  it("server data command reports an empty remote personal server without falling back to local scopes", async () => {
    const listScopes = vi.fn().mockResolvedValue([]);
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "https://ps.example.com",
      source: "auth",
      health: { status: "ok", version: "1.0.0", uptime: 10, owner: "0xabc" },
    });
    mockResolvePersonalServerAuthConfig.mockReturnValue({
      type: "bearerToken",
      token: "ps-token",
    });
    mockCreatePersonalServerClient.mockReturnValue({ listScopes });
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          dataState: "ingested_personal_server",
          ingestScopes: [
            { scope: "github.profile", status: "stored" },
            { scope: "github.repositories", status: "stored" },
          ],
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "data"]);

    expect(exitCode).toBe(0);
    expect(listScopes).toHaveBeenCalledWith(undefined);
    expect(stdout).toContain("No data on your Personal Server.");
    expect(stdout).not.toContain("github.profile");
    expect(stdout).not.toContain(
      "Showing locally-known scopes. Connect your Personal Server for live data.",
    );
  });

  it("shows partial sync badge in doctor for sources with mixed scope results", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          sessionPresent: true,
          lastRunAt: "2026-03-15T10:00:00Z",
          lastRunOutcome: "connected_and_ingested",
          dataState: "ingested_personal_server",
          lastResultPath: "/tmp/results/github.json",
          ingestScopes: [
            { scope: "github.profile", status: "stored" },
            { scope: "github.starred", status: "failed", error: "timeout" },
          ],
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "doctor"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("partial sync");
  });

  it("completes first-time setup when runtime is missing and user confirms", async () => {
    runtimeState = "missing";
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockConfirm.mockResolvedValueOnce(true);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/github/github-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/.vana/github-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    mockReadFile.mockResolvedValue(
      JSON.stringify({ profile: { username: "alice" } }),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    expect(exitCode).toBe(0);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Continue?" }),
    );
    expect(stderr).toContain("Connected GitHub.");
  });

  it("prompts for credentials on needs-input event", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "steam", name: "Steam", authMode: "interactive" },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/valve/steam-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    mockInput.mockResolvedValueOnce("alice");
    mockPassword.mockResolvedValueOnce("secret123");
    runConnectorEvents = [
      {
        type: "needs-input",
        source: "steam",
        message: "Log in to Steam",
        fields: ["username", "password"],
      },
      {
        type: "collection-complete",
        source: "steam",
        resultPath: "/tmp/.vana/steam-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    mockReadFile.mockResolvedValue(
      JSON.stringify({ profile: { username: "alice" } }),
    );

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "steam"]);

    expect(exitCode).toBe(0);
    expect(mockInput).toHaveBeenCalled();
    expect(mockPassword).toHaveBeenCalled();
    expect(stderr).toContain("Connected Steam.");
  });

  it("handles connector fetch failure for non-checksum errors", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    const runtimeImport = await import("../../src/runtime/index.js");
    const fetchSpy = vi
      .spyOn(runtimeImport.ManagedPlaywrightRuntime.prototype, "fetchConnector")
      .mockRejectedValueOnce(new Error("Network timeout"));

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "github"]);

    fetchSpy.mockRestore();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("GitHub is not available.");
    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "github",
      expect.objectContaining({
        lastRunOutcome: "connector_unavailable",
      }),
    );
  });

  it("fails for legacy auth connectors without a display server", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "shop", name: "Shop", authMode: "legacy" },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/shop/shop-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };

    const originalPlatform = process.platform;
    const originalDisplay = process.env.DISPLAY;
    const originalWayland = process.env.WAYLAND_DISPLAY;
    Object.defineProperty(process, "platform", { value: "linux" });
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "shop"]);

    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalDisplay !== undefined) process.env.DISPLAY = originalDisplay;
    if (originalWayland !== undefined)
      process.env.WAYLAND_DISPLAY = originalWayland;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("requires a browser window");
    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "shop",
      expect.objectContaining({
        lastRunOutcome: "legacy_auth",
      }),
    );
  });

  it("handles cancelled prompt input during connect (ctrl+c)", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "steam", name: "Steam", authMode: "interactive" },
    ]);
    fetchConnectorResult = {
      connectorPath: "/tmp/connectors/valve/steam-playwright.js",
      logPath: "/tmp/logs/fetch.log",
    };
    runConnectorEvents = [
      {
        type: "needs-input",
        source: "steam",
        message: "Log in to Steam",
        fields: ["username", "password"],
      },
    ];
    mockInput.mockRejectedValueOnce(new ExitPromptError());

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "connect", "steam"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Cancelled.");
    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "steam",
      expect.objectContaining({
        lastRunOutcome: "needs_input",
        lastError: "Cancelled before input was completed.",
      }),
    );
  });

  it("server sync shows themed scope results with next step guidance", async () => {
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          lastResultPath: "/tmp/results/github.json",
          dataState: "collected_local",
        },
      },
    });
    mockIngestResult.mockResolvedValue([
      {
        type: "ingest-complete",
        source: "github",
        scopeResults: [
          { scope: "github.profile", status: "stored" },
          { scope: "github.repositories", status: "stored" },
        ],
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "sync"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("\u2713");
    expect(stdout).toContain("github.profile");
    expect(stdout).toContain("github.repositories");
    expect(stdout).toContain("Synced 1 dataset(s).");
    expect(stdout).toContain("Next:");
    expect(stdout).toContain("vana data list");
  });

  it("writes traceability breadcrumbs on needs-input event", async () => {
    runConnectorEvents = [
      {
        type: "needs-input",
        source: "steam",
        message: "Steam needs credentials",
        fields: ["username", "password"],
        logPath: "/tmp/logs/run.log",
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    await runCli(["node", "vana", "connect", "steam", "--no-input"]);

    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "steam",
      expect.objectContaining({
        connectionHealth: "needs_reauth",
        connectionHealthChangedAt: expect.any(String),
        connectionHealthReason: "needs-input: Steam needs credentials",
      }),
    );
  });

  it("writes traceability breadcrumbs on legacy-auth event", async () => {
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
        message: "Manual browser step required",
        logPath: "/tmp/logs/run.log",
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    await runCli(["node", "vana", "connect", "shop", "--no-input"]);

    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "shop",
      expect.objectContaining({
        connectionHealth: "needs_reauth",
        connectionHealthChangedAt: expect.any(String),
        connectionHealthReason: "legacy-auth: Manual browser step required",
      }),
    );
  });

  it("writes traceability breadcrumbs on runtime-error event", async () => {
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
        type: "runtime-error",
        source: "github",
        message: "Browser navigation failed",
        logPath: "/tmp/logs/run.log",
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    await runCli(["node", "vana", "connect", "github"]);

    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "github",
      expect.objectContaining({
        connectionHealth: "error",
        connectionHealthChangedAt: expect.any(String),
        connectionHealthReason: "runtime-error: Browser navigation failed",
      }),
    );
  });

  it("preserves degraded health when collection completes after legacy-auth", async () => {
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
        message: "Manual browser step required",
        logPath: "/tmp/logs/run.log",
      },
      {
        type: "collection-complete",
        source: "shop",
        resultPath: "/tmp/.vana/shop-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    mockReadFile.mockResolvedValue(JSON.stringify({ orders: [{ id: 1 }] }));

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli([
      "node",
      "vana",
      "connect",
      "shop",
      "--no-input",
    ]);

    // When pendingExitCode is set, health fields should NOT be overwritten
    // (undefined values are skipped by the merge in updateSourceState)
    const lastCall =
      mockUpdateSourceState.mock.calls[
        mockUpdateSourceState.mock.calls.length - 1
      ];
    expect(lastCall[1].connectionHealth).toBeUndefined();
    expect(lastCall[1].connectionHealthReason).toBeUndefined();
    // But collection state should still be updated
    expect(lastCall[1]).toEqual(
      expect.objectContaining({
        lastCollectedAt: expect.any(String),
        lastResultPath: "/tmp/.vana/shop-result.json",
      }),
    );
    // Should still return the pending exit code
    expect(exitCode).toBe(1);
  });

  it("records lastError on result file parse failure", async () => {
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
        type: "collection-complete",
        source: "github",
        resultPath: "/tmp/.vana/github-result.json",
        logPath: "/tmp/logs/run.log",
      },
    ];
    // Make readFile throw to simulate parse failure
    mockReadFile.mockRejectedValue(new Error("ENOENT: file not found"));

    const { runCli } = await import("../../src/cli/index.js");
    await runCli(["node", "vana", "connect", "github"]);

    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "github",
      expect.objectContaining({
        lastError: expect.stringContaining("Failed to parse result file"),
      }),
    );
  });

  it("includes traceability fields in status JSON output", async () => {
    mockListAvailableSources.mockResolvedValue([
      { id: "github", name: "GitHub", authMode: "interactive" },
    ]);
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          sessionPresent: true,
          lastRunAt: "2026-03-15T10:00:00Z",
          lastRunOutcome: "needs_input",
          dataState: "collected_local",
          connectionHealth: "needs_reauth",
          connectionHealthChangedAt: "2026-03-15T10:00:00Z",
          connectionHealthReason: "needs-input: GitHub needs credentials",
          lastLogPath: "/tmp/logs/run.log",
          lastError: "GitHub needs credentials",
        },
      },
    });

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "status", "--json"]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.sourceHealth.github).toEqual(
      expect.objectContaining({
        connectionHealth: "needs_reauth",
        connectionHealthChangedAt: "2026-03-15T10:00:00Z",
        connectionHealthReason: "needs-input: GitHub needs credentials",
        lastLogPath: "/tmp/logs/run.log",
        lastError: "GitHub needs credentials",
      }),
    );
  });

  it("connectionHealth is backward compatible in sourceStatusSchema", async () => {
    const { sourceStatusSchema } = await import("../../src/core/cli-types.js");
    // Should parse successfully without connectionHealth
    const result = sourceStatusSchema.safeParse({
      source: "github",
      installed: true,
      sessionPresent: false,
    });
    expect(result.success).toBe(true);

    // Should parse successfully with connectionHealth
    const resultWithHealth = sourceStatusSchema.safeParse({
      source: "github",
      installed: true,
      sessionPresent: false,
      connectionHealth: "needs_reauth",
      connectionHealthChangedAt: "2026-03-15T10:00:00Z",
      connectionHealthReason: "needs-input: credentials needed",
    });
    expect(resultWithHealth.success).toBe(true);

    // Should parse with connectionHealthRetryable
    const resultWithRetryable = sourceStatusSchema.safeParse({
      source: "github",
      installed: true,
      sessionPresent: false,
      connectionHealth: "error",
      connectionHealthReason: "runtime-error: timeout",
      connectionHealthRetryable: true,
    });
    expect(resultWithRetryable.success).toBe(true);
  });

  it("sets connectionHealthRetryable based on error type for runtime-error", async () => {
    // Transient error — retryable
    runConnectorEvents = [
      {
        type: "runtime-error",
        source: "github",
        message: "Navigation timeout exceeded",
        logPath: "/tmp/logs/run.log",
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    await runCli(["node", "vana", "connect", "github"]);

    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "github",
      expect.objectContaining({
        connectionHealth: "error",
        connectionHealthRetryable: true,
      }),
    );
  });

  it("sets connectionHealthRetryable false for non-transient runtime-error", async () => {
    runConnectorEvents = [
      {
        type: "runtime-error",
        source: "github",
        message: "Element not found on page",
        logPath: "/tmp/logs/run.log",
      },
    ];

    const { runCli } = await import("../../src/cli/index.js");
    await runCli(["node", "vana", "connect", "github"]);

    expect(mockUpdateSourceState).toHaveBeenCalledWith(
      "github",
      expect.objectContaining({
        connectionHealth: "error",
        connectionHealthRetryable: false,
      }),
    );
  });

  it("formatHealthMessage maps reason prefixes to human messages", async () => {
    const { formatHealthMessage } = await import("../../src/cli/index.js");

    expect(formatHealthMessage(undefined)).toBeNull();
    expect(formatHealthMessage("collection-complete")).toBeNull();
    expect(formatHealthMessage("needs-input: Steam needs credentials")).toBe(
      "Requires interactive login: Steam needs credentials.",
    );
    expect(
      formatHealthMessage("legacy-auth: Manual browser step required"),
    ).toBe(
      "Needed a browser window: Manual browser step required. Reconnect interactively.",
    );
    expect(formatHealthMessage("runtime-error: Navigation timeout")).toBe(
      "Collection failed — Navigation timeout.",
    );
    expect(formatHealthMessage("error-result: Session expired")).toBe(
      "Connector returned an error: Session expired.",
    );
    // Trailing period in detail is stripped to avoid double-period
    expect(
      formatHealthMessage("legacy-auth: Disabled in --no-input mode."),
    ).toBe(
      "Needed a browser window: Disabled in --no-input mode. Reconnect interactively.",
    );
    // Unknown prefix falls back gracefully
    expect(formatHealthMessage("something-new: details")).toBe(
      "something-new: details",
    );
  });

  it("server sync suggests retry when some scopes fail", async () => {
    mockDetectPersonalServerTarget.mockResolvedValue({
      state: "available",
      url: "http://localhost:8080",
    });
    mockReadCliState.mockResolvedValue({
      version: 1,
      sources: {
        github: {
          connectorInstalled: true,
          lastResultPath: "/tmp/results/github.json",
          dataState: "collected_local",
        },
      },
    });
    mockIngestResult.mockResolvedValue([
      {
        type: "ingest-partial",
        source: "github",
        scopeResults: [
          { scope: "github.profile", status: "stored" },
          {
            scope: "github.starred",
            status: "failed",
            error: "schema not registered",
          },
        ],
      },
    ]);

    const { runCli } = await import("../../src/cli/index.js");
    const exitCode = await runCli(["node", "vana", "server", "sync"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("\u2713");
    expect(stdout).toContain("\u2717");
    expect(stdout).toContain("github.profile");
    expect(stdout).toContain("schema not registered");
    expect(stdout).toContain("Next:");
    expect(stdout).toContain("vana server sync");
  });
});
