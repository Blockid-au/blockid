// The first-analysis job runner (S32-B).
//
// One job per `analyses` row, started fire-and-forget by POST /api/intake
// the moment the row is saved, and re-driven by the `first-analysis-report`
// cron for anything that failed or stalled. The runner:
//
//   1. claims the row (conditional update — see ./store.ts);
//   2. writes the deterministic sections at once (echo, SVI, valuation, the
//      30-day plan) so the page has something real within a second;
//   3. runs the seven C-level agents one after another through the AI
//      queue with `priority: "user"` / `taskClass: "report"`, persisting
//      after EVERY section so the page streams them in as they land, and
//      keeping the sections a previous attempt already paid for;
//   4. marks the job done only when all seven voices exist — anything less
//      is `failed` and retried (≤ FULL_REPORT_MAX_ATTEMPTS) with the
//      finished sections kept;
//   5. on done, emails the PDF once (send-once claim) when a destination is
//      known: the account email of a signed-in founder, or the address a
//      guest gave at the free-summary card. A guest who has not given one
//      is not emailed; the cron picks the row up when they do.
//
// Capacity: `AICapacityError` from the dispatcher is NOT a failure. The
// runner records "queued, ~N s" in the report's progress, waits, and tries
// the same agent again — the page shows exactly that.
//
// Every dependency is injectable so the colocated suite drives the state
// machine with a stub `callAI` and an in-memory store — no live model, no
// database.

import "server-only";

import { callAI } from "@/lib/ai-client";
import { isAICapacityError } from "@/lib/ai/capacity";
import { getEntitlements } from "@/lib/entitlements";
import { buildDeterministicReport, type BuildIntake } from "./build";
import type { SVIExtractedSignals } from "@/lib/svi-analysis";
import { writeAgentSection, clipRaw, AgentSectionError, type AgentCaller } from "./agents";
import {
  claimFullReportEmailSend,
  claimFullReportJob,
  finishFullReport,
  loadFullReportRow,
  lookupUserEmail,
  lookupUserPlan,
  releaseFullReportEmailSend,
  saveFullReportProgress,
  type FullReportRow,
} from "./store";
import {
  FIRST_ANALYSIS_AGENTS,
  FIRST_ANALYSIS_REPORT_VERSION,
  type FirstAnalysisAgent,
  type FirstAnalysisReport,
} from "./types";

export type JobOutcome =
  | { outcome: "not_claimable" }
  | { outcome: "no_signals" }
  | { outcome: "done"; completed: FirstAnalysisAgent[]; emailed: DeliveryOutcome }
  | { outcome: "failed"; completed: FirstAnalysisAgent[]; failed: FirstAnalysisAgent[]; error: string };

export type DeliveryOutcome =
  | "sent"
  | "already_sent"
  | "no_destination"
  | "not_done"
  | "unsubscribed"
  | "send_failed"
  | "skipped";

export interface RenderedPdf {
  buffer: Buffer;
  pages: number;
}

export interface JobDeps {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  claim: (id: string) => Promise<FullReportRow | null>;
  load: (id: string) => Promise<FullReportRow | null>;
  saveProgress: (id: string, report: FirstAnalysisReport) => Promise<boolean>;
  finish: (id: string, outcome: { status: "done" | "failed"; report: FirstAnalysisReport | null; error?: string | null }) => Promise<boolean>;
  callAgent: AgentCaller;
  deliver: (row: FullReportRow, report: FirstAnalysisReport, opts?: { force?: boolean }) => Promise<DeliveryOutcome>;
  /** Max capacity waits per agent before the section is marked failed. */
  capacityRetries: number;
  /** Ceiling on one capacity wait, ms. */
  maxWaitMs: number;
}

/** Wrap the platform dispatcher with the first-analysis defaults. */
export function makeAgentCaller(userId: string | null | undefined): AgentCaller {
  return async (req) => {
    const res = await callAI({
      system: req.system,
      user: req.user,
      maxTokens: req.maxTokens,
      temperature: 0.4,
      timeoutMs: 150_000,
      agentId: req.agentId,
      taskClass: "report",
      priority: "user",
      userId: userId ?? undefined,
    });
    return { text: res.text, provider: res.provider, model: res.model };
  };
}

// ── Row → intake ─────────────────────────────────────────────────────────

