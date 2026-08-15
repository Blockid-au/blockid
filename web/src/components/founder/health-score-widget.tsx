"use client";

// HealthScoreWidget — Startup Health Score composite gauge.
//
// Visual upgrade: 2-column layout on desktop, estimated valuation displayed,
// grade narrative, share CTA, and actionable priority cards.
//
// Fetches lazily via /api/founder/health-score?startup_id=<id>.
// Supports EN + VI copy.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Share2, TrendingUp, Zap } from "lucide-react";
import type { HealthScoreResult } from "@/lib/health-score";

// ── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    title: "Startup Health Score",
    subtitle: "Your composite strength across SVI, tech, profile and analyses.",
    overall: "Overall",
    grade: "Grade",
    components: {
      svi:      "SVI Score",
      tech:     "Tech Score",
      profile:  "Profile",
      analysis: "Analyses",
    },
    topActions: "Priority Actions",
    loading:    "Calculating health score…",
    error:      "Could not load health score.",
    notRun:     "Not run",
    shareScore: "Share Score",
    viewReport: "Full Report",
    valuationLabel: "Est. Startup Value",
    gradeNarrative: {
      A: "Excellent — investor-ready signal",
      B: "Strong — a few gaps to close",
      C: "Developing — focus on the actions below",
      D: "Early stage — prioritise fundamentals",
      F:  "Getting started — run your first analysis",
    },
  },
  vi: {
    title: "Điểm Sức Khoẻ Startup",
    subtitle: "Điểm tổng hợp SVI, công nghệ, hồ sơ và phân tích.",
    overall: "Tổng Điểm",
    grade: "Hạng",
    components: {
      svi:      "Điểm SVI",
      tech:     "Điểm Tech",
      profile:  "Hồ Sơ",
      analysis: "Phân Tích",
    },
    topActions: "Hành Động Ưu Tiên",
    loading:    "Đang tính điểm sức khoẻ…",
    error:      "Không thể tải điểm sức khoẻ.",
    notRun:     "Chưa chạy",
    shareScore: "Chia Sẻ Điểm",
    viewReport: "Báo Cáo Đầy Đủ",
    valuationLabel: "Định Giá Ước Tính",
    gradeNarrative: {
      A: "Xuất sắc — sẵn sàng cho nhà đầu tư",
      B: "Tốt — cần cải thiện một số điểm",
      C: "Đang phát triển — tập trung vào hành động",
      D: "Giai đoạn đầu — ưu tiên nền tảng",
      F:  "Bắt đầu — chạy phân tích đầu tiên",
    },
  },
} as const;

// ── Colour palette ────────────────────────────────────────────────────────────

type Grade = "A" | "B" | "C" | "D" | "F";

const GRADE_COLOURS: Record<Grade, {
  arc: string; text: string; badge: string; bg: string;
  glow: string; pill: string;
}> = {
  A: {
    arc:  "#06b6d4",
    text: "text-cyan-400",
    badge: "bg-cyan-500/15 text-cyan-200 ring-cyan-400/40",
    bg:   "border-cyan-500/30",
    glow: "rgba(6,182,212,0.12)",
    pill: "bg-cyan-500/20 text-cyan-300",
  },
  B: {
    arc:  "#10b981",
    text: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40",
    bg:   "border-emerald-500/30",
    glow: "rgba(16,185,129,0.12)",
    pill: "bg-emerald-500/20 text-emerald-300",
  },
  C: {
    arc:  "#f59e0b",
    text: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-200 ring-amber-400/40",
    bg:   "border-amber-500/30",
    glow: "rgba(245,158,11,0.10)",
    pill: "bg-amber-500/20 text-amber-300",
  },
  D: {
    arc:  "#f97316",
    text: "text-orange-400",
    badge: "bg-orange-500/15 text-orange-200 ring-orange-400/40",
    bg:   "border-orange-500/30",
    glow: "rgba(249,115,22,0.10)",
    pill: "bg-orange-500/20 text-orange-300",
  },
  F: {
    arc:  "#ef4444",
    text: "text-red-400",
    badge: "bg-red-500/15 text-red-200 ring-red-400/40",
    bg:   "border-red-500/30",
    glow: "rgba(239,68,68,0.10)",
    pill: "bg-red-500/20 text-red-300",
  },
};

