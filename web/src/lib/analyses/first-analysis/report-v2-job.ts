// The ReportV2 job runner for an `analyses` row (G28-C, 2026-09-21).
//
// Founder decision (G25-C) → the first two business reports per e-mail are
// free; review v3.26.0 P2 → they were the S32 seven-voice PDF, not the v3
// document the spec § 6 promises. This runner closes that gap: a free-grant
// run (guest or account) and an entitled member's intake run go through the
// SAME `orchestrateReport` the paid Trusted Business Report uses — tier
// `standard`, the full 16-section document, no trim — and the result is
// stored on the analyses row as a `FullReportV2Envelope`
// (`full_report_json`, discriminant `version: "tbr-v2"`, see types.ts).
//
// State machine and columns are the S32 ones (store.ts): `queued` → claim →
// `running` → `done` | `failed`, attempts bounded by FULL_REPORT_MAX_ATTEMPTS,
// the e-mail send-once claim on `full_report_emailed_at`. What differs:
//   * ONE pipeline run per grant — a row whose envelope already carries a
//     document is never orchestrated again (`already_done`); only a run that
//     produced nothing (fully degraded / threw) is retried by the cron, and
//     the attempt cap bounds that. There is no partial state: the
//     orchestrator degrades chapter by chapter itself and `assertReportUsable`
//     is the line between "a usable document" and "nothing".
//   * progress is the orchestrator's phase / pct, saved after every event so
//     the page can say "Gathering evidence · 35 %" instead of streaming
//     seven voices.
//   * delivery = the paid e-mail body (the 1-page investment view) + the PDF
//     twin (`renderTbrPdf`) + the signed page and PDF links of the existing
//     download-token path; the free-allowance ledger is stamped `sent` /
//     `failed` exactly as before (`recordFreeReportDelivery`).
//
// The document lives on the analyses row rather than `svi_snapshots`: a
// snapshot needs an svi_accounts row (a guest has none) and is UNIQUE per
// (account, day), so a second free run the same day would overwrite the
// first. One row = one document = one PDF, and no migration was needed.
//
// Every dependency is injectable; the colocated suite drives the runner with
// a stub orchestrator and an in-memory row — no model, no database.

import "server-only";

import { createRunStrikeLedger } from "@/lib/ai/run-strikes";
import { backgroundRunBudget, pipelineCallTimeouts } from "@/lib/report-pipeline/pipeline-timeouts";
import { callAI } from "@/lib/ai-client";
import { releaseGrantForFailedAnalysis } from "@/lib/reports/free-grants";
import { writeLastReportProvider, type LastReportProvider } from "@/lib/ai/last-report";
import { assertReportUsable, orchestrateReport, type AICallerResult, type PipelineEvent } from "@/lib/report-pipeline/orchestrator";
import { buildCriteriaData } from "@/lib/report-pipeline/run-for-project";
import { buildTbrQualityRow, recordTbrQualityAsync, type TbrQualityWriter } from "@/lib/report-pipeline/quality-log";
import type { AssembledReport } from "@/lib/report-pipeline/types";
import { PIPELINE_VERSION } from "@/lib/report-pipeline/version";
import type { ReportV2 } from "@/lib/report-v2/schema";
import type { SendReportEmailResult } from "@/lib/svi/email-report";
import { buildDeterministicReport } from "./build";
import { downloadPath, mintDownloadToken } from "./download-token";
import {
  intakeFromRow,
  recordFreeReportDelivery,
  resolveDestinationEmail,
  type DeliveryOutcome,
} from "./job";
import {
  FULL_REPORT_MAX_ATTEMPTS,
  claimFullReportEmailSend,
  claimFullReportJob,
  finishFullReport,
  loadFullReportRow,
  releaseFullReportEmailSend,
  saveFullReportProgress,
  type FullReportRow,
} from "./store";
import { FULL_REPORT_V2_VERSION, isReportV2Envelope, type FullReportV2Envelope, type ReportV2Progress } from "./types";

export type ReportV2JobOutcome =
  | { outcome: "not_claimable" }
  | { outcome: "no_signals" }
  /** The envelope already carried a document — nothing was orchestrated (the cost guard). */
  | { outcome: "already_done"; emailed: DeliveryOutcome }
  | { outcome: "done"; reportId: string; emailed: DeliveryOutcome; calls: number; degraded: number }
  | { outcome: "failed"; error: string; retryable: boolean };

