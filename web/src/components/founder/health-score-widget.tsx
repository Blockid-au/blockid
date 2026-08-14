"use client";

// HealthScoreWidget — Startup Health Score composite gauge.
//
// Shows:
//   • SVG circular arc (stroke-dasharray/dashoffset) — no chart library
//   • Overall score 0-100 in centre, arc coloured by grade
//   • Grade badge (A/B/C/D/F) in matching colour
//   • 4 mini component bars: SVI, Tech, Profile, Analysis
//   • Top 3 recommended next actions with check icons
//
// Fetches lazily via /api/founder/health-score?startup_id=<id>.
// Supports EN + VI copy.

import { useEffect, useState } from "react";
import type { HealthScoreResult } from "@/lib/health-score";

// ── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    title: "Startup Health Score",
    subtitle: "Your composite startup strength across SVI, tech, profile and analyses.",
    overall: "Overall",
    grade: "Grade",
    components: {
      svi: "SVI Score",
      tech: "Tech Score",
      profile: "Profile",
      analysis: "Analyses",
    },
    topActions: "Top Actions",
    loading: "Calculating health score…",
    error: "Could not load health score.",
    notRun: "Not run",
  },
  vi: {
    title: "Điểm Sức Khoẻ Startup",
    subtitle: "Điểm tổng hợp của startup bao gồm SVI, công nghệ, hồ sơ và phân tích.",
    overall: "Tổng Điểm",
    grade: "Hạng",
    components: {
      svi: "Điểm SVI",
      tech: "Điểm Tech",
      profile: "Hồ Sơ",
      analysis: "Phân Tích",
    },
    topActions: "Hành Động Tiếp Theo",
    loading: "Đang tính điểm sức khoẻ…",
    error: "Không thể tải điểm sức khoẻ.",
    notRun: "Chưa chạy",
  },
} as const;

// ── Colour helpers ────────────────────────────────────────────────────────────

type Grade = "A" | "B" | "C" | "D" | "F";

const GRADE_COLOURS: Record<Grade, { arc: string; text: string; badge: string; bg: string }> = {
  A: {
    arc: "#06b6d4",   // cyan-500
    text: "text-cyan-400",
    badge: "bg-cyan-500/15 text-cyan-200 ring-cyan-400/40",
    bg: "border-cyan-500/30",
  },
  B: {
    arc: "#10b981",   // emerald-500
    text: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40",
    bg: "border-emerald-500/30",
  },
  C: {
    arc: "#f59e0b",   // amber-500
    text: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-200 ring-amber-400/40",
    bg: "border-amber-500/30",
  },
  D: {
    arc: "#f97316",   // orange-500
    text: "text-orange-400",
    badge: "bg-orange-500/15 text-orange-200 ring-orange-400/40",
    bg: "border-orange-500/30",
  },
  F: {
    arc: "#ef4444",   // red-500
    text: "text-red-400",
    badge: "bg-red-500/15 text-red-200 ring-red-400/40",
    bg: "border-red-500/30",
  },
};

// ── SVG arc ──────────────────────────────────────────────────────────────────

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const START_OFFSET = 0.75 * CIRCUMFERENCE; // start at top (270deg)

function ArcGauge({ score, grade }: { score: number; grade: Grade }) {
  const colours = GRADE_COLOURS[grade];
  // dashoffset: full circle = 0 progress; 0 = full arc
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width={136}
        height={136}
        viewBox="0 0 136 136"
        className="rotate-[-90deg]"
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={68}
          cy={68}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={10}
        />
        {/* Progress arc */}
        <circle
          cx={68}
          cy={68}
          r={RADIUS}
          fill="none"
          stroke={colours.arc}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      {/* Centre label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${colours.text}`}>{score}</span>
        <span className="text-xs text-[#94A3B8] uppercase tracking-wider mt-0.5">Score</span>
      </div>
    </div>
  );
}

// ── Mini bar ─────────────────────────────────────────────────────────────────

function MiniBar({
  label,
  value,
  nullLabel,
}: {
  label: string;
  value: number | null;
  nullLabel: string;
}) {
  const pct = value ?? 0;
  const colour =
    pct >= 80
      ? "bg-cyan-500"
      : pct >= 65
        ? "bg-emerald-500"
        : pct >= 50
          ? "bg-amber-500"
          : pct >= 35
            ? "bg-orange-500"
            : "bg-red-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#94A3B8]">{label}</span>
        <span className="text-xs font-medium text-[#F8FAFC]">
          {value == null ? nullLabel : `${Math.round(pct)}`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className={`h-1.5 rounded-full ${colour} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  startupId: string;
  lang?: "en" | "vi";
}

export function HealthScoreWidget({ startupId, lang = "en" }: Props) {
  const c = COPY[lang];
  const [result, setResult] = useState<HealthScoreResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!startupId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/founder/health-score?startup_id=${encodeURIComponent(startupId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as { ok: boolean } & HealthScoreResult;
        if (!cancelled && json.ok) {
          setResult(json);
        } else if (!cancelled) {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [startupId]);

  const colours = result ? GRADE_COLOURS[result.grade] : GRADE_COLOURS["F"];

  return (
    <div
      className={`bg-[rgba(255,255,255,0.04)] border backdrop-blur-sm rounded-2xl p-6 transition-all duration-300 hover:border-[rgba(0,212,255,0.3)] ${
        result ? colours.bg : "border-[rgba(255,255,255,0.08)]"
      }`}
    >
      {/* Header */}
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-[#00D4FF] font-medium">
          {c.title}
        </p>
        <p className="text-xs text-[#94A3B8] mt-0.5">{c.subtitle}</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-[#94A3B8] animate-pulse">{c.loading}</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-red-400">{c.error}</span>
        </div>
      )}

      {!loading && !error && result && (
        <>
          {/* Top row: arc + grade badge */}
          <div className="flex items-center gap-6 mb-6">
            <ArcGauge score={result.overall} grade={result.grade} />

            <div className="flex flex-col gap-3">
              {/* Grade badge */}
              <div
                className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl text-4xl font-extrabold ring-1 ${colours.badge}`}
                title={`${c.grade} ${result.grade}`}
                aria-label={`${c.grade}: ${result.grade}`}
              >
                {result.grade}
              </div>
              <div className="text-center">
                <span className="text-xs text-[#94A3B8] uppercase tracking-wider">
                  {c.grade}
                </span>
              </div>
            </div>
          </div>

          {/* Component bars */}
          <div className="space-y-3 mb-6">
            <MiniBar
              label={c.components.svi}
              value={result.components.sviScore}
              nullLabel={c.notRun}
            />
            <MiniBar
              label={c.components.tech}
              value={result.components.techScore}
              nullLabel={c.notRun}
            />
            <MiniBar
              label={c.components.profile}
              value={result.components.profileCompleteness}
              nullLabel="0"
            />
            <MiniBar
              label={c.components.analysis}
              value={result.components.analysisCompleteness}
              nullLabel="0"
            />
          </div>

          {/* Top actions */}
          {result.topActions.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-[#94A3B8] font-medium mb-2">
                {c.topActions}
              </p>
              <ul className="space-y-2">
                {result.topActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-[rgba(0,212,255,0.15)] text-[#00D4FF] flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-2.5 h-2.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="text-xs text-[#CBD5E1]">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
