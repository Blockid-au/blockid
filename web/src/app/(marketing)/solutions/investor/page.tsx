/**
 * /solutions/investor — Investor & Analyst persona landing (P-03).
 *
 * Master Upgrade Plan §7.1 sitemap + §7.2 persona surface + §7.7 bilingual
 * rules. All copy resolves through `t()` so the /vi/solutions/investor
 * mirror can re-use the same shell.
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { SolutionsPageShell } from "../solutions-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/solutions/investor`;
const CANONICAL_VI = `${SITE_URL}/vi/solutions/investor`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  const title = t(m, "meta.solutions.investor.title");
  const description = t(m, "meta.solutions.investor.description");
  return {
    title,
    description,
    alternates: {
      canonical: CANONICAL_EN,
      languages: {
        en: CANONICAL_EN,
        vi: CANONICAL_VI,
        "x-default": CANONICAL_EN,
      },
    },
    openGraph: {
      title,
      description,
      url: CANONICAL_EN,
      siteName: "BlockID.au",
      type: "website",
      locale: "en_AU",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function SolutionsInvestorPage() {
  const m = await getMessages("en");

  return (
    <SolutionsPageShell
      slug="investor"
      lang="en"
      eyebrow={t(m, "solutions.investor.eyebrow")}
      headline={t(m, "solutions.investor.headline")}
      personaLine={t(m, "solutions.investor.persona")}
      emotionalLine={t(m, "hero.v3.emotional")}
      outcomeLine={t(m, "hero.v3.outcome")}
      primaryCtaLabel={t(m, "hero.v3.cta.primary.signedOut")}
      secondaryCtaLabel={t(m, "hero.v3.cta.secondary")}
      benefitsTitle={t(m, "solutions.investor.benefits.title")}
      benefits={[
        {
          title: t(m, "solutions.investor.benefit1.title"),
          body: t(m, "solutions.investor.benefit1.body"),
        },
        {
          title: t(m, "solutions.investor.benefit2.title"),
          body: t(m, "solutions.investor.benefit2.body"),
        },
        {
          title: t(m, "solutions.investor.benefit3.title"),
          body: t(m, "solutions.investor.benefit3.body"),
        },
      ]}
      journeyTitle={t(m, "solutions.investor.journey.title")}
      journey={[
        {
          window: t(m, "solutions.investor.journey.window1"),
          headline: t(m, "solutions.investor.journey.step1.head"),
          bullets: [
            t(m, "solutions.investor.journey.step1.b1"),
            t(m, "solutions.investor.journey.step1.b2"),
            t(m, "solutions.investor.journey.step1.b3"),
          ],
        },
        {
          window: t(m, "solutions.investor.journey.window2"),
          headline: t(m, "solutions.investor.journey.step2.head"),
          bullets: [
            t(m, "solutions.investor.journey.step2.b1"),
            t(m, "solutions.investor.journey.step2.b2"),
            t(m, "solutions.investor.journey.step2.b3"),
          ],
        },
        {
          window: t(m, "solutions.investor.journey.window3"),
          headline: t(m, "solutions.investor.journey.step3.head"),
          bullets: [
            t(m, "solutions.investor.journey.step3.b1"),
            t(m, "solutions.investor.journey.step3.b2"),
            t(m, "solutions.investor.journey.step3.b3"),
          ],
        },
      ]}
      faqTitle={t(m, "solutions.investor.faq.title")}
      faqs={[
        { q: t(m, "solutions.investor.faq.q1"), a: t(m, "solutions.investor.faq.a1") },
        { q: t(m, "solutions.investor.faq.q2"), a: t(m, "solutions.investor.faq.a2") },
        { q: t(m, "solutions.investor.faq.q3"), a: t(m, "solutions.investor.faq.a3") },
      ]}
      disclaimer={t(m, "solutions.investor.disclaimer")}
      // B2 Task 6 — investor trust strip (ASIC ABN, Privacy Act, Essential
      // Eight, Stripe verified, GST). Copy is hard-coded here (not through
      // t()) because these badges represent live regulatory facts about
      // Auschain PTY LTD, not translatable marketing copy.
      trustBadges={[
        { label: "ASIC ABN 79 659 615 111", sub: "Auschain PTY LTD" },
        { label: "Privacy Act 1988 compliant", sub: "APP 1–13 controls" },
        { label: "Essential Eight — ML1", sub: "ACSC-aligned baseline" },
        { label: "Stripe verified merchant", sub: "PCI DSS via Stripe" },
        { label: "GST-registered", sub: "ATO tax invoice on every charge" },
      ]}
      // B2 Task 7 — sample investor report preview. Links to the curated
      // samples index served under /reports/samples (same href the shared
      // hero secondary CTA already uses).
      samplePreview={{
        eyebrow: "Sample deliverable",
        title: "See a real Investor Trust Report before you decide",
        body: "Anonymised end-to-end memo: SVI score across 8 dimensions, AUD valuation range, cap-table + ESIC snapshot, and a 30-day investor-readiness plan. Same output you receive after checkout.",
        ctaLabel: "View sample report",
        ctaHref: "/reports/samples",
      }}
    />
  );
}
