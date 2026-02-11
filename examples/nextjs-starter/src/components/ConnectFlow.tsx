"use client";

import { useState, useCallback } from "react";
import { useVanaConnect } from "@opendatalabs/connect/react";

export default function ConnectFlow() {
  const { connect, status, grant, error, deepLinkUrl, reset } =
    useVanaConnect();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fetchedData, setFetchedData] = useState<unknown>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setFetchedData(null);
    setFetchError(null);

    try {
      const res = await fetch("/api/connect", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        return;
      }

      setSessionId(data.sessionId);
      connect({ sessionId: data.sessionId, deepLinkUrl: data.deepLinkUrl });
    } catch {
      // Network error — hook will show error state
    }
  }, [connect]);

  function handleCopy() {
    if (!deepLinkUrl) return;
    navigator.clipboard.writeText(deepLinkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleFetchData() {
    if (!grant) return;
    setFetchLoading(true);
    setFetchError(null);
    setFetchedData(null);

    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFetchError(data.error ?? "Failed to fetch data");
        return;
      }

      setFetchedData(data);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setFetchLoading(false);
    }
  }

  function handleReset() {
    reset();
    setSessionId(null);
    setFetchedData(null);
    setFetchError(null);
    setFetchLoading(false);
  }

  const isTerminal =
    status === "waiting" ||
    status === "approved" ||
    status === "denied" ||
    status === "expired";

  return (
    <div>
      {/* Connect CTA */}
      {status === "idle" && (
        <button onClick={handleConnect} style={btnPrimary}>
          Connect Your Data
        </button>
      )}

      {/* Loading */}
      {status === "connecting" && (
        <div style={card}>
          <span style={mono}>Initializing session...</span>
        </div>
      )}

      {/* Session info */}
      {isTerminal && sessionId && (
        <div style={card}>
          <div style={{ marginBottom: 20 }}>
            <div style={fieldRow}>
              <span style={label}>Status</span>
              <span
                style={{
                  ...mono,
                  fontSize: 12,
                  color: statusColor(status),
                }}
              >
                {statusDot(status)} {statusLabel(status)}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={label}>Session</div>
            <code style={codeBlock}>{sessionId}</code>
          </div>

          {deepLinkUrl && (
            <div style={{ marginBottom: 8 }}>
              <div style={label}>Deep Link</div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <code
                  style={{
                    ...codeBlock,
                    flex: 1,
                    wordBreak: "break-all" as const,
                  }}
                >
                  {deepLinkUrl}
                </code>
                <button onClick={handleCopy} style={btnGhost}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <a
                href={deepLinkUrl}
                style={{
                  ...btnPrimary,
                  display: "inline-block",
                  boxSizing: "border-box",
                  marginTop: 8,
                  fontSize: 13,
                  textDecoration: "none",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                Open in Data Connect
              </a>
            </div>
          )}
        </div>
      )}

      {/* Grant details */}
      {status === "approved" && grant && (
        <div style={{ ...card, borderColor: "#22c55e33" }}>
          <div style={label}>Grant</div>
          <pre style={preBlock}>{JSON.stringify(grant, null, 2)}</pre>

          <button
            onClick={handleFetchData}
            disabled={fetchLoading}
            style={{ ...btnPrimary, marginTop: 16, width: "100%" }}
          >
            {fetchLoading ? "Fetching..." : "Fetch Data"}
          </button>

          {fetchError && (
            <p style={{ color: "#ef4444", marginTop: 8, fontSize: 13 }}>
              {fetchError}
            </p>
          )}

          {fetchedData != null && (
            <div style={{ marginTop: 16 }}>
              <div style={label}>Response</div>
              <pre style={{ ...preBlock, maxHeight: 400 }}>
                {JSON.stringify(fetchedData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Errors */}
      {(status === "error" || status === "denied" || status === "expired") &&
        error && (
          <div style={{ ...card, borderColor: "#ef444444" }}>
            <p style={{ color: "#ef4444", margin: 0, fontSize: 13 }}>{error}</p>
          </div>
        )}

      {/* Reset */}
      {status !== "idle" && status !== "connecting" && (
        <button onClick={handleReset} style={{ ...btnGhost, marginTop: 12 }}>
          Reset
        </button>
      )}
    </div>
  );
}

/* ── Helpers ── */

function statusColor(s: string): string {
  switch (s) {
    case "waiting":
      return "#eab308";
    case "approved":
      return "#22c55e";
    case "denied":
    case "expired":
    case "error":
      return "#ef4444";
    default:
      return "#71717a";
  }
}

function statusDot(s: string): string {
  switch (s) {
    case "waiting":
      return "\u25CB";
    case "approved":
      return "\u25CF";
    case "denied":
    case "expired":
    case "error":
      return "\u25CF";
    default:
      return "\u25CB";
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "waiting":
      return "Waiting for approval";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired";
    default:
      return s;
  }
}

/* ── Styles ── */

const mono: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 13,
  color: "#a1a1aa",
};

const label: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: 1.5,
  color: "#52525b",
  marginBottom: 6,
};

const fieldRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const card: React.CSSProperties = {
  background: "#0f0f12",
  border: "1px solid #27272a",
  borderRadius: 8,
  padding: 20,
  marginBottom: 12,
};

const codeBlock: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 12,
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 6,
  padding: "8px 10px",
  color: "#d4d4d8",
  display: "block",
};

const preBlock: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 12,
  lineHeight: 1.6,
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 6,
  padding: 12,
  color: "#d4d4d8",
  overflow: "auto",
  margin: 0,
};

const btnPrimary: React.CSSProperties = {
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 14,
  fontWeight: 500,
  padding: "10px 20px",
  border: "none",
  borderRadius: 6,
  background: "#22c55e",
  color: "#09090b",
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 12,
  padding: "8px 12px",
  border: "1px solid #27272a",
  borderRadius: 6,
  background: "transparent",
  color: "#71717a",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
