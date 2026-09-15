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
//   4. decides the job state from the per-section state
//      (`full_report_json.sections[role]`, one attempt per run, at most
//      SECTION_MAX_ATTEMPTS before a voice is `unavailable`):
//        * every voice written or given up on → `done`;
//        * ≥ FULL_REPORT_PARTIAL_MIN_SECTIONS written and some still
//          retryable → `done_partial` — the founder reads and is emailed
//          what exists ("part 1") while the 5-min cron backfills ONLY the
//          missing sections, then the row becomes `done`;
//        * fewer → `failed`, retried whole (≤ FULL_REPORT_MAX_ATTEMPTS)
//          with the finished sections kept; on the last attempt the
//          remaining voices are marked unavailable and the report delivered
//          as-is rather than never arriving.
//      Provider / model per section land in `meta.sections` after EVERY
//      section (2026-09-15: meta was null on a failed run);
//   5. emails the PDF once per state (send-once claim) when a destination is
//      known: the account email of a signed-in founder, or the address a
//      guest gave at the free-summary card — "(part 1)" for a partial, then
//      once more "(complete)" when the backfill lands. A guest who has not
//      given an address is not emailed; the cron picks the row up when they do.
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
import { writeLastReportProvider, type LastReportProvider } from "@/lib/ai/last-report";
import { getEntitlements } from "@/lib/entitlements";
import { buildDeterministicReport, type BuildIntake } from "./build";
import type { SVIExtractedSignals } from "@/lib/svi-analysis";
import { writeAgentSection, clipRaw, AgentSectionError, type AgentCaller } from "./agents";
import { buildReportMeta } from "./meta";
import {
  FULL_REPORT_MAX_ATTEMPTS,
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
  FULL_REPORT_PARTIAL_MIN_SECTIONS,
  SECTION_MAX_ATTEMPTS,
  pendingSections,
  type FirstAnalysisAgent,
  type FirstAnalysisReport,
  type SectionState,
} from "./types";

export type JobOutcome =
  | { outcome: "not_claimable" }
  | { outcome: "no_signals" }
  | {
      outcome: "done";
      completed: FirstAnalysisAgent[];
      emailed: DeliveryOutcome;
      /** Voices given up on (empty on a clean run). */
      failed: FirstAnalysisAgent[];
      error: string | null;
    }
  | {
      outcome: "done_partial";
      completed: FirstAnalysisAgent[];
      emailed: DeliveryOutcome;
      /** Voices the cron will backfill. */
      failed: FirstAnalysisAgent[];
      error: string;
    }
  | { outcome: "failed"; completed: FirstAnalysisAgent[]; failed: FirstAnalysisAgent[]; error: string };

/** Which email a delivery is: the whole report, part 1 of a partial, or the completion after a part 1. */
export type DeliveryPart = "single" | "partial" | "complete";

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
  finish: (
    id: string,
    outcome: { status: "done" | "done_partial" | "failed"; report: FirstAnalysisReport | null; error?: string | null; resetEmailed?: boolean },
  ) => Promise<boolean>;
  callAgent: AgentCaller;
  deliver: (row: FullReportRow, report: FirstAnalysisReport, opts?: { force?: boolean }) => Promise<DeliveryOutcome>;
  /** S32-C — persist "which model wrote the last report" for /api/status. Optional, never throws. */
  recordLastReport?: (rec: LastReportProvider) => void;
  /** Max capacity waits per agent before the section is marked failed. */
  capacityRetries: number;
  /** Job attempts before a partial report is delivered as-is. */
  maxAttempts: number;
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
      taskClass: req.taskClass,
      priority: "user",
      userId: userId ?? undefined,
    });
    // `via` is the dispatcher provider (deepinfra / gemini / claude-oauth …);
    // `provider` is only the coarse API family. The report must be truthful.
    return { text: res.text, provider: res.via ?? res.provider, model: res.model };
  };
}

