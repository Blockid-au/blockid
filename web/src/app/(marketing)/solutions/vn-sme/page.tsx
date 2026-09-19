/**
 * /solutions/vn-sme — the Vietnamese-Australian founder persona page.
 *
 * Every visible string resolves through `t()` against the shared catalogue, so
 * the Vietnamese mirror at /vi/solutions/vn-sme renders the same page from the
 * same shell. Amounts are never strings: the copy carries `{growthPrice}`-style
 * tokens and `SolutionsPageShell` substitutes them from the pricing catalogue,
 * which is why a price change in plans.csv reaches both languages at once.
 *
 * Server component. No client state, no data fetch.
 */


import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { SolutionsPageShell } from "../solutions-shared";

const PATH = "/solutions/vn-sme";
const VI_PATH = "/vi/solutions/vn-sme";

// G17 P2-A: canonical + hreflang pair + OG image via `pageMetadata` (the root
// template appends the brand suffix).
export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  return pageMetadata({
    title: t(m, "meta.solutions.vnSme.title"),
    description: t(m, "meta.solutions.vnSme.description"),
    path: PATH,
    viPath: VI_PATH,
  });
}

export default async function SolutionsVnSmePage() {
  const m = await getMessages("en");

  return (
    <SolutionsPageShell
      slug="vn-sme"
      lang="en"
      eyebrow={t(m, "solutions.vnSme.eyebrow")}
      headline={t(m, "solutions.vnSme.headline")}
      personaLine={t(m, "solutions.vnSme.persona")}
      emotionalLine={t(m, "solutions.vnSme.lede")}
      outcomeLine={t(m, "solutions.vnSme.support")}
      primaryCtaLabel={t(m, "solutions.vnSme.cta")}
      // Deliberately /pricing, not /one-click-report: that page carries an
      // unattributed testimonial ("— Australian founder feedback") that
      // nothing in the repo backs, and a persona page must not funnel
      // traffic into a claim it cannot stand behind.
      secondaryCtaLabel={t(m, "solutions.cta.secondary.pricing")}
      secondaryCtaHref="/pricing"
      benefitsTitle={t(m, "solutions.vnSme.benefits.title")}
      benefits={[
        {
          title: t(m, "solutions.vnSme.benefit1.title"),
          body: t(m, "solutions.vnSme.benefit1.body"),
        },
        {
          title: t(m, "solutions.vnSme.benefit2.title"),
          body: t(m, "solutions.vnSme.benefit2.body"),
        },
      ]}
      // No 30/60/90 arc: this persona has no honest three-stage
      // programme to describe, and the one that used to sit here was
      // built from capabilities that do not exist.
      faqTitle={t(m, "solutions.vnSme.faq.title")}
      faqs={[
        { q: t(m, "solutions.vnSme.faq.q1"), a: t(m, "solutions.vnSme.faq.a1") },
        { q: t(m, "solutions.vnSme.faq.q2"), a: t(m, "solutions.vnSme.faq.a2") },
      ]}
      disclaimer={t(m, "solutions.vnSme.disclaimer")}
    />
  );
}
