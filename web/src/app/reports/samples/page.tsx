/**
 * /reports/samples — permanent redirect to /sample.
 *
 * The fintech hero and the founding-band CTA link to `/reports/samples` as the
 * sample-report gallery. This used to redirect to /guide/reports, which served
 * BlockID's own internal C-Level agent briefs (security posture, open task
 * IDs, server metrics, an internal secrets audit) as public downloads. That
 * surface has been removed; /sample is the canonical "show me what a report
 * looks like" hub.
 *
 * permanentRedirect (308), not redirect (307): a 307 keeps the old URL
 * indexed as canonical, which is wrong for a page that is not coming back.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-static";

export default function ReportSamplesRedirectPage(): never {
  permanentRedirect("/sample");
}
