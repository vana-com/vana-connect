"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import type { AnalysisResult, ChatMessage } from "@/lib/types";

interface Props {
  analysis: AnalysisResult;
}

export default function ChatInterface({ analysis }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, analysis }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Chat request failed",
        );
      }
      const { message } = (await res.json()) as { message: string };
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, analysis]);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  return (
    <div className="card card-glow-violet">
      <div className="section-title" style={{ marginBottom: 12 }}>
        Ask Your AI Coach
      </div>

      {messages.length > 0 && (
        <div className="chat-container" ref={scrollRef}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={`chat-msg ${m.role === "user" ? "chat-msg-user" : "chat-msg-assistant"}`}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="chat-msg chat-msg-assistant">
              <span className="spinner" /> Thinking...
            </div>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          Ask follow-up questions about your cognitive patterns, get
          personalized sleep advice, or explore your data further.
        </p>
      )}

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={1}
          placeholder="e.g. What time should I go to bed for peak performance?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          type="button"
          className="chat-send"
          onClick={() => void send()}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
