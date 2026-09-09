/**
 * /guide/reports — permanent redirect to /sample.
 *
 * This used to be a public "report template library" that served
 * web/content/reports/*.md — BlockID's own C-Level agent briefs — as
 * downloads. See the commit that removed it: the corpus is our internal ops
 * log (security posture, open task IDs, server metrics, an internal secrets
 * audit), not a sample of what a customer receives.
 *
 * It redirects rather than 404s because the page carried `robots: index` and
 * was linked from nine internal surfaces, so it is likely indexed and
 * bookmarked. /sample is the canonical "show me what a report looks like" hub.
 *
 * permanentRedirect (308), not redirect (307). A 307 tells a crawler the old
 * URL is still the canonical one and to keep it indexed, which is the opposite
 * of what we want for a page that is never coming back.
 *
 * The download route (/api/guide/reports/[filename]) is deliberately NOT
 * restored in any form — a redirect there would just be a slower 404.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-static";

export default function GuideReportsRedirectPage(): never {
  permanentRedirect("/sample");
}
