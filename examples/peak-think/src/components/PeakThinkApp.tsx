"use client";

import { useReducer, useMemo, useCallback } from "react";
import type { GrantPayload } from "@opendatalabs/connect/core";
import { CONNECTORS } from "@/lib/connectors";
import type {
  ConnectorState,
  ConnectorStatus,
  AppStep,
  AnalysisResult,
} from "@/lib/types";
import ConnectorQueue from "./ConnectorQueue";
import Dashboard from "./Dashboard";
import ChatInterface from "./ChatInterface";

// ─── State ──────────────────────────────────────────────────

interface State {
  connectors: ConnectorState[];
  step: AppStep;
  analysis: AnalysisResult | null;
  error: string | null;
}

type Action =
  | { type: "SET_STATUS"; id: string; status: ConnectorStatus }
  | { type: "SET_GRANT"; id: string; grant: GrantPayload }
  | { type: "SET_DATA"; id: string; data: unknown }
  | { type: "SET_ERROR"; id: string; error: string }
  | { type: "SKIP"; id: string }
  | { type: "SET_STEP"; step: AppStep }
  | { type: "SET_ANALYSIS"; analysis: AnalysisResult }
  | { type: "SET_APP_ERROR"; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_STATUS":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.id ? { ...c, status: action.status, error: null } : c,
        ),
      };
    case "SET_GRANT":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.id ? { ...c, grant: action.grant } : c,
        ),
      };
    case "SET_DATA":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.id ? { ...c, data: action.data, status: "done" } : c,
        ),
      };
    case "SET_ERROR":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.id
            ? { ...c, status: "error", error: action.error }
            : c,
        ),
      };
    case "SKIP":
      return {
        ...state,
        connectors: state.connectors.map((c) =>
          c.id === action.id ? { ...c, status: "skipped" } : c,
        ),
      };
    case "SET_STEP":
      return { ...state, step: action.step, error: null };
    case "SET_ANALYSIS":
      return { ...state, analysis: action.analysis, step: "results" };
    case "SET_APP_ERROR":
      return { ...state, error: action.error, step: "connect" };
    default:
      return state;
  }
}

const initialState: State = {
  connectors: CONNECTORS.map((c) => ({
    id: c.id,
    status: "pending",
    grant: null,
    data: null,
    error: null,
  })),
  step: "connect",
  analysis: null,
  error: null,
};

// ─── Component ──────────────────────────────────────────────

export default function PeakThinkApp() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const connectedData = useMemo(() => {
    const data: Record<string, unknown> = {};
    for (const c of state.connectors) {
      if (c.status === "done" && c.data != null) {
        const def = CONNECTORS.find((d) => d.id === c.id);
        if (def) data[def.scope] = c.data;
      }
    }
    return data;
  }, [state.connectors]);

  const doneCount = state.connectors.filter(
    (c) => c.status === "done" || c.status === "skipped",
  ).length;
  const hasData = Object.keys(connectedData).length > 0;
  const allDone = doneCount === CONNECTORS.length;

  const handleAnalyze = useCallback(async () => {
    dispatch({ type: "SET_STEP", step: "analyzing" });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorData: connectedData }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Analysis failed",
        );
      }
      const { analysis } = (await res.json()) as {
        analysis: AnalysisResult;
      };
      dispatch({ type: "SET_ANALYSIS", analysis });
    } catch (err) {
      dispatch({
        type: "SET_APP_ERROR",
        error: err instanceof Error ? err.message : "Analysis failed",
      });
    }
  }, [connectedData]);

  // ─── Render ───────────────────────────────────────────────

  if (state.step === "results" && state.analysis) {
    return (
      <>
        <Dashboard analysis={state.analysis} />
        <div style={{ marginTop: 32 }}>
          <ChatInterface analysis={state.analysis} />
        </div>
      </>
    );
  }

  return (
    <>
      <ConnectorQueue connectors={state.connectors} dispatch={dispatch} />

      {state.error && (
        <div className="card card-error" style={{ marginTop: 12 }}>
          <p className="text-error" style={{ margin: 0 }}>
            {state.error}
          </p>
        </div>
      )}

      {state.step === "analyzing" ? (
        <div className="analyzing-container">
          <div className="analyzing-brain">{"\uD83E\uDDE0"}</div>
          <div className="analyzing-text">
            Analyzing your sleep-cognition patterns...
          </div>
          <div className="analyzing-bar" />
        </div>
      ) : (
        hasData &&
        allDone && (
          <button
            type="button"
            className="btn-primary"
            onClick={handleAnalyze}
            style={{ width: "100%", marginTop: 20, fontSize: 15, padding: 14 }}
          >
            Analyze My Cognitive Patterns
          </button>
        )
      )}

      {hasData && !allDone && (
        <p
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
            marginTop: 14,
          }}
        >
          Connect or skip all sources to continue
        </p>
      )}
    </>
  );
}
