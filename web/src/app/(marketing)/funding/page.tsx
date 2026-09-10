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

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Do you need money for your startup? Grants, programs and investors in Australia",
  description:
    "Every open Australian startup grant and every accelerator, incubator and founder program in the eight capitals — free to browse, with official links. Answer three questions for a free match, then a ranked report with a 12-month plan for A$3.",
  alternates: {
    canonical: "https://blockid.au/funding",
    languages: {
      en: "https://blockid.au/funding",
      vi: "https://blockid.au/vi/funding",
      "x-default": "https://blockid.au/funding",
    },
  },
};

export default async function FundingLandingPage() {
  return <FundingLanding />;
}
