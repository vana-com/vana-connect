import { NextResponse } from "next/server";
import { analyzeCareer } from "@/lib/analyze";

export async function POST(request: Request) {
  try {
    const { data } = await request.json();
    const analysis = await analyzeCareer(data);
    return NextResponse.json({ analysis });
  } catch {
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
