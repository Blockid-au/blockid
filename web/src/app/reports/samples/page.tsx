/**
 * /reports/samples — permanent redirect to /guide/reports.
 *
 * The fintech hero and the founding-band CTA link to `/reports/samples` as the
 * sample-report gallery. The canonical gallery already lives at /guide/reports
 * (Track B B5 report template library), so this page redirects there to avoid
 * a visible 404 and to preserve inbound links.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-static";

export default function ReportSamplesRedirectPage(): never {
  redirect("/guide/reports");
}