export function intakeFromRow(row: FullReportRow): BuildIntake | null {
  const intake = row.intake ?? {};
  const signals = (intake as { signals?: unknown }).signals;
  if (!signals || typeof signals !== "object") return null;
  const ctxStage = (row.context as { stage?: unknown } | null)?.stage;
  return {
    inputKind: row.input_kind ?? "idea_text",
    rawText: row.input_text ?? "",
    structured: ((intake as { structured?: BuildIntake["structured"] }).structured) ?? undefined,
    // Stored rows carry the compact intake (payload.ts); the signals object
    // is the same shape extractSignals produced.
    signals: signals as SVIExtractedSignals,
    context: typeof ctxStage === "number" ? { stage: ctxStage } : undefined,
    warnings: (intake as { warnings?: string[] }).warnings ?? undefined,
  };
}

// ── The run ──────────────────────────────────────────────────────────────

export async function runFirstAnalysisJob(id: string, deps: JobDeps = defaultDeps()): Promise<JobOutcome> {
  const row = await deps.claim(id);
  if (!row) return { outcome: "not_claimable" };

  const intake = intakeFromRow(row);
  if (!intake) {
    await deps.finish(id, { status: "failed", report: null, error: "analysis has no signals to score" });
    return { outcome: "no_signals" };
  }

  const built = buildDeterministicReport({
    analysisId: id,
    intake,
    meta: {
      url: row.input_url,
      filename: row.input_filename,
      chars: row.input_chars,
      truncated: row.input_truncated,
    },
    now: deps.now(),
  });
  const report = built.report;

  // Keep whatever a previous attempt already paid for.
  const prior = row.full_report_json;
  if (prior && prior.version === FIRST_ANALYSIS_REPORT_VERSION && prior.agents) {
    for (const role of FIRST_ANALYSIS_AGENTS) {
      const section = prior.agents[role];
      if (section && section.body && section.wordCount > 0) {
        report.agents[role] = section;
        report.progress.completed.push(role);
      }
    }
  }

  const grounding = {
    company: report.company,
    echo: report.echo,
    svi: report.svi,
    valuation: report.valuation,
    rawExcerpt: clipRaw(intake.rawText),
  };

  let lastError = "";
  for (const role of FIRST_ANALYSIS_AGENTS) {
    if (report.agents[role]) continue;
    report.progress.current = role;
    report.progress.queuedForSec = undefined;
    await deps.saveProgress(id, report);

    let attempt = 0;
    let section: FirstAnalysisReport["agents"][FirstAnalysisAgent] | null = null;
    while (attempt <= deps.capacityRetries) {
      try {
        section = await writeAgentSection(role, grounding, deps.callAgent, deps.now);
        break;
      } catch (err) {
        if (isAICapacityError(err) && attempt < deps.capacityRetries) {
          const waitSec = Math.max(1, Math.min(Math.round(deps.maxWaitMs / 1000), err.retryAfterSec || 5));
          report.progress.queuedForSec = waitSec;
          await deps.saveProgress(id, report);
          await deps.sleep(waitSec * 1000);
          attempt += 1;
          continue;
        }
        lastError = err instanceof Error ? err.message : String(err);
        if (!(err instanceof AgentSectionError) && !isAICapacityError(err)) {
          console.error(`[first-analysis] ${role} failed —`, lastError, { analysisId: id });
        }
        break;
      }
    }

    report.progress.queuedForSec = undefined;
    if (section) {
      report.agents[role] = section;
      report.progress.completed.push(role);
    } else {
      report.progress.failed.push(role);
    }
    report.progress.current = null;
    await deps.saveProgress(id, report);
  }

  const failed = [...report.progress.failed];
  const completed = [...report.progress.completed];
  if (failed.length === 0) {
    report.completedAt = deps.now().toISOString();
    report.progress.current = null;
    await deps.finish(id, { status: "done", report });
    const fresh = (await deps.load(id)) ?? row;
    const emailed = await deps.deliver({ ...fresh, full_report_status: "done", full_report_json: report }, report);
    return { outcome: "done", completed, emailed };
  }
  const error = `${failed.length} section(s) not written: ${failed.join(", ")}${lastError ? ` — ${lastError}` : ""}`;
  await deps.finish(id, { status: "failed", report, error });
  return { outcome: "failed", completed, failed, error };
}

// ── Delivery ─────────────────────────────────────────────────────────────

export interface DeliverDeps {
  now: () => Date;
  resolveEmail: (row: FullReportRow) => Promise<string | null>;
  resolveVariant: (row: FullReportRow) => Promise<"free" | "unlimited">;
  claimSend: (id: string) => Promise<boolean>;
  releaseSend: (id: string, reason: string) => Promise<void>;
  renderPdf: (report: FirstAnalysisReport, opts: { variant: "free" | "unlimited" }) => Promise<RenderedPdf>;
  send: (args: {
    to: string;
    analysisId: string;
    company: string;
    report: FirstAnalysisReport;
    pdf: Buffer;
    pages: number;
  }) => Promise<{ ok: boolean; reason?: string }>;
}

