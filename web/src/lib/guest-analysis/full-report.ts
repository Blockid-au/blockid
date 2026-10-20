// G35 D26 — guest "Full" PAYG order (A$49, sku `report_full`) → the real
// 16-section Trusted Business Report (TBR v2), not the SVI summary PDF.
//
// The guest has no account and no project, so the signed-in pipeline
// (report_orders → report-order-drain → generateTrustReportForOrder) cannot
// run for them: it resolves an svi_accounts row and a project. The ONE
// pipeline that already writes the 16-section document for someone without
// an account is the `/analyze` ReportV2 job (lib/analyses/first-analysis/
// report-v2-job.ts, G28-C): an `analyses` row with a delivery address →
// `orchestrateReport` (tier standard = every section, no trim) → the
// document on `analyses.full_report_json` → e-mail with the signed page link
// (`/analyze/<id>?t=…`), the signed PDF link and the TBR PDF twin
// (`renderTbrPdf`). Its retries, stuck-run reclaim and e-mail send-once
// claim come with it (5-minute first-analysis cron). This module hands a
// paid guest Full order to that job:
//
//   1. intake — the same `analyzeInput` /api/intake runs (website corpus, or
//      the uploaded PDF / DOCX), under its own AI spend scope;
//   2. save one `analyses` row: no user, a fresh random anon key (never set
//      as a cookie — the guest reaches the row through the signed link),
//      `full_report_email` = the purchase e-mail, so the row is born
//      `queued`, unlocked, and claimable into an account later (G34 DC03:
//      a verified sign-in with that address moves it onto the user);
//   3. start the job (fire-and-forget; the cron re-drives a stall).
//
// The row carries no free-report grant, so the daily free cap never holds it
// and the free-allowance ledger is never stamped (recordFreeReportDelivery is
// a no-op without a grant). Snapshot guests are untouched (still the
// "preview" SVI PDF); Verified needs an account (create-order refuses it).
//
// Behind `payg_enabled`: only create-order stamps `report_data.payg`, and it
// only does so while the flag is ON. A row without the stamp (every A$3
// One-Click order) never reaches this module.
//
// Every dependency is injectable; the colocated suite runs with stubs.

import "server-only";

import path from "node:path";
import { randomUUID } from "node:crypto";

import type { IntakeInput, IntakeResult } from "@/lib/intake/analyze-input";
import type { SaveAnalysisInput } from "@/lib/analyses/store";
import { deriveCompactSvi, type CompactSvi } from "@/lib/analyses/payload";
import { newAnonKey } from "@/lib/analyses/anon-key";
import { mintDownloadToken } from "@/lib/analyses/first-analysis/download-token";

/** What the runner knows about the paid guest order. */
export interface GuestFullOrderInput {
  guestAnalysisId: string;
  email: string;
  inputType: "pitch_file" | "website_url";
  /** The website URL, or the upload path /api/guest-analysis/upload-pitch returned. */
  inputValue: string;
  inputFilename: string | null;
}

export interface GuestFullHandoff {
  /** The `analyses` row the ReportV2 job writes the 16-section report onto. */
  analysisId: string;
  /** Signed page link (`/analyze/<id>?t=…`) — null when no link secret is configured (the report e-mail still arrives). */
  reportUrl: string | null;
  /** The uploaded file the runner may now delete (the row keeps the extracted text). */
  uploadedTmpPath: string | null;
}

export interface GuestFullDeps {
  analyze: (input: IntakeInput, scope: string) => Promise<IntakeResult>;
  compactSvi: (result: IntakeResult) => CompactSvi | null;
  save: (input: SaveAnalysisInput) => Promise<string | null>;
  newAnonKey: () => string;
  start: (analysisId: string) => void;
  readFile: (absPath: string) => Promise<Buffer>;
  /** The signed page link for the e-mail (null without a link secret). */
  reportUrl: (analysisId: string) => string | null;
}

