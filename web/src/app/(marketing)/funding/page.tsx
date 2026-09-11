/**
 * /funding — "Do you need money?" landing (G11 S3, T0242; copy pack T0248).
 *
 * Journey (plan §4a): hero with live counts → 3-question intake (client,
 * `FundingIntake`) → free preview → transparent paywall (A$3 guest · 3
 * credits · included in Starter / Startup Package / evaluator plans) →
 * `/funding/report/[id]`. The free directories stay one click away.
 *
 * Positioning (plan §5a): grant lists and official links are free; we sell
 * the eligibility analysis, ranking, estimates and timeline — never the
 * information. Disclaimer (§5f) via `FundingDisclaimer`.
 *
 * Body lives in `funding-landing.tsx` (shared with /vi/funding); every D-3
 * string comes from `lib/funding/copy.ts`.
 *
 * ISR (1h): the page reads no cookies — the intake resolves who is signed in
 * after hydration, so the counts cache and the paywall still shows the right
 * rail.
 */

import type { Metadata } from "next";
import { FundingLanding } from "./funding-landing";
import { LANDING_DESCRIPTION, LANDING_TITLE } from "@/lib/funding/seo";
import { pageMetadata } from "@/lib/seo/page-meta";

export const revalidate = 3600;

// S8-A: primary keyword "startup funding australia" (the directories own
// "startup grants australia" / "startup accelerators australia"); hreflang
// pair with /vi/funding; OG image carried explicitly.
export const metadata: Metadata = pageMetadata({
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  path: "/funding",
  viPath: "/vi/funding",
});

export default async function FundingLandingPage() {
  return <FundingLanding />;
}
