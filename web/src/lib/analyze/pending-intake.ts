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

// ── Surviving a signup ────────────────────────────────────────────────────
//
// The module singleton above survives a `router.push()` and nothing else. The
// signup gate needs more than that: the visitor leaves /analyze for
// /auth/login, which is a full document load, and comes back — often minutes
// later, sometimes via a Google round trip through another origin. The JS
// context is gone by then, so the parked submission has to be written down.
//
// sessionStorage, not localStorage: this is one tab's in-flight work, not a
// preference. It dies with the tab, which is the correct lifetime for "the
// idea I was in the middle of analysing".
//
// Only text and URLs are written down. A `File` has no serialisable form
// short of base64-ing megabytes into storage, so a deck genuinely cannot make
// the trip — `?kind=deck` records that one was expected and /analyze asks for
// it again rather than pretending. That is the same honest failure the
// hard-reload path already has.

/** sessionStorage key holding a submission parked across a signup. */
export const SIGNUP_INTAKE_KEY = "blockid_signup_intake";

/**
 * How long a submission stays claimable across the signup round trip.
 * Generous — reading a signup form, choosing a password, and coming back
 * through an OAuth redirect is minutes of real time, and the cost of an
 * expiry that is too tight is the exact retyping this exists to prevent.
 */
export const SIGNUP_INTAKE_TTL_MS = 30 * 60_000;

/**
 * Longest input we are willing to put in the URL. Past this the text still
 * survives via sessionStorage; it just stops riding in `?q=`, so we never
 * emit a link long enough for a proxy or a mail client to truncate.
 */
export const SIGNUP_QUERY_MAX_CHARS = 512;

interface StoredSignupIntake {
  variant?: SmartIntakeSubmission["variant"];
  text?: string;
  url?: string;
  at: number;
}

/** Park a text/URL submission so it survives the trip through signup. */
export function parkIntakeForSignup(
  submission: SmartIntakeSubmission,
  now: number = Date.now(),
): void {
  try {
    const payload: StoredSignupIntake = {
      variant: submission.variant,
      text: submission.text,
      url: submission.url,
      at: now,
    };
    if (!payload.text && !payload.url) return; // a deck cannot be written down
    window.sessionStorage.setItem(SIGNUP_INTAKE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode, storage disabled, quota. `?q=` is still the fallback.
  }
}

/**
 * Claim and clear anything parked for a signup. Single-shot like
 * `takePendingIntake`, so a later reload never silently re-runs it.
 */
export function takeSignupIntake(
  now: number = Date.now(),
): SmartIntakeSubmission | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(SIGNUP_INTAKE_KEY);
    window.sessionStorage.removeItem(SIGNUP_INTAKE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSignupIntake;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (now - parsed.at > SIGNUP_INTAKE_TTL_MS) return null;
    const text = typeof parsed.text === "string" ? parsed.text : undefined;
    const url = typeof parsed.url === "string" ? parsed.url : undefined;
    if (!text && !url) return null;
    return {
      variant: parsed.variant ?? (url ? "url" : "idea"),
      text,
      url,
    };
  } catch {
    return null;
  }
}

/** Forget anything parked for a signup (used on reset). */
export function clearSignupIntake(): void {
  try {
    window.sessionStorage.removeItem(SIGNUP_INTAKE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Where signup should send the visitor back to.
 *
 * Belt and braces: sessionStorage carries the full input, and `?q=` carries
 * short inputs as well so the return still works if storage was unavailable
 * (private mode, a browser that blocks it) or the visitor finishes signup in
 * a different tab. `?resume=signup` tells /analyze that this specific run was
 * already promised for free, so it starts immediately rather than showing a
 * credit confirmation the visitor was never warned about.
 */
export function signupReturnPath(submission: SmartIntakeSubmission): string {
  const params = new URLSearchParams();
  const q = (submission.url ?? submission.text ?? "").trim();
  if (q && !submission.file && q.length <= SIGNUP_QUERY_MAX_CHARS) {
    params.set("q", q);
  }
  if (submission.variant && submission.variant !== "empty") {
    params.set("kind", submission.variant);
  }
  params.set("resume", "signup");
  return `/analyze?${params.toString()}`;
}
