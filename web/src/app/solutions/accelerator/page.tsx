/**
 * /solutions/accelerator — Accelerator / Programme Manager persona
 * landing (P-04).
 *
 * Master Upgrade Plan §7.1 sitemap + §7.2 persona surface. Uses the shared
 * SolutionsPageShell for consistent anatomy. Locked §2 messaging embedded
 * verbatim.
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { SolutionsPageShell } from "../solutions-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/solutions/accelerator`;

export const metadata: Metadata = {
  title: "For Accelerators & Programmes — Cohort verification at scale | BlockID.au",
  description:
    "Verify every cohort founder to L2 in a week. Standardise diligence, cut demo-day prep time and share portfolio benchmarks with sponsors — one Business ID per company.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "For Accelerators & Programmes — BlockID.au",
    description:
      "Verify every cohort founder to L2 in a week. Standardise diligence and cohort benchmarks.",
    url: CANONICAL,
    siteName: "BlockID.au",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "For Accelerators & Programmes — BlockID.au",
    description:
      "Verify every cohort founder to L2 in a week. Standardise diligence and cohort benchmarks.",
  },
  robots: { index: true, follow: true },
};

export default function SolutionsAcceleratorPage() {
  return (
    <SolutionsPageShell
      slug="accelerator"
      lang="en"
      eyebrow="For Accelerators & Programmes (P-04)"
      headline="Cohort verification at scale — one Business ID per company."
      personaLine="Run a repeatable diligence cadence across every cohort. Verify founders to L2 in the first week, unlock full Trust Reports for demo-day, and share cohort benchmarks with sponsors — without herding PDFs."
      emotionalLine="A business should not have to rebuild trust from zero every time."
      outcomeLine="Be discovered. Be understood. Be trusted."
      primaryCtaLabel="Create Your Business ID"
      secondaryCtaLabel="See a sample Trust Report (A$5.50)"
      benefitsTitle="What programme managers get on Day 1"
      benefits={[
        {
          title: "Cohort onboarding in one link",
          body: "Send a single cohort invite; founders self-serve their Business ID and reach L2 verification without staff intervention. Progress dashboard shows who's stuck.",
        },
        {
          title: "Demo-day-ready in 90 days",
          body: "Bulk-unlock Trust Reports for the whole cohort (credits or per-company A$5.50). Every investor pack renders on the same 12-area rubric — sponsors get comparable diligence.",
        },
        {
          title: "Sponsor reporting on autopilot",
          body: "Cohort benchmarks — verification level distribution, sector mix, evidence completeness — exportable as PDF/DOCX. No spreadsheet re-keying, no manual chart building.",
        },
      ]}
      journeyTitle="Your first 90 days on BlockID.au"
      journey={[
        {
          window: "Day 0-30",
          headline: "Cohort intake + Verify",
          bullets: [
            "Create your Programme Business ID (Auschain-verified sponsor tier).",
            "Send bulk cohort invite; founders self-serve to L2 in 7 days.",
            "Preview cohort dashboard — verification progress, evidence gaps.",
          ],
        },
        {
          window: "Day 31-60",
          headline: "Deep-dive + Advisor sessions",
          bullets: [
            "Bulk-unlock Trust Reports for demo-day cohort (credits or A$5.50 each).",
            "Assign advisor sessions using your credit pool (A$149 = 25 credits).",
            "Filter cohort by 12-area gaps; run targeted workshops.",
          ],
        },
        {
          window: "Day 61-90",
          headline: "Demo day + Sponsor pack",
          bullets: [
            "Publish cohort landing on your Programme Business ID.",
            "Export sponsor pack: cohort benchmarks + verified founder profiles.",
            "Reach L4 (independent audit) for the programme's own Business ID.",
          ],
        },
      ]}
      faqTitle="Frequently asked"
      faqs={[
        {
          q: "How does the paywall work for a whole cohort?",
          a: "Sign-up, profile creation and 10-page previews are always free for every founder in the cohort. The full Trust Report costs A$5.50 (GST inclusive) per business one-off, OR you buy a credit pool and let founders spend from it (~200 credits per report). Confirm-before-charge shows word count + model + cost before every generation.",
        },
        {
          q: "What verification level should we require for cohort demo-day?",
          a: "L2 is the minimum for cohort inclusion (ASIC/ABR + domain + email owner — every cohort member reaches this within a week). L3 (financials attested) is the recommended bar for investor-facing demo-day pitches. Programme itself typically operates at L4.",
        },
        {
          q: "Refund policy on unlocked cohort Trust Reports?",
          a: "Technical generation failures refund automatically. Successful reports are non-refundable because the audited output is delivered instantly. Unused credits in your pool never expire and refund to the original payment method under Australian Consumer Law if the programme discontinues.",
        },
      ]}
      disclaimer="Not financial or legal advice. BlockID.au is a verification and reporting platform, not a placement agent. Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW."
    />
  );
}
