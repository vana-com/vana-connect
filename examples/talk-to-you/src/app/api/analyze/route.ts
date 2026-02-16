// Sends user conversation data + a question to a configured LLM.
// Uses any OpenAI-compatible API (OpenAI, Anthropic proxy, Ollama, etc.)

import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You answer questions about a user based on their ChatGPT conversation history.

You will receive the user's question and their full conversation data. Analyze the data carefully and provide a thoughtful, personalized answer.

Guidelines:
- Be specific — reference concrete examples from their conversations when relevant
- Be insightful but not presumptuous
- If the data doesn't contain enough information to fully answer, say so honestly and answer with what you can
- Keep your response concise but thorough (2-4 paragraphs)
- Write in second person ("you")

IMPORTANT: You must respond with a JSON object (no markdown fences). The format is:
{
  "answer": "Your detailed answer here, using plain text with natural paragraphing.",
  "suggestions": ["Personalized follow-up question 1?", "Follow-up question 2?", "Follow-up question 3?"]
}

The suggestions must be SHORT (max 6 words each), punchy, and personalized. Think chat-bubble style, e.g. "Am I a night owl?", "My top hobby?", "Do I overthink things?".`;

// Vana Personal Server returns data shaped as:
// { data: { "chatgpt.conversations": { data: { conversations: [...] } } } }
function findConversations(obj: unknown): unknown[] | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;

  if (Array.isArray(record.conversations)) return record.conversations;

  for (const val of Object.values(record)) {
    if (!val || typeof val !== "object") continue;
    const found = findConversations(val);
    if (found) return found;
  }
  return null;
}

// ~200K chars ≈ ~50K tokens, fits comfortably in modern LLM context windows
const MAX_CHARS = 200_000;

function prepareData(data: unknown): string {
  const lines: string[] = [];
  let totalLength = 0;

  try {
    const conversations = findConversations(data) ?? [];

    if (conversations.length === 0 && Array.isArray(data)) {
      conversations.push(...data);
    }

    for (const conv of conversations) {
      if (totalLength > MAX_CHARS) break;

      const c = conv as Record<string, unknown>;
      const title = c.title as string | undefined;
      const messages = c.messages as unknown[] | undefined;
      if (!Array.isArray(messages)) continue;

      if (title) {
        const header = `\n## ${title}`;
        lines.push(header);
        totalLength += header.length;
      }

      for (const msg of messages) {
        if (totalLength > MAX_CHARS) break;

        const m = msg as Record<string, unknown>;
        if (typeof m.content !== "string" || !m.content.trim()) continue;

        const role = m.role === "user" ? "User" : "Assistant";
        const line = `${role}: ${m.content.trim()}`;
        lines.push(line);
        totalLength += line.length;
      }
    }
  } catch {
    lines.push(JSON.stringify(data).slice(0, MAX_CHARS));
  }

  const result = lines.join("\n").slice(0, MAX_CHARS);
  console.log(
    `[analyze] Prepared ${result.length} chars from ${lines.length} lines for LLM`,
  );
  return result;
}

export async function POST(request: Request) {
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!apiUrl || !apiKey || !model) {
    return NextResponse.json(
      {
        error:
          "LLM not configured. Set LLM_API_URL, LLM_API_KEY, and LLM_MODEL in .env.local",
      },
      { status: 500 },
    );
  }

  let body: { data: unknown; question: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!body.question?.trim()) {
    return NextResponse.json(
      { error: "Question is required" },
      { status: 400 },
    );
  }

  const prepared = prepareData(body.data);

  const llmRequestBody = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Question: ${body.question.trim()}\n\nHere is the user's ChatGPT conversation data:\n\n${prepared}`,
      },
    ],
    temperature: 0.7,
    max_completion_tokens: 4000,
  };

  console.log(
    `[analyze] Question: "${body.question.trim()}" | Request: ${JSON.stringify(llmRequestBody).length} chars`,
  );

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(llmRequestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[analyze] LLM API error:", response.status, text);
      return NextResponse.json(
        { error: `LLM API returned ${response.status}` },
        { status: 502 },
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    console.log(`[analyze] Response: ${content?.length ?? 0} chars`);

    if (!content) {
      return NextResponse.json(
        { error: "Empty response from LLM" },
        { status: 502 },
      );
    }

    // Parse JSON response with answer + suggestions
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/, "");
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({
        answer: parsed.answer ?? content,
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions
          : [],
      });
    } catch {
      // If JSON parsing fails, return raw text with no suggestions
      return NextResponse.json({ answer: content, suggestions: [] });
    }
  } catch (err) {
    console.error("[analyze] Error:", err);
    return NextResponse.json(
      { error: "Failed to get answer from LLM" },
      { status: 500 },
    );
  }
}
