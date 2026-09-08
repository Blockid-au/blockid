"use client";

// LiveAnalysisStage — shared 3-column shell used by every /analyze
// variant. The variant panel (left) shows what the system is
// physically doing ("reading deck", "visiting site", "classifying
// idea"). The centre column tails the SSE event stream. The right
// column reuses the existing pitchdeck-coverage-grid to visualise
// which dimensions have evidence yet.

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  PitchdeckCoverageGrid,
  type CoverageMap,
} from "@/components/svi/pitchdeck-coverage-grid";
import { AgentLineup } from "./agent-lineup";
import type { AgentStatus } from "./agent-lineup";
import type { AgentRole } from "@/lib/report-pipeline/types";
import type { StageKey } from "@/lib/journey-vocabulary";
import { Loader2 } from "lucide-react";

export type LiveVariant = "deck" | "site" | "idea";

export interface LiveStreamEvent {
  id: string;
  ts: number;
  kind: string;
  message: string;
  detail?: string;
}

export interface LiveAnalysisStageProps {
  variant: LiveVariant;
  stage: StageKey;
  /** Panel component (deck reader / site visitor / idea lab). */
  variantPanel: React.ReactNode;
  /** Ordered SSE-derived events to tail in the centre column. */
  events: LiveStreamEvent[];
  /** Coverage grid state for the right column. */
  coverage: CoverageMap;
  selected: Set<string>;
  onToggleDim: (dim: string) => void;
  speculativeCostPerDim?: Record<string, number>;
  /** Live agent status map for the lineup header. */
  agentStatuses?: Partial<Record<AgentRole, AgentStatus>>;
  /** Whether the stream is still running. */
  running?: boolean;
  className?: string;
}

const VARIANT_HEADER: Record<LiveVariant, { title: string; hint: string }> = {
  deck: {
    title: "Reading your deck",
    hint: "Parsing slides, mapping to Problem / Market / Team / Traction / Ask",
  },
  site: {
    title: "Visiting your site",
    hint: "Fetching pages, detecting stack, extracting signals",
  },
  idea: {
    title: "Classifying your idea",
    hint: "Turning your text into a stage guess before deep-dive dimensions",
  },
};

export function LiveAnalysisStage({
  variant,
  stage,
  variantPanel,
  events,
  coverage,
  selected,
  onToggleDim,
  speculativeCostPerDim = {},
  agentStatuses,
  running = true,
  className,
}: LiveAnalysisStageProps) {
  const streamEndRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  const header = VARIANT_HEADER[variant];

  return (
    <section
      className={cn("flex w-full flex-col gap-4", className)}
      data-testid="live-analysis-stage"
      data-variant={variant}
    >
      <header className="rounded-2xl border border-line-subtle bg-surface-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-tertiary">
              Live analysis
            </p>
            <h2 className="text-lg font-semibold text-primary">
              {header.title}
            </h2>
            <p className="text-xs text-muted">{header.hint}</p>
          </div>
          {running && (
            <span className="inline-flex items-center gap-1 rounded-full bg-action/10 px-2 py-0.5 text-xs text-action">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Streaming…
            </span>
          )}
        </div>
        <div className="mt-3">
          <AgentLineup stage={stage} statuses={agentStatuses} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">{variantPanel}</div>
        <div className="lg:col-span-4">
          <div
            className="flex h-full flex-col rounded-2xl border border-line-subtle bg-surface-raised"
            data-testid="live-event-stream"
          >
            <div className="border-b border-line-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wider text-tertiary">
              Event stream
            </div>
            <div className="max-h-[420px] flex-1 overflow-y-auto px-3 py-2">
              {events.length === 0 ? (
                <p className="text-xs italic text-muted">
                  Waiting for the first event…
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {events.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-md border border-line-subtle bg-surface px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-sm bg-surface-hover px-1 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                          {e.kind}
                        </span>
                        <span className="text-primary">{e.message}</span>
                      </div>
                      {e.detail && (
                        <p className="mt-0.5 pl-1 text-[11px] text-muted">
                          {e.detail}
                        </p>
                      )}
                    </li>
                  ))}
                  <div ref={streamEndRef} />
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-line-subtle bg-surface-raised p-3">
            <PitchdeckCoverageGrid
              coverage={coverage}
              selected={selected}
              onToggle={onToggleDim}
              speculativeCostPerDim={speculativeCostPerDim}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default LiveAnalysisStage;