// ── Valuation estimation (mirrors dashboard logic) ────────────────────────────

function estimateValuation(score: number): string {
  let raw: number;
  if (score < 30)       raw = Math.round(score * 3000);
  else if (score <= 50) raw = Math.round(50_000 + (score - 30) * 22_500);
  else if (score <= 70) raw = Math.round(500_000 + (score - 50) * 75_000);
  else if (score <= 85) raw = Math.round(2_000_000 + (score - 70) * 200_000);
  else if (score <= 120) raw = Math.round(5_000_000 + (score - 85) * 142_857);
  else raw = Math.round(10_000_000 + (score - 120) * 250_000);

  if (raw >= 1_000_000) return `A$${(raw / 1_000_000).toFixed(1)}M`;
  if (raw >= 1_000) return `A$${(raw / 1_000).toFixed(0)}K`;
  return `A$${raw.toLocaleString()}`;
}

// ── SVG arc gauge ─────────────────────────────────────────────────────────────

const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ArcGauge({ score, grade }: { score: number; grade: Grade }) {
  const colours = GRADE_COLOURS[grade];
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="relative flex items-center justify-center">
      {/* Glow ring */}
      <div
        className="absolute inset-0 rounded-full blur-xl"
        style={{ background: colours.glow }}
      />
      <svg width={148} height={148} viewBox="0 0 148 148" className="rotate-[-90deg]" aria-hidden="true">
        {/* Track */}
        <circle cx={74} cy={74} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} />
        {/* Coloured fill arc */}
        <circle
          cx={74} cy={74} r={RADIUS}
          fill="none"
          stroke={colours.arc}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 6px ${colours.arc}88)` }}
        />
      </svg>
      {/* Centre */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-extrabold tabular-nums ${colours.text}`}>{score}</span>
        <span className="text-[10px] text-[#94A3B8] uppercase tracking-widest mt-1">/ 100</span>
      </div>
    </div>
  );
}

// ── Component progress bar ────────────────────────────────────────────────────

