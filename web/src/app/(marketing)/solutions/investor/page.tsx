/**
 * /solutions/investor — the investor and analyst persona page.
 *
 * Every visible string resolves through `t()` against the shared catalogue, so
 * the Vietnamese mirror at /vi/solutions/investor renders the same page from the
 * same shell. Amounts are never strings: the copy carries `{growthPrice}`-style
 * tokens and `SolutionsPageShell` substitutes them from the pricing catalogue,
 * which is why a price change in plans.csv reaches both languages at once.
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
      emotionalLine={t(m, "solutions.investor.lede")}
      outcomeLine={t(m, "solutions.investor.support")}
      primaryCtaLabel={t(m, "solutions.investor.cta")}
      secondaryCtaLabel={t(m, "solutions.cta.secondary.report")}
      secondaryCtaHref="/one-click-report"
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
      // No 30/60/90 arc: this persona has no honest three-stage
      // programme to describe, and the one that used to sit here was
      // built from capabilities that do not exist.
      faqTitle={t(m, "solutions.investor.faq.title")}
      faqs={[
        { q: t(m, "solutions.investor.faq.q1"), a: t(m, "solutions.investor.faq.a1") },
        { q: t(m, "solutions.investor.faq.q2"), a: t(m, "solutions.investor.faq.a2") },
        { q: t(m, "solutions.investor.faq.q3"), a: t(m, "solutions.investor.faq.a3") },
      ]}
      disclaimer={t(m, "solutions.investor.disclaimer")}
      // Regulatory facts about Auschain PTY LTD that we can point at, not
      // capability claims — hard-coded rather than translated for that reason.
      // The Privacy Act and Essential Eight lines are the same two already
      // published in the sitewide marketing JSON-LD.
      trustBadges={[
        { label: "ASIC ABN 79 659 615 111", sub: "Auschain PTY LTD" },
        { label: "Privacy Act 1988", sub: "APP 1-13 controls" },
        { label: "Essential Eight — ML1", sub: "ACSC-aligned baseline" },
        { label: "Stripe verified merchant", sub: "PCI DSS via Stripe" },
        { label: "GST-registered", sub: "ATO tax invoice on every charge" },
      ]}
    />
  );
}
