"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useVanaData } from "@opendatalabs/connect/react";

const DEFAULT_SUGGESTIONS = [
  "What are my main interests?",
  "How do I communicate?",
  "What kind of thinker am I?",
  "What's my personality like?",
];

const THINKING_MESSAGES = [
  "Reading your conversations…",
  "Finding patterns…",
  "Thinking…",
];

interface QAEntry {
  question: string;
  answer?: string;
  error?: string;
}

interface AnalyzeResult {
  answer: string;
  suggestions: string[];
}

/** Handles one connect → fetch → analyze cycle, then calls back with the result. */
function ConnectSession({
  question,
  onResult,
  onError,
}: {
  question: string;
  onResult: (result: AnalyzeResult) => void;
  onError: (error: string) => void;
}) {
  const { status, data, error, deepLinkUrl, initConnect, fetchData } =
    useVanaData();

  const [phase, setPhase] = useState<"connect" | "fetching" | "analyzing">(
    "connect",
  );
  const [thinkingMsg, setThinkingMsg] = useState(0);

  const initRef = useRef(false);
  const fetchRef = useRef(false);
  const analyzeRef = useRef(false);

  // Auto-init session
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      void initConnect();
    }
  }, [initConnect]);

  // Auto-fetch after approval
  useEffect(() => {
    if (status === "approved" && !fetchRef.current) {
      fetchRef.current = true;
      setPhase("fetching");
      void fetchData();
    }
  }, [status, fetchData]);

  // Auto-analyze after data arrives
  const analyze = useCallback(
    async (conversationData: unknown) => {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: conversationData, question }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Analysis failed (${res.status})`);
        }

        const result: AnalyzeResult = await res.json();
        onResult(result);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to get answer");
      }
    },
    [question, onResult, onError],
  );

  useEffect(() => {
    if (data && phase === "fetching" && !analyzeRef.current) {
      analyzeRef.current = true;
      setPhase("analyzing");
      void analyze(data);
    }
  }, [data, phase, analyze]);

  // SDK errors
  useEffect(() => {
    if (
      (status === "error" || status === "denied" || status === "expired") &&
      error
    ) {
      onError(error);
    }
  }, [status, error, onError]);

  // Rotating thinking message
  useEffect(() => {
    if (phase !== "analyzing") return;
    const interval = setInterval(() => {
      setThinkingMsg((p) => (p + 1) % THINKING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase]);

  const sessionReady = !!deepLinkUrl;

  return (
    <div className="session-card">
      {/* Connect phase */}
      {phase === "connect" && status !== "approved" && (
        <>
          <div className="session-status">
            <span className="spinner" />
            <span>
              {sessionReady ? "Waiting for approval…" : "Creating session…"}
            </span>
          </div>
          {sessionReady && (
            <a
              href={deepLinkUrl}
              className="btn-primary"
              style={{
                display: "inline-block",
                boxSizing: "border-box",
                fontSize: 13,
                textDecoration: "none",
                textAlign: "center",
                width: "100%",
                marginTop: 12,
              }}
            >
              Launch dataConnect
            </a>
          )}
        </>
      )}

      {/* Fetching phase */}
      {phase === "fetching" && (
        <div className="session-status">
          <span className="spinner" />
          <span>Fetching your data…</span>
        </div>
      )}

      {/* Analyzing phase */}
      {phase === "analyzing" && (
        <div className="session-status session-thinking">
          <span className="spinner" />
          <span key={thinkingMsg} className="thinking-text">
            {THINKING_MESSAGES[thinkingMsg]}
          </span>
        </div>
      )}
    </div>
  );
}

export default function AskFlow() {
  const [history, setHistory] = useState<QAEntry[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new content appears
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, currentQuestion]);

  function handleAsk(question: string) {
    setCurrentQuestion(question);
    setInput("");
    setSessionKey((k) => k + 1);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || currentQuestion) return;
    handleAsk(input.trim());
  }

  const handleResult = useCallback(
    (result: AnalyzeResult) => {
      setHistory((h) => [
        ...h,
        { question: currentQuestion!, answer: result.answer },
      ]);
      if (result.suggestions.length > 0) {
        setSuggestions(result.suggestions);
      }
      setCurrentQuestion(null);
    },
    [currentQuestion],
  );

  const handleError = useCallback(
    (error: string) => {
      setHistory((h) => [...h, { question: currentQuestion!, error }]);
      setCurrentQuestion(null);
    },
    [currentQuestion],
  );

  const isActive = !!currentQuestion;
  const isEmpty = history.length === 0 && !isActive;

  return (
    <div className="ask-container">
      {/* Suggestions when empty */}
      {isEmpty && (
        <div className="suggestions">
          <div className="suggestions-label">Try asking:</div>
          <div className="suggestions-grid">
            {suggestions.map((q) => (
              <button
                key={q}
                className="suggestion-chip"
                onClick={() => handleAsk(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat history */}
      {history.map((entry, i) => (
        <div key={i} className="qa-entry">
          <div className="question-row">
            <div className="question-bubble">{entry.question}</div>
          </div>
          {entry.answer && (
            <div className="answer-card">
              <div className="answer-text">{entry.answer}</div>
            </div>
          )}
          {entry.error && (
            <div className="answer-card answer-error">
              <div className="text-error">{entry.error}</div>
            </div>
          )}
        </div>
      ))}

      {/* Active question */}
      {currentQuestion && (
        <div className="qa-entry">
          <div className="question-row">
            <div className="question-bubble">{currentQuestion}</div>
          </div>
          <ConnectSession
            key={sessionKey}
            question={currentQuestion}
            onResult={handleResult}
            onError={handleError}
          />
        </div>
      )}

      {/* Suggestions after answers */}
      {!isEmpty && !isActive && suggestions.length > 0 && (
        <div className="suggestions suggestions-follow-up">
          <div className="suggestions-label">Ask next:</div>
          <div className="suggestions-grid">
            {suggestions.map((q) => (
              <button
                key={q}
                className="suggestion-chip"
                onClick={() => handleAsk(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={bottomRef} />

      {/* Input */}
      <form onSubmit={handleSubmit} className="input-bar">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isActive ? "Waiting for answer…" : "Ask something about your data…"
          }
          disabled={isActive}
        />
        <button
          type="submit"
          className="input-send"
          disabled={isActive || !input.trim()}
        >
          Ask
        </button>
      </form>
    </div>
  );
}