/** Upload roots the guest upload route writes to (same rule as the A$3 runner). */
export function isAllowedUploadPath(abs: string): boolean {
  return abs.startsWith("/tmp/") || abs.startsWith("/app/guest-uploads/") || abs.startsWith(path.resolve("/tmp") + path.sep);
}

/** Map the guest order's input onto the /api/intake input shape. */
export async function intakeInputFor(
  order: Pick<GuestFullOrderInput, "inputType" | "inputValue" | "inputFilename">,
  readFile: GuestFullDeps["readFile"],
): Promise<{ input: IntakeInput; url: string | null; filename: string | null; bytes: number | null; uploadedTmpPath: string | null }> {
  if (order.inputType === "website_url") {
    const url = /^https?:\/\//i.test(order.inputValue) ? order.inputValue : `https://${order.inputValue}`;
    return { input: { url }, url, filename: null, bytes: null, uploadedTmpPath: null };
  }
  if (order.inputType === "pitch_file") {
    const abs = path.resolve(order.inputValue);
    if (!isAllowedUploadPath(abs)) throw new Error(`input_value outside allowed roots: ${abs}`);
    const buffer = await readFile(abs);
    const filename = order.inputFilename || path.basename(abs);
    return { input: { file: { filename, buffer } }, url: null, filename, bytes: buffer.length, uploadedTmpPath: abs };
  }
  throw new Error(`unknown input_type: ${String(order.inputType)}`);
}

/**
 * Create the `analyses` row for a paid guest Full order and start the
 * ReportV2 job on it. Throws on anything that leaves the guest without a
 * report job (the runner marks the guest order `failed`, as it does for the
 * A$3 SKU).
 */
export async function handOffGuestFullReport(order: GuestFullOrderInput, deps: GuestFullDeps = defaultGuestFullDeps()): Promise<GuestFullHandoff> {
  const prepared = await intakeInputFor(order, deps.readFile);
  const scope = `blockid:intake:${randomUUID()}`;
  const result = await deps.analyze(prepared.input, scope);
  result.aiBudgetScope = scope;
  if (!result.signals || !result.rawText || result.rawText.trim().length < 20) {
    throw new Error("empty_input_after_extraction");
  }

  const analysisId = await deps.save({
    anonKey: deps.newAnonKey(),
    userId: null,
    result,
    svi: deps.compactSvi(result),
    url: prepared.url,
    filename: prepared.filename,
    bytes: prepared.bytes,
    fullReportEmail: order.email,
  });
  if (!analysisId) throw new Error("analysis_row_not_saved");

  deps.start(analysisId);
  return { analysisId, reportUrl: deps.reportUrl(analysisId), uploadedTmpPath: prepared.uploadedTmpPath };
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://blockid.au").replace(/\/+$/, "");
}

export function defaultGuestFullDeps(): GuestFullDeps {
  return {
    analyze: async (input, scope) => {
      const [{ analyzeInput }, { withReportSpendScope }] = await Promise.all([
        import("@/lib/intake/analyze-input"),
        import("@/lib/ai/report-attempt-budget"),
      ]);
      return withReportSpendScope(scope, () => analyzeInput(input));
    },
    compactSvi: deriveCompactSvi,
    save: async (input) => (await import("@/lib/analyses/store")).saveAnalysis(input),
    newAnonKey,
    start: (analysisId) => {
      void import("@/lib/analyses/first-analysis/report-v2-job")
        .then(({ startReportV2Job }) => startReportV2Job(analysisId, { userId: null }))
        .catch((err) => console.error("[blockid:guest-analysis] could not start the report job — the cron will", err instanceof Error ? err.message : String(err), { analysisId }));
    },
    readFile: async (abs) => (await import("node:fs")).promises.readFile(abs),
    reportUrl: (analysisId) => {
      const token = mintDownloadToken(analysisId);
      return token ? `${siteUrl()}/analyze/${encodeURIComponent(analysisId)}?t=${encodeURIComponent(token)}` : null;
    },
  };
}
