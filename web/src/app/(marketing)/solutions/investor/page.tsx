/**
 * /solutions/investor — Investor Analyst persona landing (P-03).
 *
 * Master Upgrade Plan §7.1 sitemap + §7.2 persona surface. Uses the shared
 * SolutionsPageShell for consistent anatomy (hero + benefits + journey +
 * FAQ + disclaimer). Locked §2 messaging embedded verbatim.
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { SolutionsPageShell } from "../solutions-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/solutions/investor`;

export const metadata: Metadata = {
  title: "For Investors & Analysts — Verified diligence in seconds | BlockID.au",
  description:
    "Cut first-pass diligence from days to minutes. Every Business ID ships with a verified identity, evidence pack and audited Trust Report — same rubric across every deal.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "For Investors & Analysts — BlockID.au",
    description:
      "Verified Business ID + audited Trust Report — same rubric across every deal.",
    url: CANONICAL,
    siteName: "BlockID.au",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "For Investors & Analysts — BlockID.au",
    description:
      "Verified Business ID + audited Trust Report — same rubric across every deal.",
  },
  robots: { index: true, follow: true },
};

export default function SolutionsInvestorPage() {
  return (
    <SolutionsPageShell
      slug="investor"
      lang="en"
      eyebrow="For Investors & Analysts (P-03)"
      headline="Verified diligence in seconds — the same rubric across every deal."
      personaLine="Stop chasing founders for the same six documents. Every Business ID on BlockID.au ships with a verified identity, evidence pack and audited Trust Report scored on the same 12-area rubric — so you compare apples with apples."
      emotionalLine="A business should not have to rebuild trust from zero every time."
      outcomeLine="Be discovered. Be understood. Be trusted."
      primaryCtaLabel="Create Your Business ID"
      secondaryCtaLabel="See a sample Trust Report (A$5.50)"
      benefitsTitle="What investors get on Day 1"
      benefits={[
        {
          title: "One rubric across every deal",
          body: "12-area analysis (Leadership & People / Strategy & Commercial / Ops & Performance / Tech & Digital) scored consistently. Portfolio benchmarking becomes a spreadsheet-free operation.",
        },
        {
          title: "Verified evidence, not founder claims",
          body: "Every finding is evidence-cited. Verification level (L1-L5) is visible on the profile — you know instantly whether financials are self-declared, accountant-attested or independently audited.",
        },
        {
          title: "Access without account friction",
          body: "Founders send a signed share link. You open, review, comment — no account required for read-only diligence. Every view is logged for their audit trail, not yours.",
        },
      ]}
      journeyTitle="Your first 90 days on BlockID.au"
      journey={[
        {
          window: "Day 0-30",
          headline: "Onboard your first cohort",
          bullets: [
            "Sign up free, create an Investor Business ID.",
            "Invite portfolio founders to publish their Business ID.",
            "Open your first 10 shared Trust Reports (unlock A$5.50 each, or credits).",
          ],
        },
        {
          window: "Day 31-60",
          headline: "Standardise diligence",
          bullets: [
            "Configure the 12-area rubric weights to match your thesis.",
            "Filter incoming pitches by verification level (L3+ recommended).",
            "Export cohort benchmarks (DOCX/PDF) for IC papers.",
          ],
        },
        {
          window: "Day 61-90",
          headline: "Scale sourcing",
          bullets: [
            "Publish your own thesis on your Investor Business ID.",
            "Receive inbound share packages from L3+ founders across AU + VN.",
            "Reach Verification Level 4 (AFSL disclosure, if applicable).",
          ],
        },
      ]}
      faqTitle="Frequently asked"
      faqs={[
        {
          q: "When does the paywall apply to me as a reviewer?",
          a: "If a founder shares a Trust Report with you via a signed link, you can read it without paying — they've already unlocked it. The paywall (A$5.50 one-off or credits) only applies when you generate a fresh Trust Report on a Business ID that hasn't been unlocked yet. Preview mode (10 pages) is always free.",
        },
        {
          q: "What verification level should I require from portfolio candidates?",
          a: "L2 is the minimum for a public /id/{slug} profile. For seed-stage diligence, L3 (financials attested by a qualified accountant) is the practical bar. Series A+ typically requires L4 (independent audit) or L5 (cross-jurisdictional evidence for VN corridor deals). Each level's requirements are on /business-id.",
        },
        {
          q: "What's the refund policy on the A$5.50 Trust Report?",
          a: "Technical failures refund automatically to your original payment method. Successful generations are non-refundable — the audited output is delivered instantly. Under Australian Consumer Law, accidental purchases refunded within 14 days are honoured. Nothing on the platform is financial or investment advice.",
        },
      ]}
      disclaimer="Not financial, investment or legal advice. Trust Reports summarise founder-supplied evidence; investment decisions remain your own. Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW."
    />
  );
}
