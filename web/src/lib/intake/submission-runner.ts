// Program-intake submission runner (G14 S35).
//
// One founder application at /apply/<slug> → this pipeline:
//
//   1. lookup + acceptance (open / window / max) → 404-shaped `not_found`
//      or `closed` for the route; duplicate (intake, founder_email) → 409;
//   2. validate the three fields + the deck (25 MB, PDF / DOCX only);
//   3. malware-scan the deck (clamd, fail-CLOSED like /api/upload) and store
//      it under a PRIVATE root (/app/intake-uploads or /tmp/intake-uploads —
//      never the public upload.blockid.au tree: a deck is confidential);
//   4. insert the `intake_submissions` row (status received) — from here on
//      every step is best-effort and only appends to `warnings`;
//   5. `classifyDeck()` (shared with /api/pitchdeck/classify) → coverage map
//      + a `pitchdeck_analyses` row owned by the evaluator;
//   6. `createEvaluation()` as the intake owner with `founder_email` → a
//      0314 evaluations row (owner_kind founder_invited) + the existing
//      founder invite email so the founder can claim it; backlink
//      `evaluations.intake_id` (column may be missing until 0405 applies);
//   7. F-4: only when the intake has `auto_report` AND the owner's report
//      quota allows (`via === "quota"` — never credits, never a card) run
//      the library path of POST /api/evaluations/[id]/report
//      (runTrustReportForProject + recordEvaluationReport paid_via quota);
//      otherwise the row stays `received` for "Score now (1 report)";
//   8. `enqueueWebhook("intake.submission_received")` to the OWNER's
//      endpoints + a Telegram line. Both never throw.
//
// Every collaborator is injectable through `deps` so the colocated test
// runs the whole pipeline against the in-memory store without Supabase,
// clamd, the LLM or email.

import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IntakeStore, IntakeSubmission, ProgramIntake } from "./program-intakes";
import { intakeAcceptance, IntakeStoreError, supabaseIntakeStore } from "./program-intakes";
import type { ClassifyDeckResult } from "@/lib/pitchdeck/classify";
import { coverageSummary } from "@/lib/pitchdeck/classify";
import type { CreateEvaluationResult } from "@/lib/evaluations";
import type { ReportCharge } from "@/lib/evaluations/report-quota";
import type { IntakeSubmissionReceivedPayload } from "@/lib/webhooks/registry";

export const DECK_MAX_BYTES = 25 * 1024 * 1024;
export const DECK_MIME_EXT: Readonly<Record<string, string>> = Object.freeze({
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
});
export const INTAKE_UPLOAD_ROOT = existsSync("/app/intake-uploads") ? "/app/intake-uploads" : "/tmp/intake-uploads";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HONEYPOT_FIELD = "company_website_confirm";
export { HONEYPOT_FIELD };

export interface DeckInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

export interface SubmissionInput {
  slug: string;
  startupName: unknown;
  founderName?: unknown;
  founderEmail: unknown;
  website?: unknown;
  consent: unknown;
  deck: DeckInput | null;
  /** Raw client IP — hashed before storage; never stored in the clear. */
  ip?: string | null;
}

export type SubmissionErrorCode =
  | "not_found"
  | "closed"
  | "duplicate"
  | "invalid_input"
  | "consent_required"
  | "deck_required"
  | "deck_too_large"
  | "deck_type"
  | "deck_infected"
  | "scanner_unavailable"
  | "service_unavailable"
  | "not_migrated"
  | "create_failed";

export const SUBMISSION_HTTP_STATUS: Readonly<Record<SubmissionErrorCode, number>> = Object.freeze({
  not_found: 404,
  closed: 404,
  not_migrated: 404,
  duplicate: 409,
  invalid_input: 400,
  consent_required: 400,
  deck_required: 400,
  deck_type: 415,
  deck_too_large: 413,
  deck_infected: 422,
  scanner_unavailable: 503,
  service_unavailable: 503,
  create_failed: 500,
});

