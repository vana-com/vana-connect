// ── Types ────────────────────────────────────────────────────────────────────

export interface Insight {
  category: "strength" | "improvement" | "observation";
  area: string;
  title: string;
  detail: string;
}

export interface ScoreBreakdown {
  label: string;
  score: number;
  maxScore: number;
  note: string;
}

export interface CareerAnalysis {
  overallScore: number;
  profileCompleteness: ScoreBreakdown[];
  insights: Insight[];
  spotifyCorrelations: Insight[];
  topActions: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function filled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return v > 0;
  return true;
}

// ── Profile completeness (deterministic) ─────────────────────────────────────

function scoreProfileCompleteness(
  data: Record<string, unknown>,
): ScoreBreakdown[] {
  const profile = (data["linkedin.profile"] ?? {}) as Record<string, unknown>;
  const experiences = ((data["linkedin.experience"] as Record<string, unknown>)
    ?.experiences ?? []) as Record<string, unknown>[];
  const education = ((data["linkedin.education"] as Record<string, unknown>)
    ?.education ?? []) as Record<string, unknown>[];
  const skills = ((data["linkedin.skills"] as Record<string, unknown>)
    ?.skills ?? []) as Record<string, unknown>[];

  const checks: ScoreBreakdown[] = [];

  const hasHeadline = filled(profile.headline);
  const headlineGood = hasHeadline && String(profile.headline).length > 30;
  checks.push({
    label: "Headline",
    score: headlineGood ? 2 : hasHeadline ? 1 : 0,
    maxScore: 2,
    note: headlineGood
      ? "Descriptive headline"
      : hasHeadline
        ? "Headline is short — aim for 50+ chars with role + value prop"
        : "Missing headline",
  });

  const aboutLen =
    typeof profile.about === "string" ? profile.about.trim().length : 0;
  checks.push({
    label: "About section",
    score: aboutLen > 200 ? 2 : aboutLen > 0 ? 1 : 0,
    maxScore: 2,
    note:
      aboutLen > 200
        ? "Solid summary"
        : aboutLen > 0
          ? "About section is short"
          : "No About section",
  });

  checks.push({
    label: "Profile photo",
    score: filled(profile.profilePictureUrl) ? 1 : 0,
    maxScore: 1,
    note: filled(profile.profilePictureUrl)
      ? "Photo present"
      : "No photo — profiles with photos get 21x more views",
  });

  checks.push({
    label: "Background image",
    score: filled(profile.backgroundImageUrl) ? 1 : 0,
    maxScore: 1,
    note: filled(profile.backgroundImageUrl) ? "Custom banner" : "No banner",
  });

  const expWithDesc = experiences.filter((e) => filled(e.description));
  checks.push({
    label: "Experience entries",
    score: Math.min(experiences.length, 3),
    maxScore: 3,
    note:
      experiences.length >= 3
        ? `${experiences.length} roles`
        : `Only ${experiences.length} role(s)`,
  });
  checks.push({
    label: "Experience descriptions",
    score: Math.min(expWithDesc.length, 3),
    maxScore: 3,
    note:
      expWithDesc.length >= experiences.length && experiences.length > 0
        ? "All roles described"
        : `${experiences.length - expWithDesc.length} role(s) lack descriptions`,
  });

  checks.push({
    label: "Education",
    score: Math.min(education.length, 2),
    maxScore: 2,
    note:
      education.length >= 1
        ? `${education.length} entries`
        : "No education listed",
  });

  checks.push({
    label: "Skills",
    score:
      skills.length >= 10
        ? 3
        : skills.length >= 5
          ? 2
          : skills.length > 0
            ? 1
            : 0,
    maxScore: 3,
    note:
      skills.length >= 10
        ? `${skills.length} skills`
        : `${skills.length} skills — aim for 15+`,
  });

  const connections =
    typeof profile.connectionsCount === "number" ? profile.connectionsCount : 0;
  checks.push({
    label: "Network size",
    score: connections >= 500 ? 2 : connections >= 100 ? 1 : 0,
    maxScore: 2,
    note:
      connections >= 500
        ? `${connections}+ connections`
        : `${connections} connections`,
  });

  return checks;
}

// ── LLM analysis ─────────────────────────────────────────────────────────────

function buildPrompt(data: Record<string, unknown>): string {
  // Truncate large arrays to keep the prompt reasonable
  const trimmed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "spotify.savedTracks") {
      const tracks = (value as Record<string, unknown>)?.tracks;
      if (Array.isArray(tracks)) {
        trimmed[key] = {
          tracks: tracks.slice(0, 50),
          totalCount: tracks.length,
        };
      } else {
        trimmed[key] = value;
      }
    } else {
      trimmed[key] = value;
    }
  }

  return `You are a career coach analyzing a user's LinkedIn profile and Spotify listening data.

Here is their data (JSON):
\`\`\`json
${JSON.stringify(trimmed, null, 2)}
\`\`\`

Analyze this data and return a JSON object with exactly this shape (no markdown, no extra text — raw JSON only):

{
  "insights": [
    {
      "category": "strength" | "improvement" | "observation",
      "area": "string (e.g. Career trajectory, Skills, Branding)",
      "title": "short headline",
      "detail": "2-3 sentence actionable explanation"
    }
  ],
  "spotifyCorrelations": [
    {
      "category": "strength" | "improvement" | "observation",
      "area": "string (e.g. Music & productivity, Work style, Creativity)",
      "title": "short headline",
      "detail": "2-3 sentence insight connecting their music taste to career patterns"
    }
  ],
  "topActions": [
    "concise actionable recommendation (imperative voice)"
  ]
}

Guidelines:
- Generate 4-6 LinkedIn career insights covering: career trajectory, profile optimization, skills gaps, branding, and networking
- Generate 3-5 Spotify-career correlations that creatively (but plausibly) connect their music taste to work patterns, personality traits, and career advice
- Generate 3-5 top priority actions (most impactful things to do right now)
- Be specific — reference actual data from their profile (job titles, companies, skills, playlist names, artists)
- Be encouraging but honest — don't sugarcoat real gaps
- If Spotify data is missing or empty, still provide 1-2 observations about it`;
}

async function callLLM(prompt: string): Promise<{
  insights: Insight[];
  spotifyCorrelations: Insight[];
  topActions: string[];
}> {
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL ?? "gpt-4o";

  if (!apiUrl || !apiKey) {
    throw new Error("LLM_API_URL and LLM_API_KEY must be set");
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? "";

  // Strip markdown fences if present
  const cleaned = content
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function analyzeCareer(
  data: Record<string, unknown>,
): Promise<CareerAnalysis> {
  const profileCompleteness = scoreProfileCompleteness(data);
  const completenessScore = profileCompleteness.reduce(
    (s, b) => s + b.score,
    0,
  );
  const completenessMax = profileCompleteness.reduce(
    (s, b) => s + b.maxScore,
    0,
  );
  const overallScore =
    completenessMax > 0
      ? Math.round((completenessScore / completenessMax) * 100)
      : 0;

  const prompt = buildPrompt(data);
  const llmResult = await callLLM(prompt);

  return {
    overallScore,
    profileCompleteness,
    insights: llmResult.insights ?? [],
    spotifyCorrelations: llmResult.spotifyCorrelations ?? [],
    topActions: llmResult.topActions ?? [],
  };
}
