// Track B B9 — showcase_reviews aggregate helpers (pure).
//
// Per docs/plans/reseller-module-plan.md § U.9 §5. Phase 9 investor reviews
// are stored per-project with a rating 1..5, a plaintext `comment` (founder-
// side only), and a `comment_hash` for the reseller boundary. This file holds
// the shared primitives used by both the reviewer-capture route
// (POST /api/showcase-reviews) and the reseller dashboard rollup
// (/reseller page):
//
//   - hashComment(comment): deterministic SHA-256 of the trimmed body, so
//     the API layer never needs to guess how the reseller-lens hash was
//     computed and identical submissions across projects collapse.
//   - buildReviewsSummary(rows, k): aggregate the reseller-visible fields
//     into { total_reviews, avg_rating, projects_with_reviews } with the
//     same k>=5 anonymity contract used by buildPortfolioSummary + friends.
//     The reseller NEVER sees per-project rows or reviewer identity — only
//     the aggregate counters.
//
// Both are pure functions — no DB, no IO — so vitest can exercise them
// alongside the rest of the reseller suite without a live database.

import { createHash } from "node:crypto";
import { K_ANONYMITY_THRESHOLD, type KAnonBucket } from "./portfolio-aggregates";

export interface ReviewsSummary {
  total_reviews: KAnonBucket;
  projects_with_reviews: KAnonBucket;
  avg_rating: number | null;
}

export interface ResellerReviewRow {
  project_id: string;
  rating: number;
  created_at: string;
}

/**
 * Deterministic SHA-256 of the trimmed comment body. Empty / whitespace-only
 * input hashes to a stable sentinel so the DB CHECK / NOT NULL contract can
 * be satisfied without leaking the "no comment supplied" state.
 */
export function hashComment(comment: string | null | undefined): string {
  const body = (comment ?? "").trim();
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Aggregate reseller-visible review rows into a k-anonymised summary.
 *
 * - `total_reviews` counts every row.
 * - `projects_with_reviews` counts distinct project_ids.
 * - `avg_rating` is the mean rating rounded to one decimal; returns null
 *   when the total-reviews bucket is suppressed so a low-sample average
 *   cannot leak individual scores.
 *
 * Rows with a non-numeric rating outside 1..5 are skipped defensively —
 * the DB CHECK constraint already blocks these but the pure helper stays
 * safe if the caller ever hands it stale/legacy data.
 */
export function buildReviewsSummary(
  rows: ResellerReviewRow[],
  k = K_ANONYMITY_THRESHOLD,
): ReviewsSummary {
  const projects = new Set<string>();
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    if (typeof r.rating !== "number" || !Number.isFinite(r.rating)) continue;
    if (r.rating < 1 || r.rating > 5) continue;
    if (!r.project_id) continue;
    projects.add(r.project_id);
    sum += r.rating;
    count += 1;
  }
  const totalSuppressed = count > 0 && count < k;
  const projectsSuppressed = projects.size > 0 && projects.size < k;
  // Complementary suppression (CDO advisory §23): the (total_reviews,
  // projects_with_reviews) pair is correlated (projects <= total), so
  // exposing one while suppressing the other narrows the hidden bucket
  // into {1..min(exposed,k-1)}. Suppress both whenever either falls under
  // k, mirroring the applyComplementarySuppression rule used on the
  // phase-distribution and weekly-signup arrays.
  const anySuppressed = totalSuppressed || projectsSuppressed;
  const totalBucket: KAnonBucket =
    anySuppressed && count > 0
      ? { count: null, suppressed: true }
      : { count, suppressed: false };
  const projectBucket: KAnonBucket =
    anySuppressed && projects.size > 0
      ? { count: null, suppressed: true }
      : { count: projects.size, suppressed: false };
  const avg =
    anySuppressed || count === 0
      ? null
      : Math.round((sum / count) * 10) / 10;
  return {
    total_reviews: totalBucket,
    projects_with_reviews: projectBucket,
    avg_rating: avg,
  };
}
