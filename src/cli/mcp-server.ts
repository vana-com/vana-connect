/**
 * MCP (Model Context Protocol) server for agent integration.
 *
 * Exposes high-level tools over stdio so any MCP-compatible agent
 * (Claude Code, Cursor, etc.) can discover and call them.
 *
 * CRITICAL: All logging/output goes to stderr. stdout is the JSON-RPC transport.
 */

import { spawn } from "node:child_process";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getCliVersion } from "./index.js";
import {
  queryStatus,
  querySources,
  queryDataShow,
  queryDoctor,
} from "./queries.js";

/**
 * Start the MCP server on stdio.
 *
 * Returns a promise that resolves when the transport disconnects.
 */
export async function startMcpServer(): Promise<void> {
  const version = getCliVersion();

  const server = new McpServer({
    name: "vana",
    version,
  });

  // ── Tool: check_status ───────────────────────────────────────────────

  server.tool(
    "check_status",
    "Check system health: runtime state, Personal Server connection, and connected source status",
    async () => {
      const result = await queryStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── Tool: list_sources ───────────────────────────────────────────────

  server.tool(
    "list_sources",
    "List available data sources that can be connected for personal data collection",
    { filter: z.string().optional().describe("Filter sources by name") },
    async ({ filter }) => {
      const result = await querySources();
      if (filter) {
        const lowerFilter = filter.toLowerCase();
        result.sources = result.sources.filter(
          (s) =>
            s.id.toLowerCase().includes(lowerFilter) ||
            s.name.toLowerCase().includes(lowerFilter),
        );
        result.count = result.sources.length;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── Tool: show_data ──────────────────────────────────────────────────

  server.tool(
    "show_data",
    "Inspect collected data for a connected source. Shows data summary, sync status, and file paths",
    { source: z.string().describe("Source identifier (e.g. github, twitter)") },
    async ({ source }) => {
      const result = await queryDataShow(source);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── Tool: connect_source ─────────────────────────────────────────────

  server.tool(
    "connect_source",
    "Connect a platform and collect personal data. Runs the full connect flow: setup, authentication, data collection, and sync",
    { source: z.string().describe("Source identifier (e.g. github, twitter)") },
    async ({ source }) => {
      // Check auth mode before spawning — legacy sources need a headed
      // browser and cannot be connected by an agent.
      const sourcesResult = await querySources();
      const sourceInfo = sourcesResult.sources?.find(
        (s) =>
          s.id === source || s.name?.toLowerCase() === source.toLowerCase(),
      );

      if (sourceInfo?.authMode === "legacy") {
        return {
          content: [
            {
              type: "text" as const,
              text: `${sourceInfo.name ?? source} requires browser login. The user must run this in their own terminal:\n\nvana connect ${source}\n\nThis source cannot be connected by an agent.`,
            },
          ],
        };
      }

      return await runConnectAsChild(source);
    },
  );

  // ── Tool: run_diagnostics ────────────────────────────────────────────

  server.tool(
    "run_diagnostics",
    "Run detailed system diagnostics: CLI version, runtime paths, browser state, connector cache, and source-level issues",
    async () => {
      const result = await queryDoctor();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── Tool: generate_context (placeholder) ─────────────────────────────

  server.tool(
    "generate_context",
    "Generate prioritized suggestions for the next agent prompt based on connected personal data (coming soon)",
    async () => {
      return {
        content: [
          {
            type: "text",
            text: "Not yet implemented. Install with: vana skill install next-prompt",
          },
        ],
      };
    },
  );

  // ── Connect transport and run ────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Wait until the transport closes
  return new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
}

// ── Child process runner for connect_source ──────────────────────────

/**
 * Run `vana connect <source> --json --ipc` as a child process.
 *
 * The MCP server's stdout is the JSON-RPC transport, so the connect flow
 * must run in a separate process. We collect the child's stdout (JSONL events)
 * and stderr, parse the final outcome, and return a structured summary.
 *
 * Uses --ipc instead of --no-input so the connector can pause for
 * credential input via file-based IPC rather than failing immediately.
 */
async function runConnectAsChild(source: string) {
  return new Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>((resolve) => {
    const child = spawn(
      process.execPath,
      [process.argv[1], "connect", source, "--json", "--ipc"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      resolve({
        content: [
          {
            type: "text",
            text: `Failed to start connect process: ${err.message}`,
          },
        ],
        isError: true,
      });
    });

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      // Parse JSONL events from stdout
      const events: Record<string, unknown>[] = [];
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed) as Record<string, unknown>);
        } catch {
          // Skip non-JSON lines
        }
      }

      // Find the final outcome event (last event with an "outcome" field)
      const outcomeEvent = [...events]
        .reverse()
        .find((e) => "outcome" in e || "event" in e);

      const summary = buildConnectSummary(source, code, events, outcomeEvent);

      // If the outcome indicates interactive input is needed, explain
      if (
        outcomeEvent &&
        (outcomeEvent.outcome === "needs_input" ||
          outcomeEvent.event === "needs_input")
      ) {
        summary.push(
          "",
          `This source requires interactive authentication. Run \`vana connect ${source}\` in a terminal to complete the flow.`,
        );
      }

      if (stderr.trim()) {
        summary.push("", "Stderr:", stderr.trim());
      }

      resolve({
        content: [{ type: "text", text: summary.join("\n") }],
        isError: code !== 0,
      });
    });
  });
}

/**
 * Build a human-readable summary from connect child process results.
 */
function buildConnectSummary(
  source: string,
  exitCode: number | null,
  events: Record<string, unknown>[],
  outcomeEvent: Record<string, unknown> | undefined,
): string[] {
  const lines: string[] = [];

  if (exitCode === 0) {
    lines.push(`Connected ${source} successfully.`);
  } else {
    lines.push(`Connect ${source} exited with code ${exitCode ?? "unknown"}.`);
  }

  // Summarize collected data from events
  const scopeEvents = events.filter(
    (e) => e.event === "scope_complete" || e.event === "scope_collected",
  );
  if (scopeEvents.length > 0) {
    lines.push(
      "",
      "Collected data:",
      ...scopeEvents.map((e) => {
        const scope = (e.scope as string) ?? (e.name as string) ?? "unknown";
        const count = e.count ?? e.itemCount;
        return count != null ? `  ${scope} (${count} items)` : `  ${scope}`;
      }),
    );
  }

  if (outcomeEvent) {
    const outcome =
      (outcomeEvent.outcome as string) ?? (outcomeEvent.event as string);
    if (
      outcome &&
      outcome !== "scope_complete" &&
      outcome !== "scope_collected"
    ) {
      lines.push("", `Outcome: ${outcome}`);
    }
    if (outcomeEvent.message) {
      lines.push(`Detail: ${outcomeEvent.message as string}`);
    }
  }

  return lines;
}
