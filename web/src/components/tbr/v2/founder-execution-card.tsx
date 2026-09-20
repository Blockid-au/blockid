// "Founder Execution" card — the FTV chapter's rubric sub-score (G14-S37).
//
// Reads the deterministic module output `founder/execution.ts:
// founderExecutionSignals` that module-precompute attaches to the FTV
// chapter (from GATHER's founder_profiles read, or the summary the SVI
// signals carry) and renders: the score / 100, the seven rubric rows with
// points and evidence, and the self-reported cap notice. Pure, server-safe
// (no hooks) — the same markup goes to the web report, the PDF and the
// dossier.

import type { DimensionChapter } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { bandText } from "./shared";

export const FOUNDER_EXECUTION_MODULE_ID = "founder/execution.ts:founderExecutionSignals";

export interface FounderExecutionCardRow {
  key: string;
  label: string;
  points: number;
  max: number;
  evidence: string;
  source: string;
}

export interface FounderExecutionCardData {
  executionScore: number;
  rawScore: number;
  capped: boolean;
  capReason?: string;
  capLiftedBy?: string;
  structured: boolean;
  rubricVersion: string;
  breakdown: FounderExecutionCardRow[];
}

export interface FounderExecutionCardProps {
  data: FounderExecutionCardData;
  compact?: boolean;
}

const ROW_LABEL: Record<string, string> = {
  exits: "Prior exits",
  raises: "Prior raises",
  years_in_domain: "Years in domain",
  roles: "Role coverage",
  full_time: "Full-time commitment",
  worked_together: "Worked together before",
  github: "GitHub activity",
};

const DEFAULT_CAP_NOTICE = "Self-reported — capped at 70 until an evaluator checks references or the LinkedIn export confirms years and employers.";

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function sourceLabelFor(capLiftedBy: string | undefined): string {
  if (capLiftedBy === "references_checked") return "references checked by an evaluator";
  if (capLiftedBy === "linkedin_parser") return "confirmed by the LinkedIn export";
  return "self-reported";
}

export interface FounderExecutionChapterLike {
  dim: DimensionChapter["dim"];
  modules: DimensionChapter["modules"];
}

export function founderExecutionFromChapter(chapter: FounderExecutionChapterLike): FounderExecutionCardData | null {
  if (chapter.dim !== "ftv") return null;
  const mod = (chapter.modules ?? []).find((m) => m.id === FOUNDER_EXECUTION_MODULE_ID);
  if (!mod) return null;
  const o = mod.output ?? {};
  const score = num(o.executionScore);
  if (score == null) return null;
  const rawRows = Array.isArray(o.breakdown) ? (o.breakdown as Array<Record<string, unknown>>) : [];
  const breakdown: FounderExecutionCardRow[] = rawRows.map((b) => toRow(b));
  const out: FounderExecutionCardData = {
    executionScore: Math.round(score),
    rawScore: Math.round(num(o.rawScore) ?? score),
    capped: o.capped === true,
    structured: o.structured === true,
    rubricVersion: String(o.rubricVersion ?? "1.0"),
    breakdown,
  };
  if (typeof o.capReason === "string" && o.capReason) out.capReason = o.capReason;
  if (typeof o.capLiftedBy === "string" && o.capLiftedBy) out.capLiftedBy = o.capLiftedBy;
  return out;
}

function toRow(b: Record<string, unknown>): FounderExecutionCardRow {
  const key = String(b.key ?? "");
  return {
    key,
    label: ROW_LABEL[key] ?? String(b.label ?? key),
    points: num(b.points) ?? 0,
    max: num(b.max) ?? 0,
    evidence: String(b.evidence ?? ""),
    source: String(b.source ?? "founder"),
  };
}

export function FounderExecutionCard(props: FounderExecutionCardProps) {
  const data = props.data;
  const compact = props.compact === true;
  const band = data.executionScore >= 70 ? "strong" : data.executionScore >= 40 ? "developing" : "early";
  const sourceLabel = sourceLabelFor(data.capLiftedBy);
  const clipped = data.capped && data.rawScore > data.executionScore;
  const clippedNote = clipped ? ` (rubric ${data.rawScore}, shown at the cap)` : "";
  const cappedAttr = data.capped ? "true" : "false";
  const structuredLabel = data.structured ? "structured profile" : "profile without structured fields";
  const capNotice = data.capReason ?? DEFAULT_CAP_NOTICE;
  return (
    <div className="rounded-lg border border-line-subtle p-3 print:break-inside-avoid" data-testid="founder-execution-card" data-execution-score={data.executionScore} data-execution-capped={cappedAttr}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-primary">Founder Execution</p>
        <span className={cn("text-sm font-bold tabular-nums", bandText(band))}>
          {data.executionScore}
          <span className="text-xs font-normal text-muted">/100</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-secondary">
        Structured rubric over the founder profile — {sourceLabel}
        {clippedNote}.
      </p>
      {data.breakdown.length > 0 && (
        <div className="overflow-x-auto">
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">Founder execution rubric breakdown</caption>
          <tbody>
            {data.breakdown.map((b) => (
              <tr key={b.key} className="border-t border-line-subtle" data-execution-row={b.key}>
                <td className="py-0.5 pr-2 text-secondary">{b.label}</td>
                <td className="py-0.5 pr-2 text-right tabular-nums text-primary">
                  {b.points}
                  <span className="text-muted">/{b.max}</span>
                </td>
                {!compact && <td className="py-0.5 text-muted">{b.evidence}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {data.capped && (
        <p className="mt-2 rounded-md border border-amber-300 dark:border-amber-800 bg-surface-sunken px-2 py-1 text-xs text-warn" data-testid="founder-execution-cap">
          {capNotice}
        </p>
      )}
      <p className="mt-1 text-xs text-muted">rubric v{data.rubricVersion} · CHRO · {structuredLabel}</p>
    </div>
  );
}
