/**
 * /solutions/founder — Founder persona landing (P-01).
 *
 * Master Upgrade Plan §7.1 sitemap + §7.2 persona surface. Uses the shared
 * SolutionsPageShell so every persona page renders the same anatomy:
 * hero + benefits + 30/60/90 journey + FAQ + disclaimer.
 *
 * Locked copy from §2 Locked Brand Message Set is embedded verbatim
 * (headline, emotional line, outcome, primary/secondary CTA labels).
 * Persona-specific supporting copy is factual and aligned with the plan's
 * disclaimers — nothing is legal or financial advice.
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { SolutionsPageShell } from "../solutions-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/solutions/founder`;

export const metadata: Metadata = {
  title: "For Founders — One Business. One Trusted Identity. | BlockID.au",
  description:
    "Turn your business identity, evidence and capabilities into one reusable Business ID that investors, procurement teams and grant panels can verify in seconds.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "For Founders — One Business. One Trusted Identity.",
    description:
      "Give your business a trusted digital identity. Verified for investors, procurement, grants and partners.",
    url: CANONICAL,
    siteName: "BlockID.au",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "For Founders — BlockID.au",
    description:
      "Give your business a trusted digital identity. Verified for investors, procurement, grants and partners.",
  },
  robots: { index: true, follow: true },
};

export default function SolutionsFounderPage() {
  return (
    <SolutionsPageShell
      slug="founder"
      lang="en"
      eyebrow="For Founders (P-01)"
      headline="Give your business a trusted digital identity."
      personaLine="Stop rebuilding trust from scratch for every investor, buyer and grant panel. Create one Business ID once, then reuse it — with evidence, verification level and capabilities always current."
      emotionalLine="A business should not have to rebuild trust from zero every time."
      outcomeLine="Be discovered. Be understood. Be trusted."
      primaryCtaLabel="Create Your Business ID"
      secondaryCtaLabel="See a sample Trust Report (A$5.50)"
      benefitsTitle="What founders get on Day 1"
      benefits={[
        {
          title: "One verified identity, reused everywhere",
          body: "ASIC/ABR/ABN checked, evidence bundled, share link tokenised. Investors and buyers see the same verified profile — you never re-fill a diligence form again.",
        },
        {
          title: "Trust Report that scales your pitch",
          body: "12-area analysis across leadership, strategy, operations and technology. Preview 10 pages free. Unlock the full audited report for A$5.50 (GST inclusive) per business — or use credits on a subscription.",
        },
        {
          title: "Consent-based sharing you can revoke",
          body: "Every share package has expiry and revocation controls. See who opened what, when — full audit trail hashed on-chain.",
        },
      ]}
      journeyTitle="Your first 90 days on BlockID.au"
      journey={[
        {
          window: "Day 0-30",
          headline: "Identify + Verify",
          bullets: [
            "Sign up free, claim your ABN, complete a 60-second Business ID.",
            "Reach Verification Level 2 (ASIC/ABR + domain + email owner).",
            "Preview your 10-page Trust Report — executive summary + top gaps.",
          ],
        },
        {
          window: "Day 31-60",
          headline: "Value + Evidence",
          bullets: [
            "Upload evidence packs (traction, financials, contracts, IP).",
            "Run the 12-area analysis; unlock the full Trust Report (A$5.50).",
            "Book one Trusted Advisor session (credits or A$149 pack).",
          ],
        },
        {
          window: "Day 61-90",
          headline: "Connect + Grow",
          bullets: [
            "Create share packages for warm investors, buyers and grant reviewers.",
            "Reach Verification Level 3 (financials attested by qualified accountant).",
            "Publish your public /id/{slug} profile — indexed by Google + AEO surfaces.",
          ],
        },
      ]}
      faqTitle="Frequently asked"
      faqs={[
        {
          q: "When does the paywall kick in?",
          a: "Sign-up, profile creation and the 10-page preview are always free. The paywall gates the full Trust Report, PDF/DOCX export, share links and deep-dive analyses. Path A: one-off A$5.50 (GST inclusive) per business. Path B: subscribers spend credits (~200 credits per full report) with a confirm-before-charge modal that shows word count, model and cost.",
        },
        {
          q: "What verification level do I need to look investor-ready?",
          a: "L2 is the minimum for a public /id/{slug} profile (ASIC/ABR + domain + email owner). L3 is the practical bar for investor and procurement diligence (financials attested). L4 adds independent audit. L5 is reserved for cross-jurisdictional evidence (used by our VN-SME cohort).",
        },
        {
          q: "What's the refund policy on the A$5.50 Trust Report?",
          a: "If a report fails to generate for any technical reason, we refund automatically to the original Stripe payment method (or credit-back if paid on subscription). Successful generations are non-refundable because the audited output is delivered instantly. Refunds initiated by users within 14 days for accidental purchase are honoured under Australian Consumer Law.",
        },
      ]}
      disclaimer="Not financial or legal advice. Trust Reports summarise the evidence you provide; investors, buyers and grant panels remain responsible for their own due diligence. Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW."
    />
  );
}
