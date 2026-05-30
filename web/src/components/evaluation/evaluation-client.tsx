"use client";

import * as React from "react";
import { CRITERIA, CRITERION_KEYS, computeQuality, computeEvaluationProgress } from "@/lib/evaluation-criteria";
import type { QualityLevel } from "@/lib/evaluation-criteria";
import { CriterionCard, type CriterionData } from "./criterion-card";
import { EvaluationProgress } from "./evaluation-progress";
import { Loader2, ClipboardCheck } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyCriterionData(key: string): CriterionData {
  return {
    criterion_key: key,
    text_input: "",
    files: [],
    links: [],
    ai_score: null,
    ai_suggestions: [],
    quality_level: "incomplete",
  };
}

function recalcQuality(d: CriterionData): QualityLevel {
  return computeQuality({
    text_input: d.text_input,
    files: d.files,
    links: d.links,
    ai_score: d.ai_score,
  });
}

// ── Props ────────────────────────────────────────────────────────────────────

interface EvaluationClientProps {
  user: { email: string };
}

// ── Component ────────────────────────────────────────────────────────────────

export function EvaluationClient({ user }: EvaluationClientProps) {
  const [criteriaData, setCriteriaData] = React.useState<
    Record<string, CriterionData>
  >(() => {
    const map: Record<string, CriterionData> = {};
    for (const key of CRITERION_KEYS) {
      map[key] = emptyCriterionData(key);
    }
    return map;
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // ── Fetch criteria data on mount ──────────────────────────────────────────

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch("/api/evaluation");
        if (!res.ok) throw new Error("Failed to load evaluation data");
        const json = await res.json();

        if (cancelled) return;

        const items: CriterionData[] = json.criteria ?? json.data ?? [];
        const map: Record<string, CriterionData> = {};

        // Initialize all keys first with empty data
        for (const key of CRITERION_KEYS) {
          map[key] = emptyCriterionData(key);
        }

        // Overlay fetched data
        for (const item of items) {
          if (item.criterion_key && map[item.criterion_key]) {
            map[item.criterion_key] = {
              criterion_key: item.criterion_key,
              text_input: item.text_input ?? "",
              files: Array.isArray(item.files) ? item.files : [],
              links: Array.isArray(item.links) ? item.links : [],
              ai_score: item.ai_score ?? null,
              ai_suggestions: Array.isArray(item.ai_suggestions)
                ? item.ai_suggestions
                : [],
              quality_level: item.quality_level ?? "incomplete",
            };
          }
        }

        setCriteriaData(map);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Save handler (upsert single criterion) ───────────────────────────────

  const handleSave = React.useCallback(
    async (key: string, updates: Partial<CriterionData>) => {
      setCriteriaData((prev) => {
        const current = prev[key] ?? emptyCriterionData(key);
        const merged = { ...current, ...updates };
        merged.quality_level = recalcQuality(merged);
        return { ...prev, [key]: merged };
      });

      // Persist to API
      try {
        const current = criteriaData[key] ?? emptyCriterionData(key);
        const merged = { ...current, ...updates };

        await fetch("/api/evaluation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            criterionKey: key,
            textInput: merged.text_input,
            files: merged.files,
            links: merged.links,
          }),
        });
      } catch (err) {
        console.error(`Failed to save criterion ${key}:`, err);
      }
    },
    [criteriaData],
  );

  // ── Compute progress and breakdown ────────────────────────────────────────

  const allCriteria = Object.values(criteriaData);
  const progress = computeEvaluationProgress(
    allCriteria.map((c) => ({
      criterion_key: c.criterion_key,
      quality_level: c.quality_level,
    })),
  );

  const qualityBreakdown = {
    exceptional: allCriteria.filter((c) => c.quality_level === "exceptional")
      .length,
    strong: allCriteria.filter((c) => c.quality_level === "strong").length,
    good: allCriteria.filter((c) => c.quality_level === "good").length,
    basic: allCriteria.filter((c) => c.quality_level === "basic").length,
    incomplete: allCriteria.filter((c) => c.quality_level === "incomplete")
      .length,
  };

  // ── Generate report handler ───────────────────────────────────────────────

  function handleGenerateReport() {
    window.location.href = "/workspace/reports?source=evaluation";
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          <span className="ml-3 text-sm text-ink-500">
            Loading evaluation...
          </span>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-6 py-8 text-center">
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            {error}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-xs text-red-600 dark:text-red-400 underline cursor-pointer"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Page heading */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center shrink-0">
          <ClipboardCheck
            strokeWidth={1.75}
            className="h-5 w-5 text-brand-600 dark:text-brand-400"
          />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-ink-100">
            Startup Evaluation
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
            Build your evidence across 13 criteria. The more you provide, the
            stronger your AI-powered valuation report.
          </p>
        </div>
      </div>

      {/* Progress panel */}
      <EvaluationProgress
        progress={progress}
        qualityBreakdown={qualityBreakdown}
        totalCriteria={CRITERION_KEYS.length}
        onGenerateReport={handleGenerateReport}
      />

      {/* Criteria grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {CRITERIA.map((criterion) => (
          <CriterionCard
            key={criterion.key}
            criterion={criterion}
            data={criteriaData[criterion.key] ?? emptyCriterionData(criterion.key)}
            onSave={handleSave}
          />
        ))}
      </div>
    </div>
  );
}