/** `orchestrateReport` as the runner calls it (the seam the suite stubs). */
export type Orchestrate = (input: Parameters<typeof orchestrateReport>[0]) => Promise<AssembledReport>;

export interface ReportV2JobDeps {
  now: () => Date;
  claim: (id: string) => Promise<FullReportRow | null>;
  load: (id: string) => Promise<FullReportRow | null>;
  saveProgress: (id: string, envelope: FullReportV2Envelope) => Promise<boolean>;
  finish: (id: string, outcome: { status: "done" | "failed"; report: FullReportV2Envelope | null; error?: string | null }) => Promise<boolean>;
  orchestrate: Orchestrate;
  /** The dispatcher call the orchestrator makes per section. Bound to the row's user at start. */
  callAI: Parameters<typeof orchestrateReport>[0]["callAI"];
  deliver: (row: FullReportRow, envelope: FullReportV2Envelope, opts?: { force?: boolean }) => Promise<DeliveryOutcome>;
  /** Quality telemetry (tbr-quality.jsonl) — optional, never throws. */
  qualityWriter?: TbrQualityWriter;
  /** Review v3.27.0 P1: give the address its free allowance back after a terminal failure (rows released). */
  releaseGrant: (analysisId: string) => Promise<number>;
  /** S32-C — "which model wrote the last report" for /api/status. Optional, never throws. */
  recordLastReport?: (rec: LastReportProvider) => void;
  /** How often the progress envelope is written (ms). */
  progressEveryMs: number;
}

/**
 * The dispatcher, scoped to ONE analyses row (its own per-agent semaphore
 * slot, like `svi:<account>:<project>` on the paid path, so concurrent free
 * runs never serialise through one bucket) and bound to the row's user —
 * null for a guest (ai_runs.user_id is nullable). No per-user fairness cap
 * on a report run, for the reason documented in run-for-project.
 */
export function makeReportCaller(analysisId: string, _userId: string | null): ReportV2JobDeps["callAI"] {
  // Review v3.27.0 P1: the same discipline as the paid drain — G28-B stage
  // timeouts (never one 120 s attempt that outlives the run), ONE run-scoped
  // strike ledger, and no per-user fairness cap (`userId` would queue a
  // report run behind the S31 interactive cap and degrade W1 — see
  // run-for-project.ts). The row's user still lands on `ai_runs` through the
  // orchestrator's dispatch options.
  const runStrikes = createRunStrikeLedger();
  return async (system, user, maxTokens, taskClass, hint): Promise<AICallerResult> => {
    const r = await callAI({
      system,
      user,
      maxTokens,
      ...pipelineCallTimeouts(hint),
      agentId: `svi:analysis:${analysisId}`,
      taskClass,
      runStrikes,
    });
    return { text: r.text, costUsd: r.cost_usd, provider: r.via ?? r.provider, model: r.model };
  };
}

/** A fresh envelope for a run that has just been claimed. */
export function newEnvelope(analysisId: string, company: string, now: Date): FullReportV2Envelope {
  return {
    version: FULL_REPORT_V2_VERSION,
    analysisId,
    company,
    generatedAt: now.toISOString(),
    report: null,
    reportId: null,
    progress: { phase: "starting", pct: 0, at: now.toISOString(), chaptersDone: 0 },
  };
}

/** Fold one orchestrator event into the page's progress line. Exported for the suite. */
export function progressFromEvent(prev: ReportV2Progress, ev: PipelineEvent, now: Date): ReportV2Progress {
  const at = now.toISOString();
  switch (ev.type) {
    case "context":
      return { ...prev, phase: "gather", pct: Math.max(prev.pct, 5), at };
    case "gather_complete":
      return { ...prev, phase: "analyze", pct: Math.max(prev.pct, 15), at };
    case "progress":
      return { ...prev, phase: String(ev.phase), pct: Math.max(prev.pct, ev.total > 0 ? Math.round((ev.completed / ev.total) * 100) : prev.pct), at };
    case "dimension_complete":
      return { ...prev, chaptersDone: prev.chaptersDone + 1, at };
    case "executive_complete":
      return { ...prev, phase: "synthesis", pct: Math.max(prev.pct, 90), at };
    case "audit_complete":
      return { ...prev, phase: "audit", pct: Math.max(prev.pct, 95), at };
    case "done":
      return { ...prev, phase: "done", pct: 100, at };
    default:
      return { ...prev, at };
  }
}

