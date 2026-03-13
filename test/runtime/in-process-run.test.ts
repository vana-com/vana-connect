import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const launchPersistentContext = vi.fn();
const resolveBrowserPath = vi.fn(() => "/tmp/chrome");
const importChromeCookies = vi.fn();
const isSystemChrome = vi.fn(() => false);
const getDefaultUserDataDir = vi.fn((slug: string) =>
  path.join(os.tmpdir(), ".dataconnect-browser-profiles", slug),
);

vi.mock("../../src/runtime/playwright/browser.js", () => ({
  launchPersistentContext,
  resolveBrowserPath,
  importChromeCookies,
  isSystemChrome,
  getDefaultUserDataDir,
}));

type FakePage = {
  goto: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

type FakeContext = {
  pages: ReturnType<typeof vi.fn>;
  newPage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  cookies: ReturnType<typeof vi.fn>;
  browser: ReturnType<typeof vi.fn>;
};

function createFakeRuntime() {
  const disconnectedHandlers: Array<() => void> = [];
  const page: FakePage = {
    goto: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => null),
    screenshot: vi.fn(async () => Buffer.from("test")),
    on: vi.fn(),
  };

  const context: FakeContext = {
    pages: vi.fn(() => [page]),
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
    cookies: vi.fn(async () => []),
    browser: vi.fn(() => ({
      on: (_event: string, handler: () => void) => {
        disconnectedHandlers.push(handler);
      },
    })),
  };

  launchPersistentContext.mockResolvedValue(context);
  return { page, context, disconnectedHandlers };
}

async function writeConnector(contents: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vana-connect-test-"));
  const connectorPath = path.join(dir, "test-playwright.js");
  await fs.writeFile(connectorPath, contents, "utf8");
  return connectorPath;
}

describe("startInProcessConnectorRun", () => {
  beforeEach(() => {
    launchPersistentContext.mockReset();
    resolveBrowserPath.mockClear();
    importChromeCookies.mockClear();
    isSystemChrome.mockClear();
    getDefaultUserDataDir.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("emits needs-input for requestInput in no-input mode", async () => {
    createFakeRuntime();
    const connectorPath = await writeConnector(`
(async () => {
  await page.requestInput({
    message: "Log in",
    schema: {
      type: "object",
      properties: {
        username: { type: "string" },
        password: { type: "string", format: "password" }
      }
    }
  });
})();
`);

    const { startInProcessConnectorRun } =
      await import("../../src/runtime/playwright/in-process-run.js");

    const handle = startInProcessConnectorRun({
      request: {
        connectorPath,
        source: "github",
        noInput: true,
      },
      logPath: path.join(os.tmpdir(), "vana-connect-needs-input.log"),
    });

    const events = [];
    for await (const event of handle.events()) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run-started", source: "github" }),
        expect.objectContaining({
          type: "needs-input",
          source: "github",
          fields: ["username", "password"],
        }),
      ]),
    );
  });

  it("emits legacy-auth for promptUser connectors", async () => {
    createFakeRuntime();
    const connectorPath = await writeConnector(`
(async () => {
  await page.promptUser("Please log in", async () => false);
})();
`);

    const { startInProcessConnectorRun } =
      await import("../../src/runtime/playwright/in-process-run.js");

    const handle = startInProcessConnectorRun({
      request: {
        connectorPath,
        source: "spotify",
        noInput: true,
      },
      logPath: path.join(os.tmpdir(), "vana-connect-legacy-auth.log"),
    });

    const events = [];
    for await (const event of handle.events()) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run-started", source: "spotify" }),
        expect.objectContaining({ type: "legacy-auth", source: "spotify" }),
      ]),
    );
  });

  it("writes a result and emits collection-complete", async () => {
    createFakeRuntime();
    const connectorPath = await writeConnector(`
(async () => {
  await page.setData("status", "Collecting");
  return {
    profile: { username: "tester" },
    repositories: []
  };
})();
`);

    const { startInProcessConnectorRun } =
      await import("../../src/runtime/playwright/in-process-run.js");

    const handle = startInProcessConnectorRun({
      request: {
        connectorPath,
        source: "github",
        noInput: true,
      },
      logPath: path.join(os.tmpdir(), "vana-connect-collection.log"),
    });

    const events = [];
    for await (const event of handle.events()) {
      events.push(event);
    }

    const completion = events.find(
      (event) => event.type === "collection-complete",
    );
    expect(completion).toEqual(
      expect.objectContaining({
        type: "collection-complete",
        source: "github",
      }),
    );

    const resultPath = (completion as { resultPath: string }).resultPath;
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    expect(result).toEqual({
      profile: { username: "tester" },
      repositories: [],
    });
  });
});
