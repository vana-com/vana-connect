"use client";

import type { CareerAnalysis, Insight, ScoreBreakdown } from "@/lib/analyze";

function scoreColor(pct: number): string {
  if (pct >= 80) return "#22c55e";
  if (pct >= 60) return "#eab308";
  return "#ef4444";
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = scoreColor(score);

  return (
    <div className="score-ring">
      <div className="score-circle">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} className="score-track" />
          <circle
            cx="40"
            cy="40"
            r={r}
            className="score-fill"
            stroke={color}
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="score-value" style={{ color }}>
          {score}
        </span>
      </div>
      <div className="score-label">
        <strong style={{ color: "#e4e4e7" }}>Profile Completeness</strong>
        <br />
        {score >= 80
          ? "Your LinkedIn profile is well-optimized"
          : score >= 60
            ? "Good foundation — a few gaps to fill"
            : "Significant room for improvement"}
      </div>
    </div>
  );
}

function BreakdownRow({ item }: { item: ScoreBreakdown }) {
  const pct = item.maxScore > 0 ? (item.score / item.maxScore) * 100 : 0;
  return (
    <div className="breakdown-row" title={item.note}>
      <span className="breakdown-label">{item.label}</span>
      <div className="breakdown-bar">
        <div
          className="breakdown-fill"
          style={{ width: `${pct}%`, background: scoreColor(pct) }}
        />
      </div>
      <span className="breakdown-score">
        {item.score}/{item.maxScore}
      </span>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`insight insight-${insight.category}`}>
      <div className="insight-area">{insight.area}</div>
      <div className="insight-title">{insight.title}</div>
      <div className="insight-detail">{insight.detail}</div>
    </div>
  );
}

export default function AnalysisView({
  analysis,
}: {
  analysis: CareerAnalysis;
}) {
  return (
    <div>
      {/* Overall score */}
      <div className="card">
        <ScoreRing score={analysis.overallScore} />
        {analysis.profileCompleteness.map((item, i) => (
          <BreakdownRow key={i} item={item} />
        ))}
      </div>

      {/* Top actions */}
      {analysis.topActions.length > 0 && (
        <div className="card">
          <div className="section-header">Top Actions</div>
          {analysis.topActions.map((action, i) => (
            <div key={i} className="action-item">
              <span className="action-number">{i + 1}.</span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}

      {/* Career insights */}
      {analysis.insights.length > 0 && (
        <div>
          <div
            className="section-header"
            style={{ marginTop: 24, marginBottom: 12 }}
          >
            Career Insights
          </div>
          {analysis.insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}

      {/* Spotify correlations */}
      {analysis.spotifyCorrelations.length > 0 && (
        <div>
          <div
            className="section-header"
            style={{ marginTop: 24, marginBottom: 12 }}
          >
            Music x Career
          </div>
          {analysis.spotifyCorrelations.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
