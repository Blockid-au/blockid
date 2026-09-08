"use client";

// AgentLineup — horizontal row of C-Level pills showing which agents
// will run for the detected context, along with a model-tier badge and
// current live status.

import * as React from "react";
import type { AgentRole } from "@/lib/report-pipeline/types";
import {
  MODEL_TIER_LABEL,
  type ModelTier,
  type PlannedAgent,
  plannedAgentsFor,
} from "@/lib/analyze/agent-plan";
import type { StageKey } from "@/lib/journey-vocabulary";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  Loader2,
  MinusCircle,
} from "lucide-react";

export type AgentStatus = "queued" | "running" | "done" | "skipped";

const AGENT_LABEL: Record<AgentRole, string> = {
  ceo: "CEO",
  cto: "CTO",
  cfo: "CFO",
  cpo: "CPO",
  cmo: "CMO",
  cro: "CRO",
  clo: "CLO",
  chro: "CHRO",
  ciso: "CISO",
  cdo: "CDO",
  coo: "COO",
};

const TIER_STYLE: Record<ModelTier, string> = {
  opus: "bg-svi-500 text-white",
  sonnet: "bg-action text-on-action",
  haiku: "bg-surface-hover text-secondary",
};

interface AgentPillProps {
  planned: PlannedAgent;
  status: AgentStatus;
}

function AgentPill({ planned, status }: AgentPillProps) {
  const label = AGENT_LABEL[planned.agent];
  const tierLabel = MODEL_TIER_LABEL[planned.tier];
  const isSkipped = status === "skipped";
  const isDone = status === "done";
  const isRunning = status === "running";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        isSkipped
          ? "border-dashed border-line-subtle bg-surface-sunken text-tertiary line-through"
          : isDone
            ? "border-bull bg-bull/10 text-bull"
            : isRunning
              ? "border-action bg-action/10 text-primary"
              : "border-line-subtle bg-surface-raised text-primary",
      )}
      data-testid={`agent-pill-${planned.agent}`}
      aria-label={`${label} — ${tierLabel} — ${status}`}
    >
      {status === "queued" && (
        <Circle className="h-3.5 w-3.5" aria-hidden />
      )}
      {status === "running" && (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      )}
      {status === "done" && (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      )}
      {status === "skipped" && (
        <MinusCircle className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="font-semibold">{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          TIER_STYLE[planned.tier],
        )}
      >
        {tierLabel}
      </span>
    </div>
  );
}

export interface AgentLineupProps {
  /** Stage that drives the lineup (unless `agents` is passed explicitly). */
  stage: StageKey;
  /** Optional override — usually derived from `stage`. */
  agents?: PlannedAgent[];
  /** Map of role → live status. Missing entries default to "queued". */
  statuses?: Partial<Record<AgentRole, AgentStatus>>;
  className?: string;
}

export function AgentLineup({
  stage,
  agents,
  statuses = {},
  className,
}: AgentLineupProps) {
  const lineup = React.useMemo<PlannedAgent[]>(
    () => agents ?? plannedAgentsFor(stage),
    [agents, stage],
  );
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className,
      )}
      data-testid="agent-lineup"
      aria-label={`Agent lineup for ${stage}`}
    >
      {lineup.map((planned) => (
        <AgentPill
          key={planned.agent}
          planned={planned}
          status={statuses[planned.agent] ?? "queued"}
        />
      ))}
    </div>
  );
}

export default AgentLineup;
