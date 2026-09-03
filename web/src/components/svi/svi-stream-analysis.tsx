"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { computeThreeCaseValuation, formatAud } from "@/lib/svi/three-case-valuation";
import { RunningSviHero } from "./running-svi-hero";
import {
  Users,
  Target,
  Cog,
  TrendingUp,
  Landmark,
  Briefcase,
  Scale,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Dimension metadata ────────────────────────────────────────────────────────

const DIMS: Record<string, { label: string; Icon: LucideIcon; weight: number }> = {
  ftv: { label: "Founder & Team", Icon: Users, weight: 15 },
  mpc: { label: "Market & Problem", Icon: Target, weight: 18 },
  ptd: { label: "Product & Tech", Icon: Cog, weight: 12 },
  tre: { label: "Traction & Revenue", Icon: TrendingUp, weight: 20 },
  cgh: { label: "Cap Table & Governance", Icon: Landmark, weight: 12 },
  iri: { label: "Investor Readiness", Icon: Briefcase, weight: 10 },
  lco: { label: "Legal & Compliance", Icon: Scale, weight: 8 },
  svm: { label: "Strategic Vision & Moat", Icon: Sparkles, weight: 5 },
};

const DIM_KEYS = Object.keys(DIMS);

// ── Types ─────────────────────────────────────────────────────────────────────

type DimStatus = "idle" | "loading" | "complete" | "error";

interface DimState {
  status: DimStatus;
  score: number | null;
  markdown: string | null;
  insights: string[];
  priority: "high" | "medium" | "low" | null;
  errorMsg: string | null;
  expanded: boolean;
}

type SSEEvent =
  | { type: "context"; industry: string; stage: string }
  | { type: "dimension_start"; dimension: string; label: string }
  | {
      type: "dimension_complete";
      dimension: string;
      label: string;
      score: number;
      markdown: string;
      insights: string[];
      priority: "high" | "medium" | "low";
    }
  | { type: "progress"; completed: number; total: number }
  | { type: "done"; totalMs: number }
  | { type: "error"; dimension: string; message: string }
  | { type: "fatal_error"; message: string };

// ── Persistence helpers ───────────────────────────────────────────────────────
// A completed SVI stream costs the founder minutes + provider quota — reload
// mid-flight or right after must not wipe results. Snapshot per-project state
// to localStorage on every dimension_complete + restore on mount if fresh.

const STORAGE_PREFIX = "svi-stream:";
const STORAGE_MAX_AGE_MS = 30 * 60_000; // 30 min

interface PersistedState {
  savedAt: number;
  dimStates: Record<string, DimState>;
  completed: number;
  total: number;
  totalMs: number | null;
  done: boolean;
  industry: string | null;
}

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId || "default"}`;
}

function loadPersisted(projectId: string): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(projectId: string, state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // quota exceeded / disabled — silent
  }
}

function clearPersisted(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(projectId));
  } catch {
    /* no-op */
  }
}

// ── Score colour helpers ──────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return "bg-ink-100 border-ink-200 dark:bg-ink-800 dark:border-ink-700";
  if (score >= 70) return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800";
  if (score >= 40) return "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800";
  return "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800";
}

function scoreBadgeColor(score: number | null): string {
  if (score === null) return "bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-300";
  if (score >= 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  if (score >= 40) return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
}

function priorityBadge(priority: string | null): string {
  if (priority === "high") return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  if (priority === "medium") return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  return "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400";
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-4 w-4 motion-safe:animate-spin text-brand-500"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="20 50"
        opacity="0.3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Markdown renderer (lightweight — just handles **bold** and \n\n) ──────────

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split(/\n\n+/);
  return (
    <div className="space-y-2">
      {lines.map((block, i) => {
        // Handle **Heading:** pattern
        const headingMatch = block.match(/^\*\*([^*]+)\*\*/);
        if (headingMatch) {
          const heading = headingMatch[1];
          const rest = block.slice(headingMatch[0].length).replace(/^:\s*/, "");
          return (
            <div key={i}>
              <p className="text-xs font-semibold text-ink-700 dark:text-ink-200">{heading}</p>
              {rest && (
                <p className="text-xs text-ink-600 dark:text-ink-400 mt-0.5 leading-relaxed">
                  {rest}
                </p>
              )}
            </div>
          );
        }
        // Bullet list items starting with -
        if (block.startsWith("- ")) {
          const items = block.split("\n").filter((l) => l.startsWith("- "));
          return (
            <ul key={i} className="space-y-0.5">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-1.5 text-xs text-ink-600 dark:text-ink-400">
                  <span className="mt-1 h-1 w-1 rounded-full bg-ink-400 shrink-0" />
                  {item.slice(2)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-xs text-ink-600 dark:text-ink-400 leading-relaxed">
            {block}
          </p>
        );
      })}
    </div>
  );
}

// ── Single dimension card ─────────────────────────────────────────────────────

function DimCard({
  dimKey,
  state,
  onToggle,
  onRetry,
  canRetry,
}: {
  dimKey: string;
  state: DimState;
  onToggle: (key: string) => void;
  onRetry: (key: string) => void;
  canRetry: boolean;
}) {
  const meta = DIMS[dimKey];

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-300",
        // Scope pulse to a subtle background so the label + spinner stay
        // readable, and skip motion entirely for users with reduced-motion.
        state.status === "loading" && "motion-safe:animate-pulse border-brand-200 bg-brand-50/50 dark:bg-brand-950/20",
        state.status === "idle" && "border-ink-200 bg-white dark:bg-ink-900 dark:border-ink-800",
        // Error uses red + dashed so it never gets mistaken for the amber
        // "medium score" complete state.
        state.status === "error" && "border-red-300 border-dashed bg-red-50 dark:bg-red-950/20 dark:border-red-800",
        state.status === "complete" && scoreColor(state.score),
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <meta.Icon
          className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-800 dark:text-ink-100 truncate">
              {meta.label}
            </span>
            <span className="text-[10px] text-ink-400 dark:text-ink-500 tabular-nums">
              {meta.weight}% weight
            </span>
          </div>

          {/* Status line */}
          {state.status === "idle" && (
            <p className="text-xs text-ink-400 dark:text-ink-500 mt-0.5">Waiting…</p>
          )}
          {state.status === "loading" && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Spinner />
              <span className="text-xs text-brand-600 dark:text-brand-400">Analysing…</span>
            </div>
          )}
          {state.status === "error" && (
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              {state.errorMsg ?? "Skipped (rate limited)"}
            </p>
          )}
          {state.status === "complete" && state.score !== null && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
                  scoreBadgeColor(state.score),
                )}
              >
                {state.score}/100
              </span>
              {state.priority && (
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                    priorityBadge(state.priority),
                  )}
                >
                  {state.priority} priority
                </span>
              )}
            </div>
          )}
        </div>

        {/* Expand toggle (complete state only) */}
        {state.status === "complete" && (
          <button
            type="button"
            onClick={() => onToggle(dimKey)}
            aria-expanded={state.expanded}
            aria-label={state.expanded ? `Collapse ${meta.label} details` : `View full ${meta.label} details`}
            className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md px-3 text-xs font-medium text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
          >
            {state.expanded ? "Collapse" : "View full"}
          </button>
        )}
        {/* Retry (error state only) — retries just this dimension without
            wiping the other 7 completed scores or burning full API quota. */}
        {state.status === "error" && canRetry && (
          <button
            type="button"
            onClick={() => onRetry(dimKey)}
            aria-label={`Retry ${meta.label} analysis`}
            className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md px-3 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      {/* Insights (always visible when complete) */}
      {state.status === "complete" && state.insights.length > 0 && (
        <div className="px-4 pb-2 space-y-1 motion-safe:animate-in motion-safe:fade-in duration-300">
          {state.insights.slice(0, 2).map((insight, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
              <p className="text-xs text-ink-600 dark:text-ink-400 leading-snug">{insight}</p>
            </div>
          ))}
        </div>
      )}

      {/* Full markdown (expandable) */}
      {state.status === "complete" && state.expanded && state.markdown && (
        <div className="border-t border-ink-100 dark:border-ink-800 px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 duration-200">
          <SimpleMarkdown text={state.markdown} />
        </div>
      )}
    </div>
  );
}

// ── Sector cohort widget ──────────────────────────────────────────────────────
// Fetches the anonymised sector aggregate published at /api/index/svi and
// tells the founder where they sit — "your SVI 63 vs SaaS median 58, top 42%".
// Anchor validation that costs zero extra AI budget.

interface SectorRow {
  sector: string;
  count: number;
  medianSvi: number;
  p25?: number;
  p50?: number;
  p75?: number;
}

// Linear-interpolate the founder's percentile given the sector's p25/p50/p75.
// Returns null when we don't have enough shape to place them meaningfully.
function computeTopPercent(x: number, row: SectorRow): number | null {
  const p25 = row.p25 ?? null;
  const p50 = row.p50 ?? row.medianSvi ?? null;
  const p75 = row.p75 ?? null;
  if (p50 == null) return null;
  // If the p25/p75 spread is zero (small sample all identical), fall back
  // to "top 50%" if above the median and "bottom 50%" otherwise — coarse
  // but honest.
  if (p25 == null || p75 == null || p25 === p75) {
    return x >= p50 ? 50 : null;
  }
  let percentile: number;
  if (x <= p25) percentile = (x / Math.max(p25, 1)) * 25;
  else if (x <= p50) percentile = 25 + ((x - p25) / (p50 - p25)) * 25;
  else if (x <= p75) percentile = 50 + ((x - p50) / (p75 - p50)) * 25;
  else percentile = Math.min(95, 75 + ((x - p75) / Math.max(p75 * 0.3, 1)) * 25);
  const top = Math.round((100 - percentile) / 5) * 5;
  return Math.max(5, Math.min(95, top));
}

function SectorCohortWidget({ userTotal, industry }: { userTotal: number; industry: string | null }) {
  const [row, setRow] = useState<SectorRow | null>(null);
  const [isOverallFallback, setIsOverallFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If we know the founder's industry, prefer sector-scoped bucket.
        // Otherwise fall back to the platform-wide overall aggregate so the
        // widget always renders something useful instead of silently hiding.
        if (industry) {
          const res = await fetch("/api/index/svi?bucket=sector&format=json");
          if (res.ok) {
            const body = await res.json() as { data?: SectorRow[]; sectors?: SectorRow[] };
            const arr = body.data ?? body.sectors ?? [];
            const key = industry.toLowerCase().trim();
            const match = arr.find((r) => r.sector?.toLowerCase() === key);
            if (match) {
              if (!cancelled) setRow(match);
              return;
            }
          }
        }
        // Fallback path — hit the overall bucket. Same shape (single-row summary).
        const overRes = await fetch("/api/index/svi?bucket=overall&format=json");
        if (!overRes.ok) throw new Error(`http ${overRes.status}`);
        const overBody = await overRes.json() as {
          data?: {
            count: number;
            medianSvi: number;
            p10?: number;
            p25?: number;
            p50?: number;
            p75?: number;
            p90?: number;
          };
        };
        const o = overBody.data;
        if (!o) throw new Error("no overall");
        if (!cancelled) {
          setRow({
            sector: "overall",
            count: o.count,
            medianSvi: o.medianSvi,
            p25: o.p25,
            p50: o.p50 ?? o.medianSvi,
            p75: o.p75,
          });
          setIsOverallFallback(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [industry]);

  if (failed) return null;
  if (!row) return null;

  const median = row.medianSvi ?? row.p50 ?? null;
  if (median == null) return null;
  const sectorLabel = isOverallFallback
    ? "Platform"
    : row.sector.charAt(0).toUpperCase() + row.sector.slice(1);

  if (row.count < 5) {
    return (
      <p className="text-xs text-ink-500 dark:text-ink-500 border-t border-brand-200/50 dark:border-brand-800/50 pt-3">
        {sectorLabel} sample too small to compare (n={row.count}).
      </p>
    );
  }

  const topPct = computeTopPercent(userTotal, row);
  return (
    <div className="border-t border-brand-200/50 dark:border-brand-800/50 pt-3 space-y-1 text-xs text-brand-700 dark:text-brand-300">
      <p className="flex items-baseline gap-2 flex-wrap">
        <span>Your SVI</span>
        <strong className="font-semibold tabular-nums text-sm">{userTotal}</strong>
        <span className="text-ink-500 dark:text-ink-400">·</span>
        <span>{sectorLabel} median</span>
        <strong className="font-semibold tabular-nums text-sm">{Math.round(median)}</strong>
      </p>
      <p className="text-ink-600 dark:text-ink-400">
        {topPct !== null ? (
          <>Top <strong className="font-semibold tabular-nums text-brand-700 dark:text-brand-300">{topPct}%</strong> of {row.count} peers.</>
        ) : (
          <>Compared against {row.count} peers.</>
        )}
      </p>
    </div>
  );
}

// ── Three-case valuation cards ───────────────────────────────────────────────
// Renders worst / average / best case ranges (AUD) computed from the SVI
// total + stage + industry. Deterministic — same inputs → same output.

function ThreeCaseValuationCards({
  svi,
  stage,
  industry,
}: {
  svi: number;
  stage: string | null;
  industry: string | null;
}) {
  const v = computeThreeCaseValuation(svi, stage, industry);
  const cards: Array<{
    key: "worst" | "average" | "best";
    label: string;
    range: { low: number; mid: number; high: number };
    tone: string;
    swatch: string;
  }> = [
    {
      key: "worst",
      label: "Worst case",
      range: v.worst,
      tone: "border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20",
      swatch: "text-red-700 dark:text-red-300",
    },
    {
      key: "average",
      label: "Average case",
      range: v.average,
      tone: "border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-950/30",
      swatch: "text-brand-700 dark:text-brand-300",
    },
    {
      key: "best",
      label: "Best case",
      range: v.best,
      tone: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20",
      swatch: "text-emerald-700 dark:text-emerald-300",
    },
  ];
  return (
    <div className="border-t border-brand-200/50 dark:border-brand-800/50 pt-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-xs uppercase tracking-[0.14em] text-ink-600 dark:text-ink-400 font-semibold">
          Directional pre-money valuation ({v.stage.replace("_", " ")} · {v.sector})
        </p>
        <span className="text-[10px] text-ink-500 dark:text-ink-500">
          {v.currency} · rounded
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {cards.map((c) => (
          <div
            key={c.key}
            className={cn(
              "rounded-lg border px-3 py-2.5",
              c.tone,
            )}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-600 dark:text-ink-400">
              {c.label}
            </p>
            <p className={cn("mt-1 text-lg font-bold tabular-nums leading-tight", c.swatch)}>
              {formatAud(c.range.mid)}
            </p>
            <p className="text-[11px] text-ink-500 dark:text-ink-400 tabular-nums">
              {formatAud(c.range.low)} – {formatAud(c.range.high)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-ink-500 dark:text-ink-500 leading-snug">
        {v.disclaimer}
      </p>
    </div>
  );
}

// ── Email report + deeper-CTA panel (Wave 21) ────────────────────────────────
// Two founder actions after the done-state renders:
//  1. "Email me this report" — captures address + POSTs to
//     /api/pitchdeck/email-report so the founder can walk away and pick
//     it up in their inbox alongside the browser Notification (Wave 18).
//  2. "Detailed breakdown by 13 investor criteria" — links to the
//     evidence workspace where the 13-criteria coverage heatmap lives.

function EmailReportPanel({
  totalSVI,
  dimResults,
  pitchdeckId,
}: {
  totalSVI: number;
  dimResults: Record<string, { score: number; priority: "high" | "medium" | "low" }>;
  pitchdeckId?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "err">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus("err");
      setErrorMsg("Enter a valid email address.");
      return;
    }
    if (!pitchdeckId) {
      setStatus("err");
      setErrorMsg("Email available only for pitchdeck runs — try the /workspace/pitchdeck-analyze flow.");
      return;
    }
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/pitchdeck/email-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pitchdeckId,
          email: email.trim(),
          totalSVI,
          dimResults,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; sent?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setStatus("err");
        setErrorMsg(body.error ?? `failed_${res.status}`);
        return;
      }
      setStatus(body.sent ? "sent" : "idle");
      if (!body.sent) setErrorMsg("Mailer unavailable — try again later.");
    } catch (err) {
      setStatus("err");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  };
  return (
    <div className="border-t border-brand-200/50 dark:border-brand-800/50 pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs uppercase tracking-[0.14em] text-ink-600 dark:text-ink-400 font-semibold">
          Take this with you
        </p>
        <a
          href="/workspace/svi-evidence"
          className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          Detailed breakdown by 13 investor criteria →
        </a>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="email-report-input" className="sr-only">Email address</label>
        <input
          id="email-report-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          disabled={status === "sending" || status === "sent"}
          className="flex-1 min-w-[200px] min-h-[44px] rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 px-3 py-2 text-sm text-ink-800 dark:text-ink-100 placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={status === "sending" || status === "sent"}
          className={cn(
            "inline-flex items-center justify-center min-h-[44px] rounded-md px-4 text-sm font-semibold text-white transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900",
            status === "sent"
              ? "bg-emerald-600 cursor-default"
              : status === "sending"
                ? "bg-brand-300 cursor-not-allowed opacity-70"
                : "bg-brand-600 hover:bg-brand-700",
          )}
        >
          {status === "sent" ? "Sent ✓" : status === "sending" ? "Sending…" : "Email me the report"}
        </button>
      </div>
      {errorMsg && (
        <p className="text-[11px] text-red-700 dark:text-red-400" role="alert">
          {errorMsg}
        </p>
      )}
      {status === "sent" && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
          Sent — check your inbox in a minute (spam folder if it doesn&rsquo;t land).
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SviStreamAnalysisProps {
  projectId?: string;
  /** Pitchdeck id returned by /api/pitchdeck/classify — enables the
   * "Email me this report" panel in the done state. */
  pitchdeckId?: string;
  /** Restrict the run to a subset of the 8 SVI dimensions. Undefined = all. */
  initialDims?: string[];
  /** Extra context text (e.g. extracted pitchdeck) forwarded as `deckText`
   * on every stream request. Overrides the default snapshot snippet. */
  initialDeckText?: string;
  /** If true, kick off startAnalysis on mount with the initialDims filter. */
  autoStart?: boolean;
  /** Fired once the streaming `done` event lands, with the client-side
   * weighted total + per-dim results. Callers (e.g. the pitchdeck flow)
   * use this to persist a snapshot, log analytics, etc. */
  onDone?: (result: {
    totalSVI: number;
    dimResults: Record<string, { score: number; priority: "high" | "medium" | "low" | null }>;
  }) => void;
  /** "sequential" runs dims one-at-a-time with a short breather between —
   * avoids provider rate-limit bursts. Default "parallel" (fastest). */
  mode?: "parallel" | "sequential";
}

export function SviStreamAnalysis({
  projectId,
  pitchdeckId,
  initialDims,
  initialDeckText,
  autoStart,
  onDone,
  mode,
}: SviStreamAnalysisProps) {
  const [dimStates, setDimStates] = useState<Record<string, DimState>>(() =>
    Object.fromEntries(
      DIM_KEYS.map((k) => [
        k,
        {
          status: "idle",
          score: null,
          markdown: null,
          insights: [],
          priority: null,
          errorMsg: null,
          expanded: false,
        },
      ]),
    ),
  );

  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(8);
  const [done, setDone] = useState(false);
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [notifyOnDone, setNotifyOnDone] = useState(false);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  // Score-delta from the previous stored snapshot — lets the founder see
  // "your SVI is up 6 pts since last week" once they run the analysis.
  const [previousSvi, setPreviousSvi] = useState<number | null>(null);
  const [weekDelta, setWeekDelta] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore a recent (< 30 min) run on mount so a page refresh mid-analysis
  // or immediately after done doesn't discard the founder's results.
  useEffect(() => {
    const saved = loadPersisted(projectId ?? "");
    if (!saved) return;
    setDimStates(saved.dimStates);
    setCompleted(saved.completed);
    setTotal(saved.total);
    setTotalMs(saved.totalMs);
    setDone(saved.done);
    setIndustry(saved.industry);
    setRestoredFromCache(true);
  }, [projectId]);

  // Score-delta: fetch the last-persisted SVI snapshot on mount so the
  // done-state (and pre-analysis header) can compare "your last SVI was 57
  // — beat it this time?". Silent on error so the widget just doesn't render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/svi/history", { credentials: "same-origin" });
        if (!res.ok) return;
        const body = await res.json() as {
          ok?: boolean;
          currentSVI?: number;
          weekDelta?: number;
        };
        if (!body.ok || cancelled) return;
        if (typeof body.currentSVI === "number") setPreviousSvi(body.currentSVI);
        if (typeof body.weekDelta === "number") setWeekDelta(body.weekDelta);
      } catch {
        /* silent */
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Snapshot to localStorage whenever a scored dimension lands or we hit done,
  // so the restore-on-mount above has something to hydrate from.
  useEffect(() => {
    const anyComplete = Object.values(dimStates).some((d) => d.status === "complete");
    if (!anyComplete && !done) return;
    savePersisted(projectId ?? "", {
      savedAt: Date.now(),
      dimStates,
      completed,
      total,
      totalMs,
      done,
      industry,
    });
  }, [dimStates, completed, total, totalMs, done, industry, projectId]);

  const updateDim = useCallback(
    (key: string, patch: Partial<DimState>) => {
      setDimStates((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...patch },
      }));
    },
    [],
  );

  const toggleExpand = useCallback((key: string) => {
    setDimStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], expanded: !prev[key].expanded },
    }));
  }, []);

  const reset = useCallback(() => {
    setDimStates(
      Object.fromEntries(
        DIM_KEYS.map((k) => [
          k,
          {
            status: "idle",
            score: null,
            markdown: null,
            insights: [],
            priority: null,
            errorMsg: null,
            expanded: false,
          },
        ]),
      ),
    );
    setCompleted(0);
    setTotal(8);
    setDone(false);
    setTotalMs(null);
    setFatalError(null);
    setIndustry(null);
    setStage(null);
    setRestoredFromCache(false);
    clearPersisted(projectId ?? "");
  }, [projectId]);

  const startAnalysis = useCallback(async (dimsFilter?: string[]) => {
    // Full-run: clear all cards. Retry: only touch the cards being re-run so
    // we don't wipe the other 7 completed scores.
    if (dimsFilter && dimsFilter.length > 0) {
      setFatalError(null);
      setDimStates((prev) => {
        const next: Record<string, DimState> = { ...prev };
        for (const k of dimsFilter) {
          next[k] = { ...next[k], status: "loading", errorMsg: null };
        }
        return next;
      });
      setTotal(dimsFilter.length);
      setCompleted(0);
      setDone(false);
    } else {
      reset();
      // Prime every card to "loading" immediately so the grid shows pulsing
      // placeholders during the ~500ms round-trip before the server emits its
      // first dimension_start event — otherwise users stare at 8 idle cards.
      setDimStates((prev) => {
        const primed: Record<string, DimState> = { ...prev };
        for (const k of DIM_KEYS) {
          primed[k] = { ...primed[k], status: "loading" };
        }
        return primed;
      });
    }
    setRunning(true);
    setStartedAt(Date.now());

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/svi/dimensions/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          ...(dimsFilter && dimsFilter.length > 0 ? { dims: dimsFilter } : {}),
          ...(initialDeckText ? { deckText: initialDeckText } : {}),
          ...(mode ? { mode } : {}),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        setFatalError(`Request failed (${res.status}): ${text.slice(0, 200)}`);
        setRunning(false);
        return;
      }

      if (!res.body) {
        setFatalError("No response stream received");
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newlines (SSE message boundary)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(raw) as SSEEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case "context":
              setIndustry(event.industry || null);
              setStage(event.stage || null);
              break;

            case "dimension_start":
              updateDim(event.dimension, { status: "loading" });
              break;

            case "dimension_complete":
              updateDim(event.dimension, {
                status: "complete",
                score: event.score,
                markdown: event.markdown,
                insights: event.insights,
                priority: event.priority,
              });
              break;

            case "error":
              updateDim(event.dimension, {
                status: "error",
                errorMsg: event.message,
              });
              break;

            case "progress":
              setCompleted(event.completed);
              setTotal(event.total);
              break;

            case "done":
              setDone(true);
              setTotalMs(event.totalMs);
              break;

            case "fatal_error":
              setFatalError(event.message);
              break;
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setFatalError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
    }
  }, [projectId, reset, updateDim, initialDeckText, mode]);

  // Auto-start when the parent (e.g. pitchdeck flow) asks for it — kicks
  // off the run with the initialDims filter as soon as the component mounts.
  useEffect(() => {
    if (!autoStart || !initialDims || initialDims.length === 0) return;
    void startAnalysis(initialDims);
    // Only fire once on mount, hence the disabled deps warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire a browser notification when the analysis finishes IF the founder
  // opted in AND the tab isn't already focused. Zero-cost when off.
  useEffect(() => {
    if (!done || !notifyOnDone) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (document.visibilityState === "visible") return;
    if (Notification.permission !== "granted") return;
    try {
      const n = new Notification("SVI analysis complete", {
        body: "Your streaming analysis has finished. Come back to see the score.",
        icon: "/favicon.ico",
        tag: "svi-analysis-done",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch { /* silent */ }
  }, [done, notifyOnDone]);

  // Fire onDone once after the streaming `done` event lands, with the
  // client-computed weighted total. Runs in an effect (not inline in the
  // SSE handler) so state updates from prior dimension_complete events
  // have committed and dimStates reflects the final scores.
  const [doneFired, setDoneFired] = useState(false);
  useEffect(() => {
    if (!done || doneFired || !onDone) return;
    const scored = DIM_KEYS
      .map((k) => ({
        key: k,
        score: dimStates[k].score,
        priority: dimStates[k].priority,
        weight: DIMS[k].weight,
      }))
      .filter((d): d is { key: string; score: number; priority: DimState["priority"]; weight: number } =>
        d.score !== null,
      );
    if (scored.length === 0) return;
    const totalWeight = scored.reduce((acc, d) => acc + d.weight, 0);
    const totalSVI = Math.round(
      scored.reduce((acc, d) => acc + (d.score * d.weight) / totalWeight, 0),
    );
    const dimResults: Record<string, { score: number; priority: "high" | "medium" | "low" | null }> = {};
    for (const d of scored) {
      dimResults[d.key] = { score: d.score, priority: d.priority };
    }
    onDone({ totalSVI, dimResults });
    setDoneFired(true);
  }, [done, doneFired, dimStates, onDone]);

  const stopAnalysis = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const retryDim = useCallback((key: string) => {
    void startAnalysis([key]);
  }, [startAnalysis]);

  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4">
        <div aria-live="polite" aria-atomic="true" className="space-y-1">
          {!running && !done && (
            <>
              <p className="text-sm text-ink-600 dark:text-ink-400">
                Sequential AI analysis across {initialDims?.length ?? total} SVI dimensions. Estimated total{" "}
                <strong className="tabular-nums">
                  ~{Math.max(15, (initialDims?.length ?? total) * 8 + 8)}s
                </strong>{" "}
                (~8s per dimension).
              </p>
              {typeof window !== "undefined" && "Notification" in window && (
                <label className="inline-flex items-center gap-2 text-[11px] text-ink-600 dark:text-ink-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notifyOnDone}
                    onChange={async (e) => {
                      const on = e.target.checked;
                      setNotifyOnDone(on);
                      if (on && Notification.permission === "default") {
                        try { await Notification.requestPermission(); } catch { /* silent */ }
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-ink-300 dark:border-ink-700 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
                  />
                  Notify me when done (browser)
                </label>
              )}
            </>
          )}
          {running && (
            <>
              <p className="text-sm text-brand-700 dark:text-brand-400">
                Analysing {completed} of {total} dimensions…
              </p>
              {startedAt !== null && completed > 0 && completed < total && (
                <p className="text-[11px] text-ink-500 dark:text-ink-400">
                  <span className="tabular-nums">~{Math.max(3, Math.round(((Date.now() - startedAt) / completed) * (total - completed) / 1000))}s</span>{" "}
                  remaining · {Math.round((Date.now() - startedAt) / 1000)}s elapsed
                </p>
              )}
              {startedAt !== null && completed === 0 && (
                <p className="text-[11px] text-ink-500 dark:text-ink-400">
                  Warming up the first dimension…
                </p>
              )}
            </>
          )}
          {done && totalMs !== null && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              All {total} dimensions analysed in {(totalMs / 1000).toFixed(1)}s
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {running && (
            <button
              type="button"
              onClick={stopAnalysis}
              className="inline-flex items-center justify-center min-h-[44px] rounded-lg border border-ink-200 dark:border-ink-700 px-4 text-sm text-ink-600 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={running ? undefined : done ? () => { reset(); void startAnalysis(); } : () => void startAnalysis()}
            disabled={running}
            className={cn(
              "inline-flex items-center justify-center min-h-[44px] rounded-lg px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900",
              running
                ? "bg-brand-300 text-white cursor-not-allowed opacity-70"
                : "bg-brand-600 hover:bg-brand-700 text-white shadow-sm hover:shadow-md active:scale-95",
            )}
          >
            {running ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Analysing…
              </span>
            ) : done ? (
              "Re-analyse"
            ) : (
              "Analyse All Dimensions"
            )}
          </button>
        </div>
      </div>

      {/* Fatal error */}
      {fatalError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <strong>Error:</strong> {fatalError}
        </div>
      )}

      {/* Previous-score reminder — only when we have a stored snapshot AND
          we haven't just displayed the done-state (which has its own delta).
          Nudges the founder to run analysis + shows progress-over-time. */}
      {previousSvi !== null && !done && !running && (
        <div className="rounded-lg border border-ink-200 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-950/40 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
          <span className="text-ink-700 dark:text-ink-300">
            Last SVI: <strong className="font-semibold tabular-nums text-ink-900 dark:text-ink-100">{previousSvi}/100</strong>
            {weekDelta !== null && weekDelta !== 0 && (
              <span className={cn(
                "ml-1.5 tabular-nums",
                weekDelta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
              )}>
                ({weekDelta > 0 ? "+" : ""}{weekDelta} last week)
              </span>
            )}
          </span>
          <span className="text-ink-500 dark:text-ink-400 hidden sm:inline">
            Re-run to see the delta ↓
          </span>
        </div>
      )}

      {/* Restored from cache — lets the founder know these numbers are from
          an earlier run and give them one click to start fresh instead. */}
      {restoredFromCache && !running && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20 px-4 py-2.5 flex items-center justify-between gap-3 text-xs motion-safe:animate-in motion-safe:fade-in duration-300"
        >
          <span className="text-brand-700 dark:text-brand-300">
            Showing your most recent analysis. Re-analyse to refresh.
          </span>
          <button
            type="button"
            onClick={() => { reset(); }}
            aria-label="Discard cached analysis and start fresh"
            className="inline-flex items-center justify-center min-h-[44px] rounded-md px-4 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {/* Progress bar (visible once started) */}
      {(running || done) && !fatalError && (
        <div className="space-y-1.5 motion-safe:animate-in motion-safe:fade-in duration-300">
          <div className="flex justify-between text-xs text-ink-500 dark:text-ink-400">
            <span>{completed}/{total} dimensions complete</span>
            <span>{progressPct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`SVI analysis progress: ${completed} of ${total} dimensions`}
            className="h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden"
          >
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Running SVI hero — Wave 23 Phase A. Weighted total climbs as
          each dim lands so the founder isn't waiting on an inert progress
          bar; also shows a directional 3-case valuation once ≥3 dims
          are in. Same math as the final done-state total for consistency. */}
      {(running || done) && !fatalError && (
        <RunningSviHero
          dims={DIM_KEYS.map((k) => ({
            key: k,
            score: dimStates[k].score,
            weight: DIMS[k].weight,
            label: DIMS[k].label,
          }))}
          stage={stage}
          industry={industry}
          totalCount={total}
          running={running}
          done={done}
        />
      )}

      {/* Dimension cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DIM_KEYS.map((key) => (
          <DimCard
            key={key}
            dimKey={key}
            state={dimStates[key]}
            onToggle={toggleExpand}
            onRetry={retryDim}
            canRetry={!running}
          />
        ))}
      </div>

      {/* Done summary — weighted total + fastest-lift callout */}
      {done && !fatalError && (() => {
        const scored = DIM_KEYS
          .map((k) => ({
            key: k,
            score: dimStates[k].score,
            weight: DIMS[k].weight,
            label: DIMS[k].label,
          }))
          .filter((d): d is { key: string; score: number; weight: number; label: string } =>
            d.score !== null,
          );
        if (scored.length === 0) return null;
        const totalWeight = scored.reduce((acc, d) => acc + d.weight, 0);
        const weightedTotal = scored.reduce(
          (acc, d) => acc + (d.score * d.weight) / totalWeight,
          0,
        );
        const totalSvi = Math.round(weightedTotal);
        const totalBand: "strong" | "developing" | "early" =
          totalSvi >= 70 ? "strong" : totalSvi >= 40 ? "developing" : "early";
        // "Fastest lift" = the two scored-lowest dimensions weighted by
        // impact so improving them moves the total SVI the most.
        const weakest = [...scored]
          .sort((a, b) => (a.score - b.score) || (b.weight - a.weight))
          .slice(0, 2);
        return (
          <div className="rounded-xl border border-brand-200 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-800 px-5 py-4 space-y-3 motion-safe:animate-in motion-safe:fade-in duration-300">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-xs uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300 font-semibold">
                Current SVI
              </span>
              <span
                className={cn(
                  "text-3xl font-bold tabular-nums",
                  totalBand === "strong" && "text-emerald-700 dark:text-emerald-300",
                  totalBand === "developing" && "text-amber-700 dark:text-amber-300",
                  totalBand === "early" && "text-red-700 dark:text-red-300",
                )}
                aria-label={`Weighted SVI total ${totalSvi} out of 100`}
              >
                {totalSvi}
                <span className="text-lg text-ink-500 dark:text-ink-400 font-normal">/100</span>
              </span>
              <span className="text-xs text-ink-500 dark:text-ink-400">
                weighted from {scored.length} of {DIM_KEYS.length} dimensions
              </span>
            </div>
            {/* Band legend — spells out what colour means so a founder isn't
                left guessing what "amber" or "green" implies about fundability. */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]" aria-label="Score band legend">
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 border transition-all",
                totalBand === "early"
                  ? "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/40 dark:border-red-500 dark:text-red-200 font-semibold"
                  : "bg-ink-50 border-ink-200 text-ink-500 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-500",
              )}>
                0–39 · Early
              </span>
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 border transition-all",
                totalBand === "developing"
                  ? "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/40 dark:border-amber-500 dark:text-amber-200 font-semibold"
                  : "bg-ink-50 border-ink-200 text-ink-500 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-500",
              )}>
                40–69 · Developing
              </span>
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 border transition-all",
                totalBand === "strong"
                  ? "bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-500 dark:text-emerald-200 font-semibold"
                  : "bg-ink-50 border-ink-200 text-ink-500 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-500",
              )}>
                70–100 · Investor-ready
              </span>
            </div>
            {weakest.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-[0.14em] text-ink-600 dark:text-ink-400 font-semibold">
                  Fastest way to lift your score
                </p>
                <ul className="space-y-1">
                  {weakest.map((w) => (
                    <li
                      key={w.key}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-ink-700 dark:text-ink-300">
                        <span className="font-medium">{w.label}</span>{" "}
                        <span className="text-ink-500 dark:text-ink-400 tabular-nums">
                          ({w.score}/100 · {w.weight}% weight)
                        </span>
                      </span>
                      <a
                        href={`/workspace/svi-evidence?dim=${w.key}`}
                        className="inline-flex items-center justify-center min-h-[36px] rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-50 dark:focus-visible:ring-offset-brand-950 transition-colors"
                      >
                        Add evidence
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SectorCohortWidget userTotal={totalSvi} industry={industry} />
            {/* Directional 3-case valuation cards — worst / average / best.
                Uses the client-computed SVI total + industry + stage from the
                context SSE event. Zero server call (all math is deterministic). */}
            <ThreeCaseValuationCards svi={totalSvi} stage={stage} industry={industry} />
            {/* Email-me-this-report opt-in + deeper 13-criteria CTA (Wave 21).
                The CTA anchors the founder in "we already ran the 13 canonical
                investor criteria per dim" (Wave 15) but presents an obvious
                path to deeper drill-down via the evidence workspace. */}
            <EmailReportPanel
              totalSVI={totalSvi}
              pitchdeckId={pitchdeckId}
              dimResults={Object.fromEntries(
                scored.map((d) => [
                  d.key,
                  { score: d.score, priority: (dimStates[d.key].priority ?? "medium") as "high" | "medium" | "low" },
                ]),
              )}
            />
            {/* Score-delta versus the last stored snapshot — validates
                improvement over time and gives founders something to beat. */}
            {previousSvi !== null && previousSvi !== totalSvi && (
              <p className="border-t border-brand-200/50 dark:border-brand-800/50 pt-3 text-xs text-brand-700 dark:text-brand-300">
                {totalSvi > previousSvi ? (
                  <>
                    Up{" "}
                    <strong className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      +{totalSvi - previousSvi}
                    </strong>
                    {" "}from your last stored SVI of{" "}
                    <strong className="font-semibold tabular-nums">{previousSvi}</strong>.
                  </>
                ) : (
                  <>
                    Down{" "}
                    <strong className="font-semibold tabular-nums text-red-700 dark:text-red-400">
                      {totalSvi - previousSvi}
                    </strong>
                    {" "}from your last stored SVI of{" "}
                    <strong className="font-semibold tabular-nums">{previousSvi}</strong>.
                    Add evidence to lift the score.
                  </>
                )}
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
