"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useVanaData } from "@opendatalabs/connect/react";
import type { ConnectionStatus } from "@opendatalabs/connect/core";
import AnalysisView from "./AnalysisView";
import type { CareerAnalysis } from "@/lib/analyze";

type AppStep = "connect" | "fetching" | "analyzing" | "results";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  waiting: "Waiting for approval",
  approved: "Approved",
  denied: "Denied",
  expired: "Expired",
  error: "Error",
};

export default function CareerApp() {
  const {
    status,
    data,
    error,
    connectUrl,
    openConnect,
    initConnect,
    fetchData,
    isLoading,
  } = useVanaData({ environment: "dev" });

  const [step, setStep] = useState<AppStep>("connect");
  const [analysis, setAnalysis] = useState<CareerAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const initRef = useRef(false);

  // Auto-init the connect session
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      void initConnect();
    }
  }, [initConnect]);

  // Auto-fetch data once approved
  useEffect(() => {
    if (status === "approved" && !data && !isLoading) {
      setStep("fetching");
      void fetchData();
    }
  }, [status, data, isLoading, fetchData]);

  // Auto-analyze once data arrives
  const runAnalysis = useCallback(async (rawData: Record<string, unknown>) => {
    setStep("analyzing");
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: rawData }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { analysis: result } = await res.json();
      setAnalysis(result);
      setStep("results");
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
      setStep("results");
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (data && !analysis && !isAnalyzing && step !== "results") {
      void runAnalysis(data as Record<string, unknown>);
    }
  }, [data, analysis, isAnalyzing, step, runAnalysis]);

  const stepIndex =
    step === "connect"
      ? 0
      : step === "fetching"
        ? 1
        : step === "analyzing"
          ? 2
          : 3;

  return (
    <div>
      {/* Progress steps */}
      <div className="steps">
        {["Connect data", "Fetch", "Analyze", "Results"].map((_, i) => (
          <div
            key={i}
            className={`step ${i < stepIndex ? "step-done" : i === stepIndex ? "step-active" : ""}`}
          />
        ))}
      </div>

      {/* Step 1: Connect */}
      {step === "connect" && (
        <div className="card">
          <div style={{ marginBottom: 20 }}>
            <div className="field-row">
              <span className="label">Status</span>
              <span
                className={`mono ${
                  status === "waiting"
                    ? "status-waiting"
                    : status === "approved"
                      ? "status-approved"
                      : status === "error" ||
                          status === "denied" ||
                          status === "expired"
                        ? "status-error"
                        : "status-default"
                }`}
              >
                {STATUS_LABEL[status]}
              </span>
            </div>
          </div>

          <p
            style={{
              fontSize: 13,
              color: "#a1a1aa",
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            We&apos;ll request your{" "}
            <strong style={{ color: "#e4e4e7" }}>LinkedIn</strong> profile,
            experience, education, and skills — plus your{" "}
            <strong style={{ color: "#e4e4e7" }}>Spotify</strong> library and
            playlists.
          </p>

          {connectUrl ? (
            <button
              onClick={openConnect}
              className="btn-primary"
              style={{ width: "100%" }}
            >
              Connect with DataConnect
            </button>
          ) : (
            <button disabled className="btn-primary" style={{ width: "100%" }}>
              <span className="spinner" /> Creating session...
            </button>
          )}
        </div>
      )}

      {/* Step 2: Fetching data */}
      {step === "fetching" && (
        <div className="card">
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <span
              className="spinner"
              style={{ width: 24, height: 24, borderWidth: 3 }}
            />
            <p style={{ marginTop: 16, color: "#a1a1aa", fontSize: 14 }}>
              Fetching your LinkedIn and Spotify data...
            </p>
          </div>
        </div>
      )}

      {/* Step 3: Analyzing */}
      {step === "analyzing" && (
        <div className="card">
          <div
            style={{ textAlign: "center", padding: "24px 0" }}
            className="analyzing-pulse"
          >
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Analyzing your career...
            </p>
            <p style={{ color: "#a1a1aa", fontSize: 13 }}>
              AI is reviewing your profile, experience, skills, and music taste
            </p>
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === "results" && analysis && <AnalysisView analysis={analysis} />}

      {/* Errors */}
      {(analysisError ||
        ((status === "error" || status === "denied" || status === "expired") &&
          error)) && (
        <div className="card card-error">
          <p className="text-error" style={{ margin: 0 }}>
            {analysisError ?? error}
          </p>
        </div>
      )}

      {/* Reset */}
      {step !== "connect" && (
        <button
          onClick={() => window.location.reload()}
          className="btn-ghost"
          style={{ marginTop: 12 }}
        >
          Start over
        </button>
      )}
    </div>
  );
}