function ComponentBar({ label, value, nullLabel }: { label: string; value: number | null; nullLabel: string }) {
  const pct = value ?? 0;
  const colour =
    pct >= 80 ? "from-cyan-500 to-cyan-400"
    : pct >= 65 ? "from-emerald-500 to-emerald-400"
    : pct >= 50 ? "from-amber-500 to-amber-400"
    : pct >= 35 ? "from-orange-500 to-orange-400"
    : "from-red-500 to-red-400";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[#94A3B8]">{label}</span>
        <span className="text-xs font-semibold text-[#F8FAFC]">
          {value == null ? nullLabel : `${Math.round(pct)}`}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className={`h-2 rounded-full bg-gradient-to-r ${colour} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Priority action card ──────────────────────────────────────────────────────

function ActionCard({ action, index }: { action: string; index: number }) {
  const rankColors = ["text-cyan-400", "text-emerald-400", "text-amber-400"];
  const bgColors = ["bg-cyan-500/10 border-cyan-500/20", "bg-emerald-500/10 border-emerald-500/20", "bg-amber-500/10 border-amber-500/20"];
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${bgColors[index] ?? "bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)]"}`}>
      <span className={`text-sm font-bold shrink-0 mt-0.5 ${rankColors[index] ?? "text-[#94A3B8]"}`}>
        {index + 1}.
      </span>
      <span className="text-xs text-[#CBD5E1] leading-relaxed">{action}</span>
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
    if (!startupId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/founder/health-score?startup_id=${encodeURIComponent(startupId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as { ok: boolean } & HealthScoreResult;
        if (!cancelled && json.ok) setResult(json);
        else if (!cancelled) setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [startupId]);

  const colours = result ? GRADE_COLOURS[result.grade] : GRADE_COLOURS["F"];
  const sviScore = result?.components.sviScore;
  const valuation = sviScore ? estimateValuation(sviScore) : null;

  return (
    <div className={`bg-[rgba(255,255,255,0.04)] border backdrop-blur-sm rounded-2xl overflow-hidden transition-all duration-300 hover:border-[rgba(0,212,255,0.3)] ${result ? colours.bg : "border-[rgba(255,255,255,0.08)]"}`}>

      {/* Header stripe */}
      <div className="px-6 pt-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#00D4FF] font-semibold">{c.title}</p>
            <p className="text-xs text-[#94A3B8] mt-0.5">{c.subtitle}</p>
          </div>
          {result && (
            <Link
              href="/workspace/reports"
              className="flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] hover:text-[#00D4FF] transition-colors"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              {c.viewReport}
            </Link>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <span className="text-sm text-[#94A3B8] animate-pulse">{c.loading}</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-center py-10">
          <span className="text-sm text-red-400">{c.error}</span>
        </div>
      )}

      {!loading && !error && result && (
        <div className="p-6">
          {/* 2-column layout: gauge + components */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left: gauge, grade badge, valuation */}
            <div className="flex flex-col items-center gap-4">
              <ArcGauge score={result.overall} grade={result.grade} />

              {/* Grade + narrative */}
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-12 h-12 rounded-xl text-3xl font-extrabold ring-1 ${colours.badge}`}>
                  {result.grade}
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wider font-medium">{c.grade}</p>
                  <p className="text-xs text-[#CBD5E1] mt-0.5 max-w-[160px] leading-relaxed">
                    {c.gradeNarrative[result.grade]}
                  </p>
                </div>
              </div>

              {/* Valuation estimate */}
              {valuation && (
                <div className="w-full rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] p-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-[#94A3B8]" />
                    <p className="text-[10px] uppercase tracking-widest text-[#94A3B8] font-medium">{c.valuationLabel}</p>
                  </div>
                  <p className="text-2xl font-extrabold bg-gradient-to-r from-[#00D4FF] to-[#3B82F6] bg-clip-text text-transparent">
                    {valuation}
                  </p>
                  <p className="text-[10px] text-[#94A3B8] mt-1">Based on your SVI Score</p>
                </div>
              )}

              {/* Share CTA */}
              <Link
                href={`/workspace/reports`}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.06)] px-4 py-2.5 text-sm font-semibold text-[#00D4FF] hover:bg-[rgba(0,212,255,0.12)] transition-colors"
              >
                <Share2 className="h-4 w-4" />
                {c.shareScore}
              </Link>
            </div>

            {/* Right: component bars + actions */}
            <div className="flex flex-col gap-5">
              {/* Component bars */}
              <div className="space-y-3">
                <ComponentBar label={c.components.svi}      value={result.components.sviScore}            nullLabel={c.notRun} />
                <ComponentBar label={c.components.tech}     value={result.components.techScore}           nullLabel={c.notRun} />
                <ComponentBar label={c.components.profile}  value={result.components.profileCompleteness} nullLabel="0" />
                <ComponentBar label={c.components.analysis} value={result.components.analysisCompleteness} nullLabel="0" />
              </div>

              {/* Priority actions */}
              {result.topActions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Zap className="h-3.5 w-3.5 text-[#00D4FF]" />
                    <p className="text-xs uppercase tracking-wider text-[#94A3B8] font-semibold">{c.topActions}</p>
                  </div>
                  <div className="space-y-2">
                    {result.topActions.slice(0, 3).map((action, i) => (
                      <ActionCard key={i} action={action} index={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
