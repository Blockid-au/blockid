// G32 SV2 — method metadata on every new snapshot / revision (SOT §9.4.5,
// §9.4.7 SV2). Additive: it lives inside the stored ReportV2 JSON
// (`methodMeta`), so no schema migration is needed and older rows — which
// lack it — still validate and read unchanged. It never changes a score.

import { SCORING_PROFILE_SHA256 } from "@/lib/screening/profile";
import { RUBRIC_VERSION } from "@/lib/screening/rubric";
import { SVI_VERSION } from "@/lib/svi-analysis";
import type { ReportMethodMeta, ReportV2 } from "./schema";

/** The live SVI method behind `cover.svi.total` today (SVI 2.2.0 formula). */
export const SVI_METHOD = `svi-${SVI_VERSION}`;

/**
 * Metadata for a document produced now. `sviVersion` is the version of the
 * SVIAnalysis whose total the document carries (a stored analysis may predate
 * the current formula); `knowledge_cutoff` = the document's generation time.
 */
export function methodMetaFor(report: Pick<ReportV2, "generatedAt">, sviVersion: string = SVI_VERSION): ReportMethodMeta {
  return {
    svi_method: `svi-${typeof sviVersion === "string" && sviVersion.trim() ? sviVersion.trim() : SVI_VERSION}`,
    rubric_version: RUBRIC_VERSION,
    profile_sha256: SCORING_PROFILE_SHA256,
    knowledge_cutoff: report.generatedAt,
    contribution_ledger: {},
  };
}

/**
 * Writer stamp: returns the document with `methodMeta` added when absent.
 * Idempotent and deterministic (same input → same output), so the snapshot
 * projection and the immutable revision of one run carry identical metadata
 * and the revision's content hash stays stable across retries. An existing
 * stamp is kept as-is (a later SV3 writer may fill the ledger).
 */
export function withMethodMeta(report: ReportV2, sviVersion?: string): ReportV2 {
  if (report.methodMeta) return report;
  return { ...report, methodMeta: methodMetaFor(report, sviVersion) };
}

/** Reader helper: the stored metadata, or null for documents written before SV2. */
export function readMethodMeta(report: Pick<ReportV2, "methodMeta">): ReportMethodMeta | null {
  return report.methodMeta ?? null;
}