export type SubmissionOutcome =
  | {
      ok: true;
      submissionId: string;
      intakeId: string;
      evaluationId: string | null;
      projectId: string | null;
      status: "received" | "scored";
      sviTotal: number | null;
      warnings: string[];
    }
  | { ok: false; error: SubmissionErrorCode; message: string; reason?: string };

export interface OwnerUser {
  id: string;
  email: string;
  plan: string;
  displayName: string | null;
}

export interface RunnerDeps {
  store?: IntakeStore | null;
  now?: Date;
  scan?: (buf: Buffer) => Promise<{ ok: true } | { ok: false; verdict: "infected" | "scanner_error"; signature?: string }>;
  storeDeck?: (deck: DeckInput, intakeId: string) => Promise<string>;
  classify?: (args: { filepath: string | null; filename: string; userId: string; projectId: string | null }) => Promise<ClassifyDeckResult>;
  getOwner?: (ownerUserId: string) => Promise<OwnerUser | null>;
  createEvaluation?: (
    owner: OwnerUser,
    input: { name: string; website: string | null; founder_email: string; description: string | null },
  ) => Promise<CreateEvaluationResult>;
  previewReportCharge?: (owner: OwnerUser, kind: "full") => Promise<Pick<ReportCharge, "via" | "credits">>;
  runReport?: (args: { projectId: string; requestedByUserId: string }) => Promise<{ reportId: string; shareToken: string | null; svi: number }>;
  recordReport?: (args: {
    evaluationId: string;
    projectId: string;
    userId: string;
    reportRef: string | null;
    shareToken: string | null;
    sviTotal: number | null;
  }) => Promise<{ id: string } | null>;
  enqueueWebhook?: (projectId: string | null, payload: IntakeSubmissionReceivedPayload, userIds: string[]) => Promise<unknown>;
  notify?: (text: string) => Promise<unknown>;
}

// ── Pure validation ─────────────────────────────────────────────────────────

export interface NormalisedSubmission {
  startupName: string;
  founderName: string | null;
  founderEmail: string;
  website: string | null;
}

export function normaliseSubmission(input: Pick<SubmissionInput, "startupName" | "founderName" | "founderEmail" | "website">): { ok: true; value: NormalisedSubmission } | { ok: false; message: string } {
  const startupName = typeof input.startupName === "string" ? input.startupName.trim() : "";
  if (!startupName) return { ok: false, message: "Startup name is required" };
  if (startupName.length > 100) return { ok: false, message: "Startup name must be under 100 characters" };
  const founderEmail = typeof input.founderEmail === "string" ? input.founderEmail.trim().toLowerCase() : "";
  if (!founderEmail || !EMAIL_RE.test(founderEmail) || founderEmail.length > 254) return { ok: false, message: "A valid founder email is required" };
  const founderName = typeof input.founderName === "string" && input.founderName.trim() ? input.founderName.trim().slice(0, 120) : null;
  let website: string | null = null;
  if (typeof input.website === "string" && input.website.trim()) {
    let w = input.website.trim();
    if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
    try {
      const u = new URL(w);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return { ok: false, message: "Website must be a valid URL" };
      website = u.toString().replace(/\/$/, "").slice(0, 2048);
    } catch {
      return { ok: false, message: "Website must be a valid URL" };
    }
  }
  return { ok: true, value: { startupName, founderName, founderEmail, website } };
}

export function validateDeck(deck: DeckInput | null): { ok: true } | { ok: false; error: "deck_required" | "deck_too_large" | "deck_type"; message: string } {
  if (!deck || deck.size === 0) return { ok: false, error: "deck_required", message: "Attach your pitch deck (PDF or DOCX)" };
  if (deck.size > DECK_MAX_BYTES) return { ok: false, error: "deck_too_large", message: `Deck must be under ${DECK_MAX_BYTES / 1024 / 1024} MB` };
  if (!DECK_MIME_EXT[deck.mimeType]) return { ok: false, error: "deck_type", message: "Deck must be a PDF or DOCX" };
  return { ok: true };
}