/** The /api/status record for a finished report (S32-C). */
export function lastReportRecord(analysisId: string, report: FirstAnalysisReport, now: Date): LastReportProvider {
  const meta = report.meta ?? buildReportMeta(report.agents);
  const counts = new Map<string, { provider: string; model: string; n: number }>();
  const sections: LastReportProvider["sections"] = {};
  for (const [role, s] of Object.entries(meta.sections)) {
    if (!s || (s.status && s.status !== "done")) continue;
    sections[role] = { provider: s.provider, model: s.model, task_class: s.taskClass };
    const key = `${s.provider}|${s.model}`;
    const cur = counts.get(key) ?? { provider: s.provider, model: s.model, n: 0 };
    cur.n += 1;
    counts.set(key, cur);
  }
  const primary = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return {
    at: now.toISOString(),
    analysis_id: analysisId,
    provider: primary?.provider ?? "",
    model: primary?.model ?? "",
    models: meta.models,
    sections,
    sections_written: report.progress.completed.length,
    sections_failed: report.progress.failed.length,
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

/** One more try per voice after a provider fault (not capacity, not a bad answer). */
const PROVIDER_RETRIES = 1;

function sectionState(report: FirstAnalysisReport, role: FirstAnalysisAgent): SectionState {
  report.sections ??= {};
  return (report.sections[role] ??= { status: "pending", attempts: 0 });
}

/** Rebuild `meta` from whatever exists right now — never only at the end. */
function refreshMeta(report: FirstAnalysisReport): void {
  report.meta = buildReportMeta(report.agents, report.sections ?? {});
}

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
  report.sections = {};

  // Keep whatever a previous attempt already paid for — the sections, their
  // attempt counts, and the partial-delivery stamps.
  const prior = row.full_report_json;
  if (prior && prior.version === FIRST_ANALYSIS_REPORT_VERSION && prior.agents) {
    for (const role of FIRST_ANALYSIS_AGENTS) {
      const section = prior.agents[role];
      const priorState = prior.sections?.[role];
      if (section && section.body && section.wordCount > 0) {
        report.agents[role] = section;
        report.progress.completed.push(role);
        report.sections[role] = { ...(priorState ?? { attempts: 1 }), status: "done" };
      } else if (priorState) {
        report.sections[role] = { ...priorState, status: priorState.status === "unavailable" ? "unavailable" : "pending" };
      }
    }
    if (prior.partialAt) report.partialAt = prior.partialAt;
    if (prior.delivery) report.delivery = { ...prior.delivery };
  }
  refreshMeta(report);

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
    const state = sectionState(report, role);
    if (state.status === "unavailable" || state.attempts >= SECTION_MAX_ATTEMPTS) {
      // Given up on after SECTION_MAX_ATTEMPTS — the PDF says so honestly.
      state.status = "unavailable";
      if (!report.progress.failed.includes(role)) report.progress.failed.push(role);
      continue;
    }
    state.status = "writing";
    state.attempts += 1;
    state.lastAttemptAt = deps.now().toISOString();
    report.progress.current = role;
    report.progress.queuedForSec = undefined;
    await deps.saveProgress(id, report);

    let attempt = 0;
    let providerRetry = 0;
    let capacityExhausted = false;
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
        state.error = lastError.slice(0, 300);
        if (isAICapacityError(err)) capacityExhausted = true;
        if (err instanceof AgentSectionError) {
          if (err.provider) state.provider = err.provider;
          if (err.model) state.model = err.model;
        }
        if (!(err instanceof AgentSectionError) && !isAICapacityError(err)) {
          // A provider fault (401 from a fallback key, a timeout, a network
          // blip — 2026-09-15 smoke: "HTTP 401 INVALID_API_KEY" from an
          // overflow provider). The dispatcher rotates providers per call,
          // so one more try usually lands on a healthy one.
          console.error(`[first-analysis] ${role} failed —`, lastError, { analysisId: id });
          if (providerRetry < PROVIDER_RETRIES) {
            providerRetry += 1;
            await deps.sleep(1_500);
            continue;
          }
        }
        break;
      }
    }

    report.progress.queuedForSec = undefined;
    if (section) {
      report.agents[role] = section;
      report.progress.completed.push(role);
      state.status = "done";
      state.error = undefined;
      state.provider = section.provider;
      state.model = section.model;
    } else {
      // A capacity wait that ran out is not the model's fault: it does not
      // spend one of the section's attempts.
      if (capacityExhausted) state.attempts = Math.max(0, state.attempts - 1);
      state.status = state.attempts >= SECTION_MAX_ATTEMPTS ? "unavailable" : "failed";
      report.progress.failed.push(role);
    }
    report.progress.current = null;
    refreshMeta(report);
    await deps.saveProgress(id, report);
  }

  const completed = [...report.progress.completed];
  const retryable = pendingSections(report);
  const failed = [...report.progress.failed];
  const missing = FIRST_ANALYSIS_AGENTS.filter((r) => !report.agents[r]);
  const errorLine = (what: string) =>
    `${missing.length} section(s) not written: ${missing.join(", ")}${lastError ? ` — ${lastError}` : ""}${what ? ` — ${what}` : ""}`;
  // `claim` incremented attempts before we ran, so the row already carries
  // this attempt's number.
  const lastTry = (row.full_report_attempts ?? 0) >= deps.maxAttempts;

  if (missing.length === 0 || retryable.length === 0 || (lastTry && completed.length < FULL_REPORT_PARTIAL_MIN_SECTIONS)) {
    // Done: every voice exists, or every missing voice has been given up on.
    // On a whole-job last attempt with too little for a partial, the rest is
    // marked unavailable too — a report with honest "could not be written"
    // pages beats a founder who never receives anything.
    for (const role of retryable) {
      const st = sectionState(report, role);
      st.status = "unavailable";
      st.error = st.error ?? "not written within the retry budget";
    }
    const unavailable = FIRST_ANALYSIS_AGENTS.filter((r) => report.sections?.[r]?.status === "unavailable");
    const error = unavailable.length ? errorLine(`${unavailable.length} unavailable after ${SECTION_MAX_ATTEMPTS} attempts`) : null;
    report.completedAt = deps.now().toISOString();
    report.progress.current = null;
    refreshMeta(report);
    try {
      deps.recordLastReport?.(lastReportRecord(id, report, deps.now()));
    } catch { /* observability never blocks delivery */ }
    // A "(part 1)" email went out earlier → the complete report is emailed
    // once more: remember the stamp in the JSON and give the send-once
    // column back. Read the row fresh: the partial send may have stamped it
    // after we claimed.
    const before = (await deps.load(id)) ?? row;
    const partialWentOut = Boolean(report.partialAt && before.full_report_emailed_at);
    if (partialWentOut && !report.delivery?.partialEmailedAt) {
      report.delivery = { ...(report.delivery ?? {}), partialEmailedAt: before.full_report_emailed_at! };
    }
    await deps.finish(id, { status: "done", report, error, resetEmailed: partialWentOut });
    const fresh = (await deps.load(id)) ?? row;
    const emailed = await deps.deliver(
      { ...fresh, full_report_status: "done", full_report_json: report, ...(partialWentOut ? { full_report_emailed_at: null } : {}) },
      report,
    );
    return { outcome: "done", completed, emailed, failed: unavailable, error };
  }

  if (completed.length >= FULL_REPORT_PARTIAL_MIN_SECTIONS) {
    // Partial: deliver what exists now; the cron backfills the rest.
    report.partialAt ??= deps.now().toISOString();
    report.progress.current = null;
    refreshMeta(report);
    try {
      deps.recordLastReport?.(lastReportRecord(id, report, deps.now()));
    } catch { /* observability never blocks delivery */ }
    const error = errorLine(`${retryable.length} still being written`);
    await deps.finish(id, { status: "done_partial", report, error });
    const fresh = (await deps.load(id)) ?? row;
    const emailed = await deps.deliver({ ...fresh, full_report_status: "done_partial", full_report_json: report }, report);
    return { outcome: "done_partial", completed, emailed, failed: retryable, error };
  }

  const error = errorLine("");
  refreshMeta(report);
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
  renderPdf: (report: FirstAnalysisReport, opts: { variant: "free" | "unlimited"; part: DeliveryPart }) => Promise<RenderedPdf>;
  send: (args: {
    to: string;
    analysisId: string;
    company: string;
    report: FirstAnalysisReport;
    pdf: Buffer;
    pages: number;
    part: DeliveryPart;
  }) => Promise<{ ok: boolean; reason?: string }>;
}

