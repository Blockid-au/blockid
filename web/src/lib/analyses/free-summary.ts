// The free tier — what "a 5-page summary" actually means.
//
// This module is the single definition of the free summary, and it is
// deliberately pure and framework-free so that ONE constant drives three
// things that would otherwise drift apart:
//
//   * the marketing promise on the homepage,
//   * the offer shown under a finished run on /analyze,
//   * the pages the PDF renderer actually emits.
//
// If we say five pages, it is five pages. `svi-summary-pdf.tsx` maps over
// `FREE_SUMMARY_PAGES` to build the document and its colocated suite renders
// the result and counts the pages in the produced file, so the promise cannot
// quietly become four or seven.
//
// WHAT THE FIVE PAGES ARE, AND WHY THESE FIVE
//
// The test a free artefact has to pass is "would a founder who never pays us
// anything still be glad they read it". Each page answers one question a
// founder actually asks, in the order they ask it:
//
//   1. What is my number?      — the score, the band, the valuation range.
//   2. What shape am I?        — eight dimensions against the AU cohort.
//   3. What is working?        — strengths and weaknesses, with the evidence.
//   4. What is missing?        — the evidence gaps, worst first, with impact.
//   5. What do I do next?      — the prioritised actions.
//
// The A$3 report is NOT this with something removed. It is this plus the
// working: the four-method valuation with its inputs, the cohort percentile
// with its comparison set, the accelerator-readiness checklist, a page per
// dimension with the rationale, the risk landscape and the 90-day roadmap.
// Smaller, not crippled — page 5 says so in plain words rather than teasing.

/** The one number the whole free tier is promised on. */
export const FREE_SUMMARY_PAGE_COUNT = 5;

export interface FreeSummaryPage {
  /** Stable id — used as the React key and in tests. */
  id: string;
  /** Printed at the top of the page, and listed in the email and the UI. */
  title: string;
  /** One line of what the page holds. Used in the offer card and the email. */
  blurb: string;
}

export const FREE_SUMMARY_PAGES: readonly FreeSummaryPage[] = [
  {
    id: "number",
    title: "Your number",
    blurb:
      "The score out of 100, the band it sits in, and the valuation range with its low and high.",
  },
  {
    id: "shape",
    title: "The eight dimensions",
    blurb:
      "Every dimension scored and placed against Australian companies at your stage.",
  },
  {
    id: "standing",
    title: "What is strong, what is weak",
    blurb:
      "Your best and worst readings, each with the evidence the score was built on.",
  },
  {
    id: "gaps",
    title: "The gaps that cost you most",
    blurb:
      "The missing evidence, worst first, with what closing each one is worth.",
  },
  {
    id: "next",
    title: "What to do next",
    blurb:
      "Your prioritised actions, and an honest list of what the full report adds.",
  },
] as const;

/**
 * What the A$3 report adds on top of the free summary.
 *
 * Printed on page 5 and shown in the email so the upgrade is a description,
 * not a tease. Every line here is something the paid renderer genuinely emits
 * (`svi-report-pdf.tsx`) — nothing aspirational.
 */
export const PAID_REPORT_ADDITIONS: readonly string[] = [
  "The valuation working: four independent methods, their inputs, and where they disagree",
  "A page per dimension — the rationale behind each reading, not just the number",
  "Your percentile against a real cohort of Australian companies at the same stage",
  "The accelerator-readiness checklist, scored against 30+ published criteria",
  "The risk landscape, with a mitigation for each flagged risk",
  "A 90-day roadmap sequencing the actions into weeks",
];

/**
 * Accept an email address, or don't.
 *
 * Deliberately conservative rather than RFC-complete: this address is going
 * straight into a send queue and a database row, so the failure we care about
 * is accepting something undeliverable, not rejecting an exotic-but-legal
 * mailbox. Mirrors `EMAIL_RE` in the A$3 create-order route so the two rungs
 * of the funnel do not disagree about what an email is.
 *
 * Returns the lowercased, trimmed address, or null.
 */
export function normaliseSummaryEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value)) return null;
  return value;
}

/**
 * `a***@example.com` — what we echo back after a send.
 *
 * Confirming the exact address back to the page would let anyone who borrowed
 * a browser read it off the screen, and the founder already knows what they
 * typed. Enough to recognise, not enough to harvest.
 */
export function maskSummaryEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "your inbox";
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = user.slice(0, 1);
  return `${head}${"*".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}

/** Every outcome the delivery endpoint can report, as a closed set. */
export type FreeSummaryOutcome =
  | "sent"
  | "already_sent"
  | "unsubscribed"
  | "invalid_email"
  | "not_found"
  | "rate_limited"
  | "send_failed";

export interface FreeSummaryCopy {
  heading: string;
  body: string;
  /** True when the founder can usefully try again. */
  retryable: boolean;
}

/**
 * The single place the outcome of a delivery attempt is turned into words.
 *
 * Pure, so every branch is asserted in the colocated suite and the panel has
 * no copy of its own to drift.
 */
export function freeSummaryCopy(
  outcome: FreeSummaryOutcome,
  maskedEmail?: string | null,
): FreeSummaryCopy {
  const where = maskedEmail ? ` to ${maskedEmail}` : "";
  switch (outcome) {
    case "sent":
      return {
        heading: `Sent${where}`,
        body: `Your ${FREE_SUMMARY_PAGE_COUNT}-page summary is on its way. It usually lands within a minute — check spam if it does not.`,
        retryable: false,
      };
    case "already_sent":
      return {
        heading: "Already sent",
        body: `We have already emailed the summary for this run${where}. We send it once so you never get the same thing twice.`,
        retryable: false,
      };
    case "unsubscribed":
      return {
        heading: "That address has unsubscribed",
        body: "This address asked us to stop emailing it, and we are honouring that. Use another address, or resubscribe from any earlier BlockID email.",
        retryable: true,
      };
    case "invalid_email":
      return {
        heading: "That does not look like an email address",
        body: "Check it and try again — we only use it to send this one summary.",
        retryable: true,
      };
    case "not_found":
      return {
        heading: "We could not find this run",
        body: "The analysis is not on this browser any more. Run it again and the offer comes back.",
        retryable: false,
      };
    case "rate_limited":
      return {
        heading: "Too many requests",
        body: "Give it a minute and try again.",
        retryable: true,
      };
    case "send_failed":
    default:
      return {
        heading: "The email did not go out",
        body: "Nothing was sent, so nothing was used up. Try again in a moment.",
        retryable: true,
      };
  }
}
