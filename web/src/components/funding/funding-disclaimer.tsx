/**
 * FundingDisclaimer — footer under every free funding directory page
 * (T0241, G11). Renders `DISCLAIMER_SURFACES.funding_directory` from the
 * legal registry (counsel edits one place) and appends the attribution line
 * for Commonwealth / state source text plus the page's own "last verified"
 * date, which comes from the rows on the page — never from copy.
 *
 * Server component: no state, no hooks, no data fetch.
 */

import Link from "next/link";
import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import { ATTRIBUTION_LINE, formatLooseDate } from "@/lib/funding/directory";

/** The registry entry this component renders. Exported for tests. */
export const FUNDING_DIRECTORY_SURFACE = DISCLAIMER_SURFACES.funding_directory;

/** Plain-text form (markdown bold markers stripped). */
export function fundingDisclaimerText(): string {
  return FUNDING_DIRECTORY_SURFACE.body_md.replace(/\*\*/g, "");
}

function splitLead(body: string): { lead: string | null; rest: string } {
  const m = /^\*\*([^*]+)\*\*\s*(.*)$/s.exec(body);
  if (!m) return { lead: null, rest: body.replace(/\*\*/g, "") };
  return { lead: m[1]!, rest: m[2]!.replace(/\*\*/g, "") };
}

export interface FundingDisclaimerProps {
  /** ISO date of the most recent `last_verified_at` on the page, or null when unknown. */
  lastVerifiedAt: string | null;
  learnMoreHref?: string;
  className?: string;
}

export function FundingDisclaimer({
  lastVerifiedAt,
  learnMoreHref = "/legal/disclaimers",
  className,
}: FundingDisclaimerProps) {
  const { lead, rest } = splitLead(FUNDING_DIRECTORY_SURFACE.body_md);
  return (
    <aside
      aria-label="Funding directory disclaimer"
      data-surface="funding_directory"
      className={
        className ??
        "mx-auto max-w-5xl px-6 pb-16"
      }
    >
      <div className="rounded-2xl border border-line-subtle bg-surface-sunken p-5 text-xs leading-relaxed text-secondary">
        <p>
          {lead ? <strong className="font-semibold text-primary">{lead}</strong> : null} {rest}
        </p>
        <p className="mt-3">
          {ATTRIBUTION_LINE}{" "}
          {lastVerifiedAt ? (
            <span data-last-verified={lastVerifiedAt}>{`Last verified ${formatLooseDate(lastVerifiedAt)}.`}</span>
          ) : (
            <span>Verification date not yet recorded.</span>
          )}
        </p>
        <p className="mt-3">
          <Link href={learnMoreHref} className="font-medium text-action underline-offset-2 hover:underline">
            Read the full disclaimers
          </Link>
        </p>
      </div>
    </aside>
  );
}

export default FundingDisclaimer;