/** Provider / model tally over the run's calls (the document itself carries no model names). */
export type CallTally = Map<string, { provider: string; model: string; n: number; costUsd: number }>;

/** Total US$ across the tally (review v3.27.0 P3: degraded runs must record real spend). */
export function tallyCost(tally: CallTally): number {
  let total = 0;
  for (const t of tally.values()) total += t.costUsd;
  return Math.round(total * 10_000) / 10_000;
}

/** Wrap the dispatcher call so every answered call is counted by provider + model. */
export function tallyingCaller(inner: ReportV2JobDeps["callAI"], tally: CallTally): ReportV2JobDeps["callAI"] {
  return async (system, user, maxTokens, taskClass, hint) => {
    const r = await inner(system, user, maxTokens, taskClass, hint);
    if (typeof r !== "string") {
      const provider = r.provider ?? "";
      const model = r.model ?? "";
      const key = `${provider}|${model}`;
      const cur = tally.get(key) ?? { provider, model, n: 0, costUsd: 0 };
      cur.n += 1;
      cur.costUsd += typeof r.costUsd === "number" && Number.isFinite(r.costUsd) ? r.costUsd : 0;
      tally.set(key, cur);
    }
    return r;
  };
}

/** The /api/status record for a finished v2 run: the most-used provider + model, chapters written / degraded. */
export function lastReportRecordV2(analysisId: string, report: ReportV2, tally: CallTally, now: Date): LastReportProvider {
  const ranked = [...tally.values()].sort((a, b) => b.n - a.n);
  const primary = ranked[0] ?? null;
  return {
    at: now.toISOString(),
    analysis_id: analysisId,
    provider: primary?.provider ?? "",
    model: primary?.model ?? "",
    models: ranked.map((m) => `${m.model} via ${m.provider}`),
    sections: {},
    sections_written: report.dimensions.filter((d) => !d.degraded).length,
    sections_failed: report.dimensions.filter((d) => d.degraded).length,
  };
}

