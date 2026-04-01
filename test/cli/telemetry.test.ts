import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tempRoot: "",
  config: {} as Record<string, unknown>,
  updateCliConfig: vi.fn(async (patch: Record<string, unknown>) => {
    state.config = { ...state.config, ...patch };
  }),
  readCliConfig: vi.fn(async () => ({ ...state.config })),
}));

vi.mock("../../src/core/index.js", () => ({
  getTelemetryOutboxDir: () => path.join(state.tempRoot, "telemetry", "outbox"),
  readCliConfig: state.readCliConfig,
  updateCliConfig: state.updateCliConfig,
}));

describe("cli telemetry", () => {
  let stderr = "";
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    state.tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "vana-connect-telemetry-"),
    );
    state.config = {};
    state.readCliConfig.mockClear();
    state.updateCliConfig.mockClear();
    stderr = "";
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write);
    delete process.env.VANA_TELEMETRY_DISABLED;
    delete process.env.VANA_TELEMETRY_DEBUG;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  afterEach(async () => {
    stderrSpy.mockRestore();
    await fs.rm(state.tempRoot, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("creates an install id and reports enabled-by-default status", async () => {
    const { getTelemetryStatus } = await import("../../src/cli/telemetry.js");

    const status = await getTelemetryStatus();

    expect(status.enabled).toBe(true);
    expect(status.mode).toBe("normal");
    expect(status.reason).toBe("default");
    expect(status.installId).toMatch(/^inst_/);
    expect(state.updateCliConfig).toHaveBeenCalledWith(
      expect.objectContaining({ telemetryInstallId: status.installId }),
    );
  });

  it("persists debug envelopes to stderr instead of the network", async () => {
    process.env.VANA_TELEMETRY_DEBUG = "1";
    const { createCliTelemetrySession } =
      await import("../../src/cli/telemetry.js");

    const session = await createCliTelemetrySession({
      command: "status",
      cliVersion: "0.11.6",
      channel: "stable",
      installMethod: "development",
      options: {
        json: true,
        noInput: true,
        quiet: true,
        detach: false,
        ipc: false,
      },
    });

    session.trackCustomEvent("status_rendered", {
      metadata: { sourceCount: 2 },
    });
    session.markCommandResult({ exitCode: 0, outcome: "ok" });
    await session.persist();

    expect(stderr).toContain('"client":{"name":"vana-cli","version":"0.11.6"}');
    expect(stderr).toContain('"eventName":"status_rendered"');
    await expect(
      fs.readdir(path.join(state.tempRoot, "telemetry", "outbox")),
    ).rejects.toThrow();
  });

  it("prefers outcome-derived error classes over unknown command failures", async () => {
    const { createCliTelemetrySession } =
      await import("../../src/cli/telemetry.js");

    const session = await createCliTelemetrySession({
      command: "connect",
      source: "github",
      cliVersion: "0.11.6",
      channel: "stable",
      installMethod: "development",
      options: {
        json: false,
        noInput: false,
        quiet: false,
        detach: false,
        ipc: false,
      },
    });

    session.trackCliEvent({
      type: "outcome",
      status: "needs_input",
    } as never);
    session.markCommandResult({ exitCode: 1, errorClass: "unknown" });
    await session.persist();

    const outboxDir = path.join(state.tempRoot, "telemetry", "outbox");
    const [filename] = await fs.readdir(outboxDir);
    const payload = JSON.parse(
      await fs.readFile(path.join(outboxDir, filename), "utf8"),
    ) as { events: Array<{ eventName: string; errorClass: string | null }> };

    expect(payload.events.at(-1)).toMatchObject({
      eventName: "command_failed",
      errorClass: "needs_input",
    });
  });

  it("flushes queued batches and removes accepted files", async () => {
    const { createCliTelemetrySession, flushTelemetryOutbox } =
      await import("../../src/cli/telemetry.js");
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal("fetch", fetchMock);

    const session = await createCliTelemetrySession({
      command: "connect",
      source: "github",
      cliVersion: "0.11.6",
      channel: "stable",
      installMethod: "development",
      options: {
        json: false,
        noInput: false,
        quiet: false,
        detach: false,
        ipc: false,
      },
    });

    session.trackCustomEvent("connector_resolved");
    session.markCommandResult({ exitCode: 0, outcome: "connected_local_only" });
    await session.persist();

    const outboxDir = path.join(state.tempRoot, "telemetry", "outbox");
    expect((await fs.readdir(outboxDir)).length).toBe(1);

    await flushTelemetryOutbox();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://telemetry.opendatalabs.com/v1/cli/events",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await fs.readdir(outboxDir)).toEqual([]);
  });
});
