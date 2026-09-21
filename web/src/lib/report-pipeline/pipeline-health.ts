// Report-pipeline health events (G15-R3.4).
//
// The orchestrator FLAGS a report whose eight chapters all degraded to
// deterministic cards (`report.fullyDegraded`, D9: it never throws on budget);
// the persisting callers turn that into a retry / refund. Until now nothing
// counted those events, so an AI outage that silently shipped placeholder
// reports was invisible to /api/status. This module appends one line per
// event to `content/reports/report-pipeline-health.jsonl`
// (`{ts, project_hash, reason, llm_calls}`) and logs one structured line
// (`[report-pipeline] fully_degraded …`) the error digest keys on.
//
// Rules: best-effort (never throws, never awaits), no project ids on disk
// (sha256 prefix only), skipped under vitest unless a writer is injected.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getStatusRoot } from "@/lib/status/jsonl";

export interface DegradedEvent {
  ts: string;
  /** First 12 hex of sha256(projectId); "anonymous" when the run had no project. */
  project_hash: string;
  reason: FullyDegradedReason;
  llm_calls: number;
}

/** `mostly_degraded` (G28-B): ≥ FULLY_DEGRADED_MIN_CHAPTERS chapters on deterministic cards — not persisted, not charged. */
export type FullyDegradedReason = "deadline_hit" | "no_llm_calls" | "placeholder_summary" | "mostly_degraded";

/**
 * G28-B: a run with this many (of 8) degraded chapters is treated as no
 * report — the orchestrator flags it `fullyDegraded`, the persisting callers
 * refund / retry, ONE digest line is written here, and the tbr-quality
 * window excludes the row from the grounding median (quality-log.ts).
 */
export const FULLY_DEGRADED_MIN_CHAPTERS = 7;

export type DegradedEventWriter = (event: DegradedEvent) => void | Promise<void>;

export const REPORT_PIPELINE_HEALTH_FILE = path.join("content", "reports", "report-pipeline-health.jsonl");

export function projectHash(projectId: string | null | undefined): string {
  if (!projectId) return "anonymous";
  return createHash("sha256").update(projectId).digest("hex").slice(0, 12);
}

function healthFilePath(): string {
  // Review 2026-09-18: the release dir is a copy — write to the live checkout
  // so /api/status.ai.fully_degraded_24h survives a deploy.
  return process.env.REPORT_PIPELINE_HEALTH_FILE || path.join(getStatusRoot(), REPORT_PIPELINE_HEALTH_FILE);
}

function isTestEnv(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

/** Default writer: append one JSON line; swallow every error. */
export const appendDegradedEvent: DegradedEventWriter = (event) => {
  if (isTestEnv()) return;
  const file = healthFilePath();
  void fs
    .mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.appendFile(file, JSON.stringify(event) + "\n"))
    .catch(() => {
      /* telemetry must never fail a report */
    });
};

/**
 * Record a fully-degraded report: one structured log line + one JSONL row.
 * `writer` is injectable for tests and callers that own their own sink.
 */
export function recordFullyDegraded(
  input: { projectId?: string | null; reason: FullyDegradedReason; llmCalls: number },
  writer: DegradedEventWriter = appendDegradedEvent,
  now: Date = new Date(),
): DegradedEvent {
  const event: DegradedEvent = {
    ts: now.toISOString(),
    project_hash: projectHash(input.projectId),
    reason: input.reason,
    llm_calls: Math.max(0, Math.floor(input.llmCalls ?? 0)),
  };
  try {
    console.warn(`[report-pipeline] fully_degraded project=${event.project_hash} reason=${event.reason} llm_calls=${event.llm_calls}`);
  } catch {
    /* never throw */
  }
  try {
    const r = writer(event);
    if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => undefined);
  } catch {
    /* never throw */
  }
  return event;
}
