"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface PhaseStep {
  id: string;
  title: string;
  description: string;
  agentHint: string;
  completed: boolean;
  completedAt: string | null;
  notes: string | null;
}

interface PhaseData {
  phaseId: string;
  order: number;
  title: string;
  subtitle: string;
  leadAgent: string;
  color: string;
  status: string;
  completionPct: number;
  aiRecommendations: string | null;
  steps: PhaseStep[];
}

interface ProgressResponse {
  ok: boolean;
  phases: PhaseData[];
  overallPct: number;
  completedSteps?: number;
  totalSteps?: number;
}

const AGENT_LABELS: Record<string, string> = {
  ceo: "CEO", cto: "CTO", cfo: "CFO", cpo: "CPO", cmo: "CMO",
  cro: "CRO", clo: "CLO", chro: "CHRO", ciso: "CISO", cdo: "CDO", coo: "COO",
};

export function GrowthProgressDashboard() {
  const [data, setData] = React.useState<ProgressResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expandedPhase, setExpandedPhase] = React.useState<string | null>(null);
  const [toggling, setToggling] = React.useState<string | null>(null);
  const [detecting, setDetecting] = React.useState(false);

  const fetchProgress = React.useCallback(async () => {
    try {
      const res = await fetch("/api/svi/phase-progress");
      if (!res.ok) return;
      const json = (await res.json()) as ProgressResponse;
      if (json.ok) setData(json);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchProgress(); }, [fetchProgress]);

  const toggleStep = async (phaseId: string, stepId: string, completed: boolean) => {
    const key = `${phaseId}:${stepId}`;
    setToggling(key);
    try {
      const res = await fetch("/api/svi/phase-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: completed ? "uncomplete_step" : "complete_step",
          phaseId,
          stepId,
        }),
      });
      if (res.ok) await fetchProgress();
    } catch { /* silent */ } finally {
      setToggling(null);
    }
  };

  const autoDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/svi/phase-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_detect" }),
      });
      if (res.ok) await fetchProgress();
    } catch { /* silent */ } finally {
      setDetecting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-48 rounded bg-surface-100" />
          <div className="h-3 w-64 rounded bg-surface-100" />
          <div className="h-4 w-full rounded bg-surface-100 mt-4" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { phases, overallPct, completedSteps, totalSteps } = data;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink-800">Growth Phase Progress</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            12-phase startup development journey · {completedSteps ?? 0}/{totalSteps ?? 60} steps
          </p>
        </div>
        <button
          onClick={autoDetect}
          disabled={detecting}
          className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50"
        >
          {detecting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {detecting ? "Scanning..." : "Auto-Detect"}
        </button>
      </div>

      {/* Overall progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-ink-600">Overall Progress</span>
          <span className="text-xs font-bold text-brand-600">{overallPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-surface-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-700"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Phase list */}
      <div className="space-y-2">
        {phases.map((phase) => {
          const isExpanded = expandedPhase === phase.phaseId;
          const completedCount = phase.steps.filter(s => s.completed).length;
          const phaseTotal = phase.steps.length;

          return (
            <div key={phase.phaseId} className="rounded-xl border border-surface-200 overflow-hidden">
              {/* Phase header */}
              <button
                onClick={() => setExpandedPhase(isExpanded ? null : phase.phaseId)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-50 transition-colors text-left"
              >
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: phase.color }}
                >
                  {phase.order}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-800 truncate">{phase.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 text-ink-500 font-medium shrink-0">
                      {AGENT_LABELS[phase.leadAgent] ?? phase.leadAgent}
                    </span>
                    {phase.status === "completed" && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                    {phase.status === "in_progress" && (
                      <Play className="h-3 w-3 text-brand-500 shrink-0 fill-brand-500" />
                    )}
                  </div>
                  <p className="text-[11px] text-ink-500 truncate">{phase.subtitle}</p>
                </div>

                {/* Mini progress */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 rounded-full bg-surface-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${phase.completionPct}%`,
                        backgroundColor: phase.color,
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-ink-500 w-12 text-right">
                    {completedCount}/{phaseTotal}
                  </span>
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-ink-400" />
                    : <ChevronRight className="h-4 w-4 text-ink-400" />
                  }
                </div>
              </button>

              {/* Expanded steps */}
              {isExpanded && (
                <div className="border-t border-surface-100 px-4 py-3 bg-surface-50/50 space-y-2">
                  {phase.steps.map((step) => {
                    const isToggling = toggling === `${phase.phaseId}:${step.id}`;
                    return (
                      <button
                        key={step.id}
                        onClick={() => toggleStep(phase.phaseId, step.id, step.completed)}
                        disabled={isToggling}
                        className="w-full flex items-start gap-3 text-left group py-1.5"
                      >
                        <div className="mt-0.5 shrink-0">
                          {isToggling ? (
                            <RefreshCw className="h-4 w-4 text-ink-400 animate-spin" />
                          ) : step.completed ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-ink-300 group-hover:text-ink-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm",
                            step.completed ? "text-ink-500 line-through" : "text-ink-800",
                          )}>
                            {step.title}
                          </p>
                          <p className="text-[11px] text-ink-400 mt-0.5">{step.description}</p>
                          {step.notes && (
                            <p className="text-[10px] text-brand-500 mt-0.5 italic">{step.notes}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-ink-400 mt-0.5 shrink-0">
                          {AGENT_LABELS[step.agentHint] ?? step.agentHint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