export async function runReportV2Job(id: string, deps: ReportV2JobDeps = defaultReportV2Deps()): Promise<ReportV2JobOutcome> {
  const row = await deps.claim(id);
  if (!row) return { outcome: "not_claimable" };

  // The cost guard: one pipeline run per grant. A claimed row that already
  // holds a document (a failed e-mail left it `failed`? no — only a run that
  // produced nothing is ever `failed`; this is belt and braces for a row
  // re-queued by hand) is delivered, never re-orchestrated.
  const existing = isReportV2Envelope(row.full_report_json) ? row.full_report_json : null;
  if (existing?.report) {
    await deps.finish(id, { status: "done", report: existing, error: null });
    const fresh = (await deps.load(id)) ?? row;
    const emailed = await deps.deliver({ ...fresh, full_report_status: "done", full_report_json: existing }, existing);
    return { outcome: "already_done", emailed };
  }

  const intake = intakeFromRow(row);
  if (!intake) {
    await deps.finish(id, { status: "failed", report: null, error: "analysis has no signals to score" });
    return { outcome: "no_signals" };
  }

  // The same deterministic scoring the screen showed (computeSVI over the
  // stored signals) — the pipeline's baseline, and the startup name.
  const built = buildDeterministicReport({
    analysisId: id,
    intake,
    meta: { url: row.input_url, filename: row.input_filename, chars: row.input_chars, truncated: row.input_truncated },
    now: deps.now(),
  });
  const envelope = newEnvelope(id, built.echo.company, deps.now());
  await deps.saveProgress(id, envelope);

  let lastSaved = deps.now().getTime();
  let done: Extract<PipelineEvent, { type: "done" }> | null = null;
  const onEvent = (ev: PipelineEvent) => {
    if (ev.type === "done") done = ev;
    envelope.progress = progressFromEvent(envelope.progress, ev, deps.now());
    const t = deps.now().getTime();
    if (t - lastSaved >= deps.progressEveryMs || ev.type === "dimension_complete" || ev.type === "gather_complete") {
      lastSaved = t;
      void deps.saveProgress(id, envelope).catch(() => undefined);
    }
  };

  const t0 = deps.now().getTime();
  const tally: CallTally = new Map();
  let report: AssembledReport;
  try {
    report = await deps.orchestrate({
      // A synthetic account id — the report is keyed to the analyses row, not
      // to an svi_accounts row (the deck flow uses the same pattern).
      accountId: `analysis:${id}`,
      // A guest has no app_users row: every consumer of userId is nullable
      // (ai_runs.user_id, connector lookups behind .catch) — see the header.
      userId: (row.user_id ?? null) as unknown as string,
      ownerUserId: row.user_id ?? null,
      startupName: built.echo.company,
      rawText: intake.rawText,
      sviAnalysis: built.analysis,
      evidenceItems: [],
      criteriaData: buildCriteriaData(null),
      tier: "standard",
      tierV2: "standard",
      locale: "en",
      // Review v3.27.0 P1: the background budget (420 s / 48 calls) — the
      // interactive default (120 s / 30) degraded every free run to cards.
      ...backgroundRunBudget(),
      callAI: tallyingCaller(deps.callAI, tally),
      onEvent,
    });
    assertReportUsable(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fully = err instanceof Error && err.name === "ReportFullyDegradedError";
    console.error(`[report-v2-job] pipeline ${fully ? "fully degraded" : "failed"} —`, message, { analysisId: id });
    // A fully-degraded run is logged as a quality row without a document so
    // /api/status.tbr_quality sees the outage (the paid path does the same).
    const degradedErr = err as { degradedSections?: unknown; calls?: unknown };
    if (typeof degradedErr?.degradedSections === "number" && typeof degradedErr?.calls === "number") {
      await recordTbrQualityAsync(
        buildTbrQualityRow({
          projectId: null,
          snapshotId: null,
          tier: "standard",
          report: null,
          calls: degradedErr.calls,
          // Real spend of the degraded run (review v3.27.0 P3) — the tally
          // carries every answered call's cost.
          costUsd: tallyCost(tally),
          durationMs: deps.now().getTime() - t0,
          degradedSections: degradedErr.degradedSections,
          sviVersion: built.analysis.version,
          pipelineVersion: PIPELINE_VERSION,
          now: deps.now(),
        }),
        deps.qualityWriter,
      ).catch(() => undefined);
    }
    envelope.progress = { ...envelope.progress, phase: "failed", at: deps.now().toISOString() };
    await deps.finish(id, { status: "failed", report: envelope, error: message });
    // The cron re-claims a `failed` row while attempts < FULL_REPORT_MAX_ATTEMPTS.
    const retryable = (row.full_report_attempts ?? 0) < FULL_REPORT_MAX_ATTEMPTS;
    if (!retryable) {
      // Review v3.27.0 P1: attempts exhausted → the address gets its free
      // allowance back (nothing was delivered), and the panel says so.
      const released = await deps.releaseGrant(id).catch(() => 0);
      if (released) console.warn("[report-v2-job] free grant released after terminal failure", { analysisId: id, released });
    }
    return { outcome: "failed", error: message, retryable };
  }

  const stats = done as Extract<PipelineEvent, { type: "done" }> | null;
  const reportV2 = report.reportV2 ?? null;
  if (!reportV2) {
    // The orchestrator always attaches the projection on a usable run; a
    // missing document is a bug, not a degraded report — say so and retry.
    const error = "pipeline returned no ReportV2 document";
    console.error(`[report-v2-job] ${error}`, { analysisId: id, reportId: report.id });
    await deps.finish(id, { status: "failed", report: envelope, error });
    return { outcome: "failed", error, retryable: (row.full_report_attempts ?? 0) < FULL_REPORT_MAX_ATTEMPTS };
  }

  const finishedAt = deps.now();
  envelope.report = { ...reportV2, snapshotId: reportV2.snapshotId || `analysis:${id}`, source: "pipeline" };
  envelope.reportId = report.id;
  envelope.completedAt = finishedAt.toISOString();
  envelope.progress = { ...envelope.progress, phase: "done", pct: 100, at: finishedAt.toISOString(), chaptersDone: reportV2.dimensions.length };
  envelope.pipeline = {
    calls: stats?.calls ?? report.llmCalls ?? 0,
    costUsd: stats?.costUsd ?? 0,
    durationMs: stats?.totalMs ?? finishedAt.getTime() - t0,
    degradedSections: stats?.degradedSections ?? reportV2.quality.degradedSections ?? [],
    deadlineHit: stats?.deadlineHit ?? false,
    pipelineVersion: reportV2.pipelineVersion ?? PIPELINE_VERSION,
  };

  // G19-S46 quality telemetry — the same row the paid path writes (no snapshot id).
  await recordTbrQualityAsync(
    buildTbrQualityRow({
      projectId: null,
      snapshotId: null,
      tier: "standard",
      report: reportV2,
      calls: envelope.pipeline.calls,
      costUsd: envelope.pipeline.costUsd,
      durationMs: envelope.pipeline.durationMs,
      words: report.totalWords,
      consistencyIssues: report.consistencyIssues?.length ?? 0,
      sviVersion: built.analysis.version,
      pipelineVersion: envelope.pipeline.pipelineVersion,
      now: finishedAt,
      budgetOverruns: stats?.budgetOverruns ?? 0,
      verdictTrimmed: stats?.verdictTrimmed ?? 0,
      autoCited: stats?.autoCited ?? 0,
    }),
    deps.qualityWriter,
  ).catch(() => undefined);
  try {
    deps.recordLastReport?.(lastReportRecordV2(id, reportV2, tally, finishedAt));
  } catch {
    /* observability never blocks delivery */
  }

  await deps.finish(id, { status: "done", report: envelope, error: null });
  const fresh = (await deps.load(id)) ?? row;
  const emailed = await deps.deliver({ ...fresh, full_report_status: "done", full_report_json: envelope }, envelope);
  return {
    outcome: "done",
    reportId: report.id,
    emailed,
    calls: envelope.pipeline.calls,
    degraded: envelope.pipeline.degradedSections.length,
  };
}

// ── Delivery ─────────────────────────────────────────────────────────────

export interface DeliverV2Deps {
  now: () => Date;
  resolveEmail: (row: FullReportRow) => Promise<string | null>;
  claimSend: (id: string) => Promise<boolean>;
  releaseSend: (id: string, reason: string) => Promise<void>;
  renderPdf: (report: ReportV2) => Promise<Buffer | null>;
  send: (args: { to: string; analysisId: string; report: ReportV2; pdf: Buffer | null; pageUrl: string; pdfUrl: string | null }) => Promise<SendReportEmailResult>;
  /** The free-allowance ledger stamp (`sent` / `failed`) + funnel event — shared with the S32 deliverer. */
  recordDelivery?: (row: FullReportRow, status: "sent" | "failed") => Promise<void>;
  /** Origin for the links in the e-mail. */
  siteUrl: () => string;
  /** Mint the signed token the links carry (null when no secret is configured). */
  mintToken: (analysisId: string) => string | null;
}

/** The signed links a mail client with no cookie can open: the on-page report and the PDF. Exported for the suite. */
export function deliveryLinks(analysisId: string, token: string | null, base: string): { pageUrl: string; pdfUrl: string | null } {
  const origin = base.replace(/\/+$/, "");
  const page = `${origin}/analyze/${encodeURIComponent(analysisId)}`;
  return {
    pageUrl: token ? `${page}?t=${encodeURIComponent(token)}` : page,
    pdfUrl: token ? `${origin}${downloadPath(analysisId, token)}` : null,
  };
}

/**
 * E-mail the v3 document once per row (send-once claim on
 * `full_report_emailed_at`; `force` = the "Resend report" button with its own
 * daily limit). `sent` stamps the free-allowance ledger; a send that provably
 * failed gives the claim back and stamps `failed` (never un-delivers).
 */
export async function deliverReportV2(
  row: FullReportRow,
  envelope: FullReportV2Envelope,
  opts: { force?: boolean } = {},
  deps: DeliverV2Deps = defaultDeliverV2Deps(),
): Promise<DeliveryOutcome> {
  if (row.full_report_status !== "done" || !envelope.report) return "not_done";
  const to = await deps.resolveEmail(row);
  if (!to) return "no_destination";

  if (!opts.force) {
    const mine = await deps.claimSend(row.id);
    if (!mine) return "already_sent";
  }

  try {
    const token = deps.mintToken(row.id);
    const links = deliveryLinks(row.id, token, deps.siteUrl());
    const pdf = await deps.renderPdf(envelope.report).catch((err: unknown) => {
      console.warn("[report-v2-job] PDF render failed — sending the links only", err instanceof Error ? err.message : String(err), { analysisId: row.id });
      return null;
    });
    const result = await deps.send({ to, analysisId: row.id, report: envelope.report, pdf, pageUrl: links.pageUrl, pdfUrl: links.pdfUrl });
    if (!result.ok) {
      if (!opts.force) await deps.releaseSend(row.id, result.reason ?? "send_failed");
      await recordSafely(deps, row, "failed");
      return result.reason === "unsubscribed" ? "unsubscribed" : "send_failed";
    }
    console.info("[report-v2-job] report emailed", { analysisId: row.id, pdfAttached: result.pdfAttached ?? false, forced: Boolean(opts.force) });
    await recordSafely(deps, row, "sent");
    return "sent";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[report-v2-job] delivery failed —", message, { analysisId: row.id });
    if (!opts.force) await deps.releaseSend(row.id, message);
    await recordSafely(deps, row, "failed");
    return "send_failed";
  }
}

async function recordSafely(deps: DeliverV2Deps, row: FullReportRow, status: "sent" | "failed"): Promise<void> {
  if (!deps.recordDelivery) return;
  try {
    await deps.recordDelivery(row, status);
  } catch (err) {
    console.error("[report-v2-job] free-report ledger stamp failed —", err instanceof Error ? err.message : String(err), { analysisId: row.id });
  }
}

function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  return (env || "https://blockid.au").replace(/\/+$/, "");
}

