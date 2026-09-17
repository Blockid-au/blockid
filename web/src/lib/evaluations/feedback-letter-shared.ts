// Light helpers of the founder feedback letter (G14-S34) shared by the
// email renderer, the landing block, the landing loader and the API route
// WITHOUT pulling the aggregation / CTO / recommender graph of
// feedback-letter.ts (which re-exports everything here, so callers that
// already import that module see one surface).
//
// The only module-level dependency is dimension-owners (titles). The
// forbidden-key list reads FOUNDER_FORBIDDEN_FIELDS lazily so a test that
// mocks `@/lib/evaluations/assessments` with a partial mock (dossier.test)
// never trips an import-time spread.

import { FOUNDER_FORBIDDEN_FIELDS, type AssessmentDimKey } from "@/lib/evaluations/assessments";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";

export type FeedbackLocale = "en" | "vi";

/** Keys beyond FOUNDER_FORBIDDEN_FIELDS that must never appear in a letter payload. */
const EXTRA_FORBIDDEN_KEYS = [
  "decision",
  "conviction",
  "private_notes",
  "privateNotes",
  "shared_notes",
  "sharedNotes",
  "note",
  "notes",
  "valuation_view",
  "valuationView",
  "thesis_fit_pct",
  "thesisFitPct",
  "criterion_ratings",
  "criterionRatings",
  "assessor_user_id",
  "assessorUserId",
  "assessor",
  "org_id",
  "orgId",
  "org",
  "submitted_at",
  "submittedAt",
  "evaluator",
  "evaluator_id",
  "evaluatorId",
  "email",
  "method_note",
  "methodNote",
] as const;

let forbiddenCache: readonly string[] | null = null;

/**
 * Keys that must never appear anywhere in an aggregate / letter payload:
 * FOUNDER_FORBIDDEN_FIELDS (assessments.ts §C.1) plus the note bodies, the
 * snake_case twins and every evaluator / org identifier.
 */
export function feedbackForbiddenKeys(): readonly string[] {
  if (!forbiddenCache) forbiddenCache = Object.freeze([...new Set<string>([...FOUNDER_FORBIDDEN_FIELDS, ...EXTRA_FORBIDDEN_KEYS])]);
  return forbiddenCache;
}

/**
 * Walk any JSON value and return the first forbidden key found (dotted
 * path), or null. Exported so the cron / routes / tests can pin the guard.
 */
export function findForbiddenKey(value: unknown, path = ""): string | null {
  const forbidden = feedbackForbiddenKeys();
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.includes(k)) return path ? `${path}.${k}` : k;
      const hit = findForbiddenKey(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

/** EN / VI title of a dimension (DIMENSION_OWNERS), "General" for the unfiled risk bucket. */
export function dimensionTitle(key: AssessmentDimKey | "general", locale: FeedbackLocale = "en"): string {
  if (key === "general") return locale === "vi" ? "Chung" : "General";
  const owner = DIMENSION_OWNERS[key.toLowerCase() as DimKey];
  if (!owner) return key;
  return locale === "vi" ? owner.titleVi : owner.title;
}
