"use client";

import type { AnalysisResult } from "@/lib/types";

// ─── SVG Score Ring ─────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="score-ring-container">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        className="score-ring-svg"
      >
        <defs>
          <linearGradient
            id="scoreGradient"
            x1="0"
            y1="60"
            x2="120"
            y2="60"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={radius} className="score-ring-bg" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="score-ring-fill"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-ring-text">
        <span className="score-ring-number">{score}</span>
        <span className="score-ring-label">Score</span>
      </div>
    </div>
  );
}

// ─── Heatmap Cell ───────────────────────────────────────────

function HeatCell({ value }: { value: number }) {
  const clamped = Math.max(1, Math.min(5, Math.round(value)));
  return <div className={`heatmap-cell heat-${clamped}`}>{clamped}</div>;
}

// ─── Quality Dots ───────────────────────────────────────────

function QualityDots({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="quality-dots">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={`quality-dot ${i < Math.round(value) ? "quality-dot-filled" : ""}`}
        />
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

interface Props {
  analysis: AnalysisResult;
}

export default function Dashboard({ analysis }: Props) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      {/* ═══ Hero Score Card ═══ */}
      <div className="hero-card fade-in fade-in-1">
        <div className="hero-content">
          <div className="hero-score-ring">
            <ScoreRing score={analysis.overallScore} />
          </div>
          <div className="hero-details">
            <div className="hero-label">Cognitive Performance</div>
            <p className="hero-summary">{analysis.summary}</p>
            <div className="score-breakdown">
              <div className="score-item">
                <span className="score-item-label">Sleep Impact</span>
                <span className="score-item-value amber">
                  {analysis.sleepImpactScore}
                </span>
              </div>
              <div className="score-item">
                <span className="score-item-label">Think Quality</span>
                <span className="score-item-value cyan">
                  {analysis.thinkingQualityScore}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Correlations ═══ */}
      <div className="fade-in fade-in-2 section-gap">
        <div className="section-title">Sleep-Think Correlations</div>
        <div className="correlations-grid">
          {analysis.correlations.map((c, i) => (
            <div key={i} className="correlation-card">
              <div className="correlation-header">
                <span className="correlation-title">{c.title}</span>
                <span className={`correlation-impact impact-${c.impact}`}>
                  {c.impact}
                </span>
              </div>
              <p className="correlation-finding">{c.finding}</p>
              <span
                className={`correlation-direction direction-${c.direction}`}
              >
                {c.direction === "positive" ? "\u2191" : "\u2193"} {c.direction}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="section-divider" />

      {/* ═══ Weekly Heatmap ═══ */}
      <div className="fade-in fade-in-3">
        <div className="section-title">Your Weekly Rhythm</div>
        <div className="card">
          <div className="heatmap-grid">
            <div className="heatmap-header" />
            {days.map((d) => (
              <div key={d} className="heatmap-header">
                {d}
              </div>
            ))}

            <div className="heatmap-row-label">Sleep</div>
            {analysis.weeklyPattern.map((wp, i) => (
              <HeatCell key={`sleep-${i}`} value={wp.sleepQuality} />
            ))}

            <div className="heatmap-row-label">Readiness</div>
            {analysis.weeklyPattern.map((wp, i) => (
              <HeatCell key={`ready-${i}`} value={wp.readiness} />
            ))}

            <div className="heatmap-row-label">Thinking</div>
            {analysis.weeklyPattern.map((wp, i) => (
              <HeatCell key={`think-${i}`} value={wp.thinkingQuality} />
            ))}
          </div>

          <div className="heatmap-legend">
            <span>Low</span>
            <div className="legend-cell heat-1" />
            <div className="legend-cell heat-2" />
            <div className="legend-cell heat-3" />
            <div className="legend-cell heat-4" />
            <div className="legend-cell heat-5" />
            <span>Peak</span>
          </div>
        </div>
      </div>

      <div className="section-divider" />

      {/* ═══ Conversation Breakdown ═══ */}
      <div className="fade-in fade-in-4">
        <div className="section-title">Conversation Breakdown</div>
        <div className="breakdown-list">
          {analysis.conversationBreakdown.map((cat, i) => (
            <div key={i} className="breakdown-item">
              <div className="breakdown-bar-container">
                <div className="breakdown-label-row">
                  <span className="breakdown-category">{cat.category}</span>
                  <span className="breakdown-pct">{cat.percentage}%</span>
                </div>
                <div className="breakdown-bar-track">
                  <div
                    className="breakdown-bar-fill"
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
                <div className="breakdown-desc">{cat.description}</div>
              </div>
              <div className="breakdown-quality">
                <QualityDots value={cat.quality} />
                <span className="quality-label">Depth</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-divider" />

      {/* ═══ Peak Conditions ═══ */}
      <div className="fade-in fade-in-5">
        <div className="section-title">Peak Conditions</div>
        <div className="conditions-list">
          {analysis.peakConditions.map((pc, i) => (
            <div key={i} className="condition-card">
              <div className={`condition-icon confidence-${pc.confidence}`}>
                {pc.confidence === "high"
                  ? "\u2605"
                  : pc.confidence === "medium"
                    ? "\u25C6"
                    : "\u25CB"}
              </div>
              <div className="condition-content">
                <div className="condition-text">{pc.condition}</div>
                <div className="condition-effect">{pc.effect}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-divider" />

      {/* ═══ Recommendations ═══ */}
      <div className="fade-in fade-in-6">
        <div className="section-title">Recommendations</div>
        <div className="recommendations-list">
          {analysis.recommendations.map((rec, i) => (
            <div
              key={i}
              className={`recommendation-card priority-${rec.priority}`}
            >
              <div className="recommendation-title">{rec.title}</div>
              <div className="recommendation-detail">{rec.detail}</div>
              <span
                className={`recommendation-priority impact-${rec.priority}`}
              >
                {rec.priority} priority
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="section-divider" />

      {/* ═══ Insights ═══ */}
      <div className="fade-in fade-in-7">
        <div className="section-title">Insights</div>
        <div className="card">
          {analysis.insights.map((ins, i) => (
            <div key={i} className="insight-row">
              <span className="insight-badge">{ins.category}</span>
              <span className="insight-detail">{ins.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Data Sources ═══ */}
      <div className="data-sources">
        Based on data from: {analysis.dataSourcesUsed.join(", ")}
      </div>
    </div>
  );
}
