import type { AnalysisResult } from "./types";

export const MOCK_ANALYSIS: AnalysisResult = {
  overallScore: 78,
  sleepImpactScore: 82,
  thinkingQualityScore: 74,
  summary:
    "Your cognitive performance is strongly correlated with sleep quality. When you achieve 7+ hours of sleep with high readiness scores (above 80), your ChatGPT conversations show significantly more depth, creativity, and sustained focus. Mid-week tends to be your cognitive sweet spot.",
  correlations: [
    {
      title: "Deep Sleep & Creativity",
      finding:
        "When you get 1.5+ hours of deep sleep, your next-day conversations are 42% longer and explore more creative topics like design thinking and brainstorming.",
      impact: "high",
      direction: "positive",
    },
    {
      title: "HRV & Technical Depth",
      finding:
        "High HRV nights (above 45ms) precede days where your technical conversations show deeper problem-solving, with more follow-up questions and iterative refinement.",
      impact: "high",
      direction: "positive",
    },
    {
      title: "Sleep Debt & Focus",
      finding:
        "After 2+ nights of under 6 hours sleep, your conversations become 35% shorter with more surface-level queries and less follow-through on complex topics.",
      impact: "medium",
      direction: "negative",
    },
    {
      title: "REM Sleep & Writing Quality",
      finding:
        "Nights with above-average REM sleep (2+ hours) correlate with more articulate, well-structured prompts and longer creative writing sessions.",
      impact: "medium",
      direction: "positive",
    },
  ],
  weeklyPattern: [
    { day: "Monday", sleepQuality: 3, thinkingQuality: 3, readiness: 3 },
    { day: "Tuesday", sleepQuality: 4, thinkingQuality: 4, readiness: 4 },
    { day: "Wednesday", sleepQuality: 5, thinkingQuality: 5, readiness: 5 },
    { day: "Thursday", sleepQuality: 4, thinkingQuality: 4, readiness: 4 },
    { day: "Friday", sleepQuality: 3, thinkingQuality: 3, readiness: 3 },
    { day: "Saturday", sleepQuality: 2, thinkingQuality: 2, readiness: 2 },
    { day: "Sunday", sleepQuality: 4, thinkingQuality: 3, readiness: 4 },
  ],
  conversationBreakdown: [
    {
      category: "Technical",
      percentage: 35,
      quality: 4,
      description:
        "Code reviews, debugging, and architecture discussions. Strongest after well-rested nights.",
    },
    {
      category: "Creative",
      percentage: 25,
      quality: 4,
      description:
        "Brainstorming, writing, and design exploration. Peaks on Wednesdays.",
    },
    {
      category: "Strategic",
      percentage: 20,
      quality: 3,
      description:
        "Planning, analysis, and decision-making. Most common on Tuesday mornings.",
    },
    {
      category: "Analytical",
      percentage: 12,
      quality: 3,
      description:
        "Data analysis, research synthesis, and critical evaluation.",
    },
    {
      category: "Casual",
      percentage: 8,
      quality: 2,
      description:
        "Quick lookups, simple questions. More frequent on low-sleep days.",
    },
  ],
  peakConditions: [
    {
      condition: "7.5+ hours sleep + readiness > 85",
      effect:
        "Conversations are 45% longer with 2x more follow-up depth. Your best creative and technical work happens here.",
      confidence: "high",
    },
    {
      condition: "Deep sleep > 1.5 hours + HRV > 45ms",
      effect:
        "Technical problem-solving conversations show iterative refinement and more sophisticated approaches.",
      confidence: "high",
    },
    {
      condition: "Consistent bedtime (within 30min window)",
      effect:
        "Next-day conversations start earlier and maintain focus for longer sessions.",
      confidence: "medium",
    },
    {
      condition: "Tuesday or Wednesday + good sleep",
      effect:
        "Your highest-quality thinking of the week. Creative and strategic conversations peak here.",
      confidence: "medium",
    },
  ],
  recommendations: [
    {
      title: "Protect your Wednesday sleep",
      detail:
        "Wednesday is consistently your peak cognitive day. Prioritize 7.5+ hours of sleep on Tuesday night and schedule your most demanding intellectual work for Wednesday morning.",
      priority: "high",
    },
    {
      title: "Create a pre-deep-work sleep protocol",
      detail:
        "Before days with important creative or technical work, aim for bedtime by 10:30 PM. Your data shows this gives you the deep sleep needed for peak performance.",
      priority: "high",
    },
    {
      title: "Batch casual tasks on low-energy days",
      detail:
        "On days following poor sleep (especially Saturdays), limit yourself to lighter tasks. Save complex problem-solving for your peak days.",
      priority: "medium",
    },
    {
      title: "Track your HRV trend",
      detail:
        "Your HRV is a strong predictor of next-day cognitive performance. When you see HRV trending down, consider rescheduling demanding thinking tasks.",
      priority: "medium",
    },
  ],
  insights: [
    {
      category: "Sleep Pattern",
      detail:
        "Your sleep quality peaks mid-week and dips on weekends, likely due to later bedtimes on Friday and Saturday nights.",
    },
    {
      category: "Cognitive Rhythm",
      detail:
        "You have a clear 2-day ramp-up pattern: Monday is warm-up, Tuesday builds momentum, Wednesday peaks. This suggests scheduling critical thinking for mid-week.",
    },
    {
      category: "Recovery",
      detail:
        "Sunday shows good sleep quality but lower thinking quality, suggesting your brain uses Sunday sleep for recovery rather than active performance.",
    },
    {
      category: "Focus Window",
      detail:
        "Your longest, most productive ChatGPT sessions happen within 3 hours of waking on well-rested days, suggesting a morning peak performance window.",
    },
    {
      category: "Creative Trigger",
      detail:
        "High REM sleep nights are followed by more creative conversations. Your brain's overnight processing directly fuels creative output.",
    },
  ],
  dataSourcesUsed: ["oura.sleep", "chatgpt.conversations"],
};
