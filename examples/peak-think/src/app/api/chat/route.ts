import { NextResponse } from "next/server";
import { config } from "@/config";
import type { AnalysisResult, ChatMessage } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { messages, analysis } = (await request.json()) as {
      messages: ChatMessage[];
      analysis: AnalysisResult;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 },
      );
    }

    const systemPrompt = `You are a cognitive performance coach. You previously analyzed this person's sleep and thinking data and produced the following analysis:

${JSON.stringify(analysis, null, 2)}

Use this analysis to answer their follow-up questions about their cognitive patterns, sleep-thinking correlations, and how to optimize their performance. Be specific, reference data points from the analysis, and suggest concrete actions. Keep responses concise (2-4 paragraphs). The data sources used were: ${analysis.dataSourcesUsed.join(", ")}.`;

    const response = await fetch(config.llm.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[chat] LLM error:", err);
      return NextResponse.json(
        { error: "Chat failed \u2014 LLM returned an error" },
        { status: 502 },
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "Empty response from LLM" },
        { status: 502 },
      );
    }

    return NextResponse.json({ message: content });
  } catch (err) {
    console.error("[chat] error:", err);
    return NextResponse.json(
      { error: "Failed to process chat" },
      { status: 500 },
    );
  }
}
