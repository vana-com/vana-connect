"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVanaConnect } from "@opendatalabs/connect/react";
import type { GrantPayload } from "@opendatalabs/connect/core";
import { CONNECTORS } from "@/lib/connectors";
import type { ConnectorState, ConnectorStatus } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────

type Action =
  | { type: "SET_STATUS"; id: string; status: ConnectorStatus }
  | { type: "SET_GRANT"; id: string; grant: GrantPayload }
  | { type: "SET_DATA"; id: string; data: unknown }
  | { type: "SET_ERROR"; id: string; error: string }
  | { type: "SKIP"; id: string };

interface Props {
  connectors: ConnectorState[];
  dispatch: React.Dispatch<Action>;
}

// ─── Status icon helper ─────────────────────────────────────

function StatusIcon({ status }: { status: ConnectorStatus }) {
  switch (status) {
    case "done":
      return <span className="status-icon status-icon-done">{"\u2713"}</span>;
    case "waiting":
    case "connecting":
    case "fetching":
      return (
        <span className="status-icon status-icon-waiting">
          <span className="spinner" style={{ width: 12, height: 12 }} />
        </span>
      );
    case "error":
      return <span className="status-icon status-icon-error">!</span>;
    case "skipped":
      return (
        <span className="status-icon status-icon-pending">{"\u2014"}</span>
      );
    default:
      return (
        <span className="status-icon status-icon-pending">{"\u25CB"}</span>
      );
  }
}

// ─── Component ──────────────────────────────────────────────

export default function ConnectorQueue({ connectors, dispatch }: Props) {
  const {
    connect,
    status: hookStatus,
    grant,
    error,
    connectUrl,
    reset,
  } = useVanaConnect({ environment: "dev" });

  const activeIdRef = useRef<string | null>(null);
  const prevHookStatus = useRef(hookStatus);

  const fetchConnectorData = useCallback(
    async (id: string, g: GrantPayload) => {
      try {
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grant: g }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? "Failed to fetch data",
          );
        }
        const { data } = await res.json();
        dispatch({ type: "SET_DATA", id, data });
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          id,
          error: err instanceof Error ? err.message : "Failed to fetch data",
        });
      } finally {
        activeIdRef.current = null;
      }
    },
    [dispatch],
  );

  useEffect(() => {
    const id = activeIdRef.current;
    if (!id) return;
    if (hookStatus === prevHookStatus.current) return;
    prevHookStatus.current = hookStatus;

    switch (hookStatus) {
      case "waiting":
        dispatch({ type: "SET_STATUS", id, status: "waiting" });
        break;
      case "approved":
        if (grant) {
          dispatch({ type: "SET_GRANT", id, grant });
          dispatch({ type: "SET_STATUS", id, status: "fetching" });
          void fetchConnectorData(id, grant);
        }
        break;
      case "denied":
      case "expired":
      case "error":
        dispatch({
          type: "SET_ERROR",
          id,
          error: error ?? `Connection ${hookStatus}`,
        });
        activeIdRef.current = null;
        break;
    }
  }, [hookStatus, grant, error, dispatch, fetchConnectorData]);

  const startConnector = useCallback(
    async (id: string) => {
      const def = CONNECTORS.find((c) => c.id === id);
      if (!def) return;

      activeIdRef.current = id;
      prevHookStatus.current = "idle";
      reset();
      dispatch({ type: "SET_STATUS", id, status: "connecting" });

      try {
        const res = await fetch("/api/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopes: [def.scope] }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? "Failed to create session",
          );
        }
        const { sessionId, connectUrl: url } = await res.json();
        connect({ sessionId, connectUrl: url });
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          id,
          error:
            err instanceof Error ? err.message : "Failed to create session",
        });
        activeIdRef.current = null;
      }
    },
    [connect, reset, dispatch],
  );

  const skipConnector = useCallback(
    (id: string) => {
      if (activeIdRef.current === id) {
        reset();
        activeIdRef.current = null;
      }
      dispatch({ type: "SKIP", id });
    },
    [reset, dispatch],
  );

  // ─── Progress ─────────────────────────────────────────────

  const doneCount = connectors.filter(
    (c) => c.status === "done" || c.status === "skipped",
  ).length;
  const progress = (doneCount / CONNECTORS.length) * 100;

  // ─── Render ───────────────────────────────────────────────

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span className="label">Data Sources</span>
          <span className="mono" style={{ fontSize: 12 }}>
            {doneCount}/{CONNECTORS.length}
          </span>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {CONNECTORS.map((def) => {
        const cs = connectors.find((c) => c.id === def.id)!;
        const isActive = activeIdRef.current === def.id;
        const isBusy =
          cs.status === "connecting" ||
          cs.status === "waiting" ||
          cs.status === "fetching";

        let rowClass = "connector-row";
        if (cs.status === "done") rowClass += " connector-row-done";
        else if (isBusy) rowClass += " connector-row-active";
        else if (cs.status === "error") rowClass += " connector-row-error";
        else if (cs.status === "skipped") rowClass += " connector-row-skipped";

        return (
          <div key={def.id} className={rowClass}>
            <div className="connector-icon">{def.icon}</div>
            <div className="connector-info">
              <div className="connector-label">{def.label}</div>
              <div className="connector-desc">
                {cs.error ?? def.description}
              </div>
            </div>
            <div className="connector-action">
              {cs.status === "pending" && (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ fontSize: 12, padding: "7px 16px" }}
                    onClick={() => void startConnector(def.id)}
                    disabled={
                      activeIdRef.current !== null &&
                      activeIdRef.current !== def.id
                    }
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => skipConnector(def.id)}
                  >
                    Skip
                  </button>
                </>
              )}
              {cs.status === "waiting" && connectUrl && isActive && (
                <a
                  href={connectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{
                    fontSize: 12,
                    padding: "7px 16px",
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  Open Vana
                </a>
              )}
              {cs.status === "error" && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void startConnector(def.id)}
                >
                  Retry
                </button>
              )}
              {isBusy && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => skipConnector(def.id)}
                >
                  Skip
                </button>
              )}
            </div>
            <StatusIcon status={cs.status} />
          </div>
        );
      })}
    </div>
  );
}