/**
 * Email the finished report once. `force` skips the send-once claim — the
 * "Resend report" button, which carries its own daily rate limit.
 */
export async function deliverFullReport(
  row: FullReportRow,
  report: FirstAnalysisReport,
  opts: { force?: boolean } = {},
  deps: DeliverDeps = defaultDeliverDeps(),
): Promise<DeliveryOutcome> {
  if (row.full_report_status !== "done") return "not_done";
  const to = await deps.resolveEmail(row);
  if (!to) return "no_destination";

  if (!opts.force) {
    const mine = await deps.claimSend(row.id);
    if (!mine) return "already_sent";
  }

  try {
    const variant = await deps.resolveVariant(row);
    const pdf = await deps.renderPdf(report, { variant });
    const result = await deps.send({
      to,
      analysisId: row.id,
      company: report.company,
      report,
      pdf: pdf.buffer,
      pages: pdf.pages,
    });
    if (!result.ok) {
      if (!opts.force) await deps.releaseSend(row.id, result.reason ?? "send_failed");
      return result.reason === "unsubscribed" ? "unsubscribed" : "send_failed";
    }
    console.info("[first-analysis] report emailed", { analysisId: row.id, pages: pdf.pages, variant, forced: Boolean(opts.force) });
    return "sent";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[first-analysis] delivery failed —", message, { analysisId: row.id });
    if (!opts.force) await deps.releaseSend(row.id, message);
    return "send_failed";
  }
}

export async function resolveDestinationEmail(row: FullReportRow): Promise<string | null> {
  if (row.full_report_email) return row.full_report_email;
  if (row.user_id) return lookupUserEmail(row.user_id);
  return null;
}

/** Free tier = the ≥ 10-page report; any paid report entitlement = unlimited. */
export async function resolveReportVariant(row: FullReportRow): Promise<"free" | "unlimited"> {
  if (!row.user_id) return "free";
  try {
    const plan = await lookupUserPlan(row.user_id);
    const flags = await getEntitlements(plan, row.user_id);
    return flags.includes("report.basic") || flags.includes("report.premium") ? "unlimited" : "free";
  } catch {
    return "free";
  }
}

export function defaultDeliverDeps(): DeliverDeps {
  return {
    now: () => new Date(),
    resolveEmail: resolveDestinationEmail,
    resolveVariant: resolveReportVariant,
    claimSend: (id) => claimFullReportEmailSend(id),
    releaseSend: releaseFullReportEmailSend,
    renderPdf: async (report, opts) => {
      const { renderFirstAnalysisReportPdf } = await import("@/lib/pdf/first-analysis-report-pdf");
      return renderFirstAnalysisReportPdf({ report, variant: opts.variant });
    },
    send: async (args) => {
      const { sendFirstAnalysisReportEmail } = await import("@/lib/email");
      return sendFirstAnalysisReportEmail(args);
    },
  };
}

export function defaultDeps(): JobDeps {
  return {
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    claim: (id) => claimFullReportJob(id),
    load: loadFullReportRow,
    saveProgress: saveFullReportProgress,
    finish: (id, outcome) => finishFullReport(id, outcome),
    // Bound to the row at claim time — see `runFirstAnalysisJobForRow`.
    callAgent: makeAgentCaller(null),
    deliver: (row, report, opts) => deliverFullReport(row, report, opts),
    capacityRetries: 4,
    maxWaitMs: 60_000,
  };
}

// ── Fire-and-forget entry for routes ─────────────────────────────────────

const inFlight = new Set<string>();

/**
 * Start the job without awaiting it. Safe to call twice: the second call in
 * the same process is a no-op while the first is running, and a second
 * process is stopped by the database claim.
 */
export function startFirstAnalysisJob(id: string, opts: { userId?: string | null } = {}): void {
  if (!id || inFlight.has(id)) return;
  inFlight.add(id);
  const deps = defaultDeps();
  deps.callAgent = makeAgentCaller(opts.userId ?? null);
  void runFirstAnalysisJob(id, deps)
    .then((out) => {
      if (out.outcome !== "done") console.warn("[first-analysis] job ended", { analysisId: id, ...out });
    })
    .catch((err) => {
      console.error("[first-analysis] job threw —", err, { analysisId: id });
    })
    .finally(() => {
      inFlight.delete(id);
    });
}
