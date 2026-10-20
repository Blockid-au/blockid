/**
 * /funding — "Do you need money?" landing (G11 S3, T0242; copy pack T0248).
 *
 * Journey (plan §4a): hero with live counts → 3-question intake (client,
 * `FundingIntake`) → free preview → transparent paywall (guest card ·
 * credits · included in Starter / Startup Package / evaluator plans; price
 * from the payg_enabled view, G35 D25) →
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
import { LANDING_TITLE, landingDescription } from "@/lib/funding/seo";
import { getPaygView } from "@/lib/pricing/payg-view.server";
import { pageMetadata } from "@/lib/seo/page-meta";

export const revalidate = 3600;

// S8-A: primary keyword "startup funding australia" (the directories own
// "startup grants australia" / "startup accelerators australia"); hreflang
// pair with /vi/funding; OG image carried explicitly. G35 P5 (D25): the
// description quotes the Money Finder price for the payg_enabled view.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: LANDING_TITLE,
    description: landingDescription(await getPaygView()),
    path: "/funding",
    viPath: "/vi/funding",
  });
}

export default async function FundingLandingPage() {
  return <FundingLanding view={await getPaygView()} />;
}
