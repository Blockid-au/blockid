// Pending-intake handoff — carries the homepage hero's submission across the
// client-side navigation to /analyze so the visitor never types twice.
//
// WHY A MODULE SINGLETON AND NOT THE URL
// --------------------------------------
// Text and URLs travel fine as `?q=`. A dropped `File` does not: it has no
// serialisable form short of base64-ing megabytes into a query string. But the
// hero and /analyze live in the same client bundle, and `router.push()` is a
// client-side navigation — the JS context (and therefore this module's
// closure) survives it. So the hero parks the whole `SmartIntakeSubmission`
// here, including the live `File` handle, and AnalyzeRoot claims it on mount.
//
// The store is deliberately single-shot and short-lived:
//   * `takePendingIntake()` clears as it reads, so a later "Analyse another"
//     or a back-navigation never silently re-runs a stale submission.
//   * Anything older than TTL_MS is discarded — a visitor who wandered off and
//     came back should get a clean box, not a surprise analysis.
//
// A hard reload or a pasted deep link empties the store. That is handled
// honestly rather than pretended away: `?q=` still rehydrates text/URL
// submissions, and `?kind=deck` tells /analyze that a file was expected but
// could not survive the trip, so it can ask for the file again instead of
// running on nothing.

import type { SmartIntakeSubmission } from "@/components/analyze/smart-intake";

/** How long a parked submission stays claimable. */
export const PENDING_INTAKE_TTL_MS = 60_000;

interface PendingEntry {
  submission: SmartIntakeSubmission;
  at: number;
}

let pending: PendingEntry | null = null;

/** Park a submission for the next /analyze mount to claim. */
export function setPendingIntake(
  submission: SmartIntakeSubmission,
  now: number = Date.now(),
): void {
  pending = { submission, at: now };
}

/** Claim and clear the parked submission, if one is still fresh. */
export function takePendingIntake(
  now: number = Date.now(),
): SmartIntakeSubmission | null {
  const entry = pending;
  pending = null;
  if (!entry) return null;
  if (now - entry.at > PENDING_INTAKE_TTL_MS) return null;
  return entry.submission;
}

/** Drop anything parked (used on reset so nothing re-fires). */
export function clearPendingIntake(): void {
  pending = null;
}

/**
 * Build the query string the hero navigates to. Text and URLs ride along in
 * `q` so a full page load still rehydrates them; a deck only records its
 * `kind` because the bytes cannot travel in a URL.
 */
export function pendingIntakeQuery(
  submission: SmartIntakeSubmission,
  tier?: "free" | "paid",
): string {
  const params = new URLSearchParams();
  const q = (submission.url ?? submission.text ?? "").trim();
  if (q && !submission.file) params.set("q", q);
  if (submission.variant && submission.variant !== "empty") {
    params.set("kind", submission.variant);
  }
  if (tier === "paid") params.set("tier", "paid");
  const qs = params.toString();
  return qs ? `/analyze?${qs}` : "/analyze";
}

/**
 * Rebuild a submission from URL params alone — the reload / deep-link path.
 * Returns null when there is nothing runnable (e.g. a deck whose bytes were
 * lost), so the caller shows the intake box instead of a phantom run.
 */
export function submissionFromQuery(params: {
  q?: string;
  kind?: string;
}): SmartIntakeSubmission | null {
  const q = (params.q ?? "").trim();
  if (!q) return null;
  const isUrl = /^https?:\/\/\S+$/i.test(q) || params.kind === "url";
  if (isUrl) {
    return { variant: "url", text: q, url: q };
  }
  return { variant: "idea", text: q };
}
