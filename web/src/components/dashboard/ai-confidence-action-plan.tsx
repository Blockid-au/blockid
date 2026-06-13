"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Loader2,
  Target,
} from "lucide-react";
import type { SVISubScore } from "@/lib/svi-analysis";

interface ActionPlanItem {
  title: string;
  why: string;
  how: string;
  dimension: string;
  link: { label: string; href: string };
  impact: "high" | "medium" | "low";
}

interface ActionPlanPayload {
  generatedAt: string;
  totalSVI: number;
  actions: ActionPlanItem[];
}

interface Props {
  subs: SVISubScore[];
  initialPlan?: ActionPlanPayload | null;
}

type Confidence = "high" | "medium" | "low";

function confidenceFor(s: SVISubScore): Confidence {
  const evidenceCount = s.evidence?.length ?? 0;
  const gapCount = s.gaps?.length ?? 0;
  if (evidenceCount >= 3 && gapCount <= 1) return "high";
  if (evidenceCount >= 1) return "medium";
  return "low";
}

const CONFIDENCE_META: Record<
  Confidence,
  { label: string; icon: typeof Shield; tone: string }
> = {
  high: {
    label: "High",
    icon: ShieldCheck,
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  medium: {
    label: "Medium",
    icon: Shield,
    tone: "bg-amber-50 text-amber-700 border-amber-200",
  },
  low: {
    label: "Low",
    icon: ShieldAlert,
    tone: "bg-red-50 text-red-700 border-red-200",
  },
};

const IMPACT_TONE: Record<ActionPlanItem["impact"], string> = {
  high: "bg-brand-50 text-brand-700 border-brand-200",
  medium: "bg-surface-100 text-ink-700 border-surface-200",
  low: "bg-surface-50 text-ink-500 border-surface-200",
};

export function AIConfidenceActionPlan({ subs, initialPlan }: Props) {
  const [plan, setPlan] = React.useState<ActionPlanPayload | null>(
    initialPlan ?? null,
  );
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchPlan = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ai/action-plan${refresh ? "?refresh=1" : ""}`,
        { method: "GET" },
      );
      const data = await res.json();
      if (data.ok && data.plan) {
        setPlan(data.plan);
      } else {
        setError(data.reason ?? "Could not load action plan");
      }
    } catch {
      setError("Could not load action plan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initialPlan) fetchPlan(false);
  }, [fetchPlan, initialPlan]);

  return (
    <div className="space-y-6">
      {/* ── Sub-score Confidence panel ───────────────────────────────────── */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
              <Shield strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              Sub-score Confidence
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              How well your evidence supports each dimension.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {subs.map((s) => {
            const c = confidenceFor(s);
            const meta = CONFIDENCE_META[c];
            const Icon = meta.icon;
            return (
              <div
                key={s.key}
                className="flex items-center justify-between rounded-xl border border-surface-200 bg-surface-50/40 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-800 truncate">
                    {s.label}
                  </p>
                  <p className="text-[11px] text-ink-500">
                    Score {Math.round(s.value)}/100 · {s.evidence?.length ?? 0}{" "}
                    evidence · {s.gaps?.length ?? 0} gaps
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold shrink-0 ml-2 ${meta.tone}`}
                >
                  <Icon strokeWidth={1.75} className="h-3 w-3" />
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── AI Action Plan card ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/40 via-white to-white p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
              <Sparkles
                strokeWidth={1.75}
                className="h-4 w-4 text-brand-600"
              />
              AI Action Plan
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Top 3 highest-leverage moves for an Australian founder this week.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchPlan(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50 disabled:opacity-50"
            title="Regenerate action plan"
          >
            {refreshing ? (
              <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw strokeWidth={1.75} className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>

        {loading && !plan && (
          <div className="flex items-center gap-2 text-sm text-ink-500 py-6 justify-center">
            <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
            Generating your AI action plan…
          </div>
        )}

        {error && !plan && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {error}
          </div>
        )}

        {plan && (
          <div className="space-y-3">
            {plan.actions.map((a, i) => (
              <div
                key={`${i}-${a.title}`}
                className="rounded-xl border border-surface-200 bg-white p-4 hover:border-brand-200 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-700 text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-ink-800">
                        {a.title}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${IMPACT_TONE[a.impact]}`}
                      >
                        <Target strokeWidth={2} className="h-2.5 w-2.5" />
                        {a.impact} impact
                      </span>
                      <span className="text-[11px] text-ink-400">
                        · {a.dimension}
                      </span>
                    </div>
                    <p className="text-xs text-ink-600 leading-relaxed">
                      <span className="font-semibold text-ink-700">Why:</span>{" "}
                      {a.why}
                    </p>
                    <p className="text-xs text-ink-600 leading-relaxed mt-1">
                      <span className="font-semibold text-ink-700">How:</span>{" "}
                      {a.how}
                    </p>
                    <Link
                      href={a.link.href}
                      className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-brand-700 hover:text-brand-800"
                    >
                      {a.link.label}
                      <ArrowRight strokeWidth={2} className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-ink-400 text-right">
              Generated{" "}
              {new Date(plan.generatedAt).toLocaleString("en-AU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