/** Which email this delivery is, from the row's state and the report's stamps. */
export function deliveryPartFor(row: Pick<FullReportRow, "full_report_status">, report: Pick<FirstAnalysisReport, "delivery" | "partialAt">): DeliveryPart {
  if (row.full_report_status === "done_partial") return "partial";
  return report.delivery?.partialEmailedAt ? "complete" : "single";
}

/**
 * Email the finished (or partial) report once per state. `force` skips the
 * send-once claim — the "Resend report" button, which carries its own
 * daily rate limit.
 */
export async function deliverFullReport(
  row: FullReportRow,
  report: FirstAnalysisReport,
  opts: { force?: boolean } = {},
  deps: DeliverDeps = defaultDeliverDeps(),
): Promise<DeliveryOutcome> {
  if (row.full_report_status !== "done" && row.full_report_status !== "done_partial") return "not_done";
  const to = await deps.resolveEmail(row);
  if (!to) return "no_destination";

  if (!opts.force) {
    const mine = await deps.claimSend(row.id);
    if (!mine) return "already_sent";
  }

  const part = deliveryPartFor(row, report);
  try {
    const variant = await deps.resolveVariant(row);
    const pdf = await deps.renderPdf(report, { variant, part });
    const result = await deps.send({
      to,
      analysisId: row.id,
      company: report.company,
      report,
      pdf: pdf.buffer,
      pages: pdf.pages,
      part,
    });
    if (!result.ok) {
      if (!opts.force) await deps.releaseSend(row.id, result.reason ?? "send_failed");
      return result.reason === "unsubscribed" ? "unsubscribed" : "send_failed";
    }
    console.info("[first-analysis] report emailed", { analysisId: row.id, pages: pdf.pages, variant, part, forced: Boolean(opts.force) });
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
      return renderFirstAnalysisReportPdf({ report, variant: opts.variant, part: opts.part });
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
    recordLastReport: writeLastReportProvider,
    capacityRetries: 4,
    maxAttempts: FULL_REPORT_MAX_ATTEMPTS,
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
