"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Status =
  | "idle"
  | "connecting"
  | "waiting"
  | "approved"
  | "denied"
  | "expired"
  | "error";

interface SessionInfo {
  sessionId: string;
  deepLinkUrl: string;
  expiresAt: string;
  relayUrl: string;
}

interface PollResult {
  status: "pending" | "claimed" | "approved" | "denied" | "expired";
  grant?: {
    grantId: string;
    userAddress: string;
    builderAddress: string;
    scopes: string[];
  };
  reason?: string;
}

export default function ConnectFlow() {
  const [status, setStatus] = useState<Status>("idle");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [grant, setGrant] = useState<PollResult["grant"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef(false);

  const startPolling = useCallback((info: SessionInfo) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setStatus("waiting");

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${info.relayUrl}/v1/session/${info.sessionId}/poll`,
        );
        if (!res.ok) return;

        const data: PollResult = await res.json();

        if (data.status === "approved") {
          clearInterval(interval);
          pollingRef.current = false;
          setStatus("approved");
          setGrant(data.grant ?? null);
        } else if (data.status === "denied") {
          clearInterval(interval);
          pollingRef.current = false;
          setStatus("denied");
          setError(data.reason ?? "Request denied by user");
        } else if (data.status === "expired") {
          clearInterval(interval);
          pollingRef.current = false;
          setStatus("expired");
          setError("Session expired");
        }
      } catch {
        // Polling errors are transient — keep trying
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      pollingRef.current = false;
    };
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false;
    };
  }, []);

  async function handleConnect() {
    setStatus("connecting");
    setError(null);
    setGrant(null);
    setSession(null);

    try {
      const res = await fetch("/api/connect", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setError(data.error ?? "Failed to init session");
        return;
      }

      setSession(data);
      startPolling(data);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function handleCopy() {
    if (!session) return;
    navigator.clipboard.writeText(session.deepLinkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    pollingRef.current = false;
    setStatus("idle");
    setSession(null);
    setGrant(null);
    setError(null);
  }

  return (
    <div>
      {/* Connect Button */}
      {status === "idle" && (
        <button onClick={handleConnect} style={btnStyle}>
          Connect Your Data
        </button>
      )}

      {/* Connecting spinner */}
      {status === "connecting" && (
        <div style={cardStyle}>
          <p style={{ color: "#808080" }}>Initializing session...</p>
        </div>
      )}

      {/* Waiting for approval */}
      {(status === "waiting" || status === "approved" || status === "denied" || status === "expired") && session && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Status</div>
            <div style={{ color: statusColor(status), fontWeight: 600 }}>
              {statusLabel(status)}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Session ID</div>
            <code style={codeStyle}>{session.sessionId}</code>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Deep Link URL</div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <code
                style={{
                  ...codeStyle,
                  flex: 1,
                  wordBreak: "break-all" as const,
                }}
              >
                {session.deepLinkUrl}
              </code>
              <button onClick={handleCopy} style={btnSmallStyle}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p
              style={{
                fontSize: 11,
                color: "#808080",
                marginTop: 6,
              }}
            >
              Paste this URL into the Personal Server Dev UI &rarr; Connect tab
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Expires At</div>
            <code style={codeStyle}>
              {new Date(session.expiresAt).toLocaleTimeString()}
            </code>
          </div>
        </div>
      )}

      {/* Approved — show grant details */}
      {status === "approved" && grant && (
        <div style={{ ...cardStyle, borderColor: "#00ff88" }}>
          <div style={labelStyle}>Grant Details</div>
          <pre
            style={{
              background: "#1e1e1e",
              padding: 12,
              borderRadius: 4,
              fontSize: 12,
              overflow: "auto",
            }}
          >
            {JSON.stringify(grant, null, 2)}
          </pre>
        </div>
      )}

      {/* Error / Denied / Expired */}
      {(status === "error" || status === "denied" || status === "expired") && error && (
        <div
          style={{
            ...cardStyle,
            borderColor: "#ff4444",
          }}
        >
          <p style={{ color: "#ff4444" }}>{error}</p>
        </div>
      )}

      {/* Reset button */}
      {status !== "idle" && status !== "connecting" && (
        <button onClick={handleReset} style={{ ...btnSmallStyle, marginTop: 12 }}>
          Reset
        </button>
      )}
    </div>
  );
}

function statusColor(s: Status): string {
  switch (s) {
    case "waiting":
      return "#ffaa00";
    case "approved":
      return "#00ff88";
    case "denied":
    case "expired":
    case "error":
      return "#ff4444";
    default:
      return "#808080";
  }
}

function statusLabel(s: Status): string {
  switch (s) {
    case "waiting":
      return "Waiting for approval...";
    case "approved":
      return "Approved!";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired";
    default:
      return s;
  }
}

const btnStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: 14,
  padding: "12px 24px",
  border: "1px solid #00ff88",
  borderRadius: 4,
  background: "transparent",
  color: "#00ff88",
  cursor: "pointer",
};

const btnSmallStyle: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: 12,
  padding: "6px 12px",
  border: "1px solid #2a2a2a",
  borderRadius: 4,
  background: "transparent",
  color: "#808080",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const cardStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #2a2a2a",
  borderRadius: 4,
  padding: 16,
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#808080",
  marginBottom: 4,
};

const codeStyle: React.CSSProperties = {
  fontSize: 12,
  background: "#1e1e1e",
  padding: "4px 8px",
  borderRadius: 4,
  display: "inline-block",
};