export function hashIp(ip: string | null | undefined): string | null {
  const v = (ip ?? "").trim();
  if (!v) return null;
  return createHash("sha256").update(`intake:${v}`).digest("hex").slice(0, 32);
}

export function telegramLine(intake: Pick<ProgramIntake, "name" | "slug">, sub: Pick<IntakeSubmission, "startupName">, status: string, svi: number | null): string {
  const score = svi == null ? "unscored" : `SVI ${Math.round(svi)}`;
  return `📥 Intake "${intake.name}" (/apply/${intake.slug}): ${sub.startupName} — ${status}, ${score}`;
}

// ── Default collaborators ───────────────────────────────────────────────────

async function defaultScan(buf: Buffer) {
  const { scanBuffer } = await import("@/lib/security/clamav");
  return scanBuffer(buf);
}

async function defaultStoreDeck(deck: DeckInput, intakeId: string): Promise<string> {
  const dir = join(INTAKE_UPLOAD_ROOT, intakeId.replace(/[^a-zA-Z0-9-]/g, ""));
  if (!existsSync(dir)) await mkdir(dir, { recursive: true, mode: 0o750 });
  // Extension from the VALIDATED MIME, never the client filename.
  const ext = DECK_MIME_EXT[deck.mimeType] ?? "bin";
  const filepath = join(dir, `${Date.now()}-${randomBytes(12).toString("hex")}.${ext}`);
  await writeFile(filepath, deck.buffer, { mode: 0o640 });
  return filepath;
}

async function defaultClassify(args: { filepath: string | null; filename: string; userId: string; projectId: string | null }) {
  const { classifyDeck } = await import("@/lib/pitchdeck/classify");
  return classifyDeck({ filepath: args.filepath, filename: args.filename, userId: args.userId, projectId: args.projectId, storageUrl: args.filepath ?? "" });
}

async function defaultGetOwner(ownerUserId: string): Promise<OwnerUser | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("app_users").select("id, email, plan, display_name").eq("id", ownerUserId).maybeSingle();
  if (!data) return null;
  const row = data as { id: string; email: string; plan: string | null; display_name: string | null };
  return { id: row.id, email: row.email, plan: row.plan ?? "free", displayName: row.display_name };
}

async function defaultCreateEvaluation(owner: OwnerUser, input: { name: string; website: string | null; founder_email: string; description: string | null }) {
  const { createEvaluation } = await import("@/lib/evaluations");
  return createEvaluation(owner, input);
}

async function defaultPreview(owner: OwnerUser, kind: "full") {
  const { previewReportCharge } = await import("@/lib/evaluations/report-quota");
  return previewReportCharge(owner, kind);
}

async function defaultRunReport(args: { projectId: string; requestedByUserId: string }) {
  const { runTrustReportForProject } = await import("@/lib/report-pipeline/run-for-project");
  const run = await runTrustReportForProject({ ...args, tier: "standard", creditsCost: 0 });
  return { reportId: run.reportId, shareToken: run.shareToken, svi: run.svi };
}

async function defaultRecordReport(args: { evaluationId: string; projectId: string; userId: string; reportRef: string | null; shareToken: string | null; sviTotal: number | null }) {
  const { recordEvaluationReport } = await import("@/lib/evaluations/report-quota");
  return recordEvaluationReport({ ...args, kind: "full", paidVia: "quota", creditsCost: 0 });
}

async function defaultEnqueue(projectId: string | null, payload: IntakeSubmissionReceivedPayload, userIds: string[]) {
  const { enqueueWebhook } = await import("@/lib/webhooks/registry");
  return enqueueWebhook("intake.submission_received", projectId, payload, { userIds, projectEndpoints: false });
}

