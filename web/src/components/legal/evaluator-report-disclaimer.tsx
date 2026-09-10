/**
 * EvaluatorReportDisclaimer — the footer under every report an evaluator
 * runs on a startup they entered themselves (T0275, G12).
 *
 * Evaluators are investors, accelerators, incubators, advisory firms and
 * service providers. Their reports carry three things a founder's own report
 * does not: an eligibility read (ESIC, R&DTI, s708), a valuation range in
 * AUD, and — with the Money Finder — a list of grants and programs the
 * startup "matches". Each of those invites a stronger reading than the
 * evidence supports, so the footer says, in order: general information, not
 * advice; eligibility and valuation are indicative; a match is not an
 * approval; no AFSL; get independent advice.
 *
 * The text lives in `DISCLAIMER_SURFACES.evaluator_report`
 * (`@/lib/legal/surfaces`) — the same registry the SVI footer and the
 * valuation warning read from — so counsel edits one place and the PDF
 * footer, the HTML report and this component stay byte-identical. This
 * component only renders it.
 *
 * Server component: no state, no hooks, no data fetch. Mounted by the
 * evaluator report routes (T0271 Trust BizReport, T0272 batch/cohort view,
 * T0273 Progress Radar digest) — it is exported here ahead of those tasks so
 * each can import one thing.
 */

import Link from "next/link";
import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";

/** The registry entry this component renders. Exported for tests and PDFs. */
export const EVALUATOR_REPORT_SURFACE = DISCLAIMER_SURFACES.evaluator_report;

/**
 * Plain-text form (markdown bold markers stripped) for surfaces that cannot
 * render markup — PDF footers, email digests, CSV export headers.
 */
export function evaluatorReportDisclaimerText(): string {
  return EVALUATOR_REPORT_SURFACE.body_md.replace(/\*\*/g, "");
}

export interface EvaluatorReportDisclaimerProps {
  /**
   * `block` (default) — a bordered aside for the end of an HTML report.
   * `compact` — a single small-print paragraph for a table row, a digest
   * email, or a card footer.
   */
  variant?: "block" | "compact";
  /** Where "Read the full disclaimers" goes. */
  learnMoreHref?: string;
  className?: string;
}

/** Splits `**bold** rest` into a `<strong>` lead and the remaining text. */
function splitLead(body: string): { lead: string | null; rest: string } {
  const m = /^\*\*([^*]+)\*\*\s*(.*)$/s.exec(body);
  if (!m) return { lead: null, rest: body.replace(/\*\*/g, "") };
  return { lead: m[1]!, rest: m[2]!.replace(/\*\*/g, "") };
}

export function EvaluatorReportDisclaimer({
  variant = "block",
  learnMoreHref = "/legal/disclaimers",
  className,
}: EvaluatorReportDisclaimerProps) {
  const { lead, rest } = splitLead(EVALUATOR_REPORT_SURFACE.body_md);

  if (variant === "compact") {
    return (
      <p
        role="note"
        aria-label="Evaluator report disclaimer"
        data-surface="evaluator_report"
        className={
          className ??
          "text-[11px] leading-relaxed text-secondary"
        }
      >
        {lead ? <strong className="font-semibold text-primary">{lead}</strong> : null}{" "}
        {rest}{" "}
        <Link href={learnMoreHref} className="underline underline-offset-2">
          Full disclaimers
        </Link>
      </p>
    );
  }

  return (
    <aside
      aria-label="Evaluator report disclaimer"
      data-surface="evaluator_report"
      className={
        className ??
        "rounded-2xl border border-line-subtle bg-surface-sunken p-5 text-xs leading-relaxed text-secondary"
      }
    >
      <p>
        {lead ? <strong className="font-semibold text-primary">{lead}</strong> : null}{" "}
        {rest}
      </p>
      <p className="mt-3">
        <Link
          href={learnMoreHref}
          className="font-medium text-action underline-offset-2 hover:underline"
        >
          Read the full disclaimers
        </Link>
      </p>
    </aside>
  );
}

export default EvaluatorReportDisclaimer;
