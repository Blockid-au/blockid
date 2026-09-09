/**
 * /reports/samples — permanent redirect to /sample.
 *
 * The fintech hero and the founding-band CTA link to `/reports/samples` as the
 * sample-report gallery. This used to redirect to /guide/reports, which served
 * BlockID's own internal C-Level agent briefs (security posture, open task
 * IDs, server metrics, an internal secrets audit) as public downloads. That
 * surface has been removed; /sample is the canonical "show me what a report
 * looks like" hub.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-static";

export default function ReportSamplesRedirectPage(): never {
  redirect("/sample");
}