async function defaultNotify(text: string) {
  const { sendTelegram } = await import("@/lib/telegram");
  return sendTelegram(text);
}

// ── Runner ──────────────────────────────────────────────────────────────────

export async function runIntakeSubmission(input: SubmissionInput, deps: RunnerDeps = {}): Promise<SubmissionOutcome> {
  const now = deps.now ?? new Date();
  const warnings: string[] = [];

  // 0. store
  let store: IntakeStore;
  try {
    const s = deps.store === undefined ? await supabaseIntakeStore() : deps.store;
    if (!s) return { ok: false, error: "service_unavailable", message: "Service unavailable" };
    store = s;
  } catch {
    return { ok: false, error: "service_unavailable", message: "Service unavailable" };
  }

  // 1. lookup + acceptance
  let intake: ProgramIntake | null;
  try {
    intake = await store.getIntakeBySlug(input.slug);
  } catch (err) {
    if (err instanceof IntakeStoreError && err.code === "not_migrated") return { ok: false, error: "not_migrated", message: "Not found" };
    return { ok: false, error: "service_unavailable", message: "Service unavailable" };
  }
  if (!intake) return { ok: false, error: "not_found", message: "This intake link does not exist" };

  // 2. validate (cheap checks before the count query)
  if (input.consent !== true && input.consent !== "on" && input.consent !== "true") {
    return { ok: false, error: "consent_required", message: "Please confirm the data-ownership statement" };
  }
  const parsed = normaliseSubmission(input);
  if (!parsed.ok) return { ok: false, error: "invalid_input", message: parsed.message };
  const fields = parsed.value;
  const deckCheck = validateDeck(input.deck);
  if (!deckCheck.ok) return { ok: false, error: deckCheck.error, message: deckCheck.message };
  const deck = input.deck!;

  let count = 0;
  try {
    count = (await store.countSubmissions([intake.id])).get(intake.id) ?? 0;
    const existing = await store.findSubmission(intake.id, fields.founderEmail);
    if (existing) return { ok: false, error: "duplicate", message: "This email has already applied to this program" };
  } catch {
    return { ok: false, error: "service_unavailable", message: "Service unavailable" };
  }
  const acceptance = intakeAcceptance(intake, count, now);
  if (!acceptance.ok) return { ok: false, error: "closed", message: "This intake is closed", reason: acceptance.reason };

  // 3. malware scan (fail-closed) + private storage
  const scan = await (deps.scan ?? defaultScan)(deck.buffer);
  if (!scan.ok) {
    if (scan.verdict === "infected") return { ok: false, error: "deck_infected", message: "The file was rejected by the malware scanner and was not stored" };
    return { ok: false, error: "scanner_unavailable", message: "Virus scanner unavailable — try again shortly" };
  }
  let deckPath: string | null = null;
  try {
    deckPath = await (deps.storeDeck ?? defaultStoreDeck)(deck, intake.id);
  } catch (err) {
    return { ok: false, error: "create_failed", message: `Could not store the deck: ${err instanceof Error ? err.message : "unknown"}` };
  }

  // 4. the row
  let sub: IntakeSubmission;
  try {
    sub = await store.insertSubmission({
      intakeId: intake.id,
      founderEmail: fields.founderEmail,
      founderName: fields.founderName,
      startupName: fields.startupName,
      website: fields.website,
      deckStoragePath: deckPath,
      ipHash: hashIp(input.ip),
    });
  } catch (err) {
    if (err instanceof IntakeStoreError && err.code === "duplicate") return { ok: false, error: "duplicate", message: "This email has already applied to this program" };
    if (err instanceof IntakeStoreError && err.code === "not_migrated") return { ok: false, error: "not_migrated", message: "Not found" };
    return { ok: false, error: "create_failed", message: "Could not record the application" };
  }

  // From here on: never fail the submission — record warnings.
  const owner = await (deps.getOwner ?? defaultGetOwner)(intake.ownerUserId).catch(() => null);
  if (!owner) warnings.push("owner_not_found");

  // 5. classify
  let coverage: IntakeSubmission["coverage"] = null;
  let pitchdeckAnalysisId: string | null = null;
  let deckSummary: string | null = null;
  if (owner) {
    try {
      const c = await (deps.classify ?? defaultClassify)({ filepath: deckPath, filename: deck.filename, userId: owner.id, projectId: null });
      if (c.ok) {
        coverage = c.coverage;
        pitchdeckAnalysisId = c.pitchdeckId;
        deckSummary = c.text.slice(0, 500);
        for (const w of c.warnings) warnings.push(`classify: ${w}`);
      } else {
        warnings.push(`classify_failed: ${c.error}`);
      }
    } catch (err) {
      warnings.push(`classify_threw: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`);
    }
  }

  // 6. evaluation (owner_kind founder_invited + invite email inside createEvaluation)
  let evaluationId: string | null = null;
  let projectId: string | null = null;
  if (owner) {
    try {
      const created = await (deps.createEvaluation ?? defaultCreateEvaluation)(owner, {
        name: fields.startupName,
        website: fields.website,
        founder_email: fields.founderEmail,
        description: deckSummary,
      });
      if (created.ok) {
        evaluationId = created.evaluation.id;
        projectId = created.evaluation.projectId;
        if (!created.inviteSent) warnings.push("invite_email_not_sent");
        const linked = await store.linkEvaluationToIntake(evaluationId, intake.id).catch(() => false);
        if (!linked) warnings.push("intake_backlink_skipped");
      } else {
        warnings.push(`evaluation_not_created: ${created.error}`);
      }
    } catch (err) {
      warnings.push(`evaluation_threw: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`);
    }
  }

  // 7. F-4 auto report — quota only, never credits
  let status: "received" | "scored" = "received";
  let sviTotal: number | null = null;
  if (owner && intake.autoReport && evaluationId && projectId) {
    try {
      const charge = await (deps.previewReportCharge ?? defaultPreview)(owner, "full");
      if (charge.via === "quota") {
        const run = await (deps.runReport ?? defaultRunReport)({ projectId, requestedByUserId: owner.id });
        sviTotal = run.svi;
        status = "scored";
        const rec = await (deps.recordReport ?? defaultRecordReport)({
          evaluationId,
          projectId,
          userId: owner.id,
          reportRef: run.reportId,
          shareToken: run.shareToken,
          sviTotal: run.svi,
        });
        if (!rec) warnings.push("report_not_recorded");
      } else {
        warnings.push(`auto_report_skipped: quota_${charge.via}`);
      }
    } catch (err) {
      warnings.push(`auto_report_failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`);
    }
  }

  try {
    await store.updateSubmission(sub.id, {
      evaluationId,
      projectId,
      pitchdeckAnalysisId,
      status,
      sviTotal,
      coverage,
      warnings,
    });
  } catch (err) {
    console.error("[blockid:intake] submission update failed", err);
  }

  // 8. webhook + telegram — best effort
  const payload: IntakeSubmissionReceivedPayload = {
    intake_id: intake.id,
    submission_id: sub.id,
    evaluation_id: evaluationId,
    project_id: projectId,
    startup_name: fields.startupName,
    status,
    svi_total: sviTotal,
    coverage_summary: coverage ? coverageSummary(coverage) : null,
  };
  await (deps.enqueueWebhook ?? defaultEnqueue)(projectId, payload, [intake.ownerUserId]).catch((err: unknown) => {
    console.error("[blockid:intake] webhook enqueue failed", err);
  });
  await (deps.notify ?? defaultNotify)(telegramLine(intake, sub, status, sviTotal)).catch(() => undefined);

  return { ok: true, submissionId: sub.id, intakeId: intake.id, evaluationId, projectId, status, sviTotal, warnings };
}