export function defaultDeliverV2Deps(): DeliverV2Deps {
  return {
    now: () => new Date(),
    resolveEmail: resolveDestinationEmail,
    claimSend: (id) => claimFullReportEmailSend(id),
    releaseSend: releaseFullReportEmailSend,
    renderPdf: async (report) => {
      const { renderTbrPdf } = await import("@/lib/pdf/tbr-pdf");
      return (await renderTbrPdf(report)).buffer;
    },
    send: async (args) => {
      const { sendReportEmailToAddress } = await import("@/lib/svi/email-report");
      return sendReportEmailToAddress({ to: args.to, report: args.report, pdf: args.pdf, pageUrl: args.pageUrl, pdfUrl: args.pdfUrl });
    },
    recordDelivery: recordFreeReportDelivery,
    siteUrl,
    mintToken: (id) => mintDownloadToken(id),
  };
}

export function defaultReportV2Deps(): ReportV2JobDeps {
  return {
    now: () => new Date(),
    claim: (id) => claimFullReportJob(id),
    load: loadFullReportRow,
    saveProgress: (id, envelope) => saveFullReportProgress(id, envelope),
    finish: (id, outcome) => finishFullReport(id, outcome),
    releaseGrant: releaseGrantForFailedAnalysis,
    orchestrate: (input) => orchestrateReport(input),
    // Bound to the row at start — see `startReportV2Job`.
    callAI: makeReportCaller("unbound", null),
    deliver: (row, envelope, opts) => deliverReportV2(row, envelope, opts),
    recordLastReport: writeLastReportProvider,
    progressEveryMs: 4_000,
  };
}

// ── Fire-and-forget entry ─────────────────────────────────────────────────

const inFlight = new Set<string>();

/**
 * Start the v2 job without awaiting it. Safe to call twice: the second call
 * in the same process is a no-op while the first runs, and a second process
 * is stopped by the database claim.
 */
export function startReportV2Job(id: string, opts: { userId?: string | null } = {}): void {
  if (!id || inFlight.has(id)) return;
  inFlight.add(id);
  const deps = defaultReportV2Deps();
  deps.callAI = makeReportCaller(id, opts.userId ?? null);
  void runReportV2Job(id, deps)
    .then((out) => {
      if (out.outcome !== "done") console.warn("[report-v2-job] job ended", { analysisId: id, ...out });
    })
    .catch((err) => {
      console.error("[report-v2-job] job threw —", err, { analysisId: id });
    })
    .finally(() => {
      inFlight.delete(id);
    });
}
