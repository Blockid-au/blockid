/**
 * /vi/solutions/vn-sme — Vietnamese mirror of the VN-SME persona page.
 *
 * Master Upgrade Plan §7.7 bilingual rule + user-locked decision D4:
 * Phase 1 MVP translates `/`, `/pricing`, `/solutions/vn-sme`. This route
 * is the VI half of the last surface; all strings resolve via `t()` against
 * the `vi.json` catalog (with EN fallback for any missing key).
 *
 * Server component. No data fetch, no client state.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { SolutionsPageShell } from "../../../solutions/solutions-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/solutions/vn-sme`;
const CANONICAL_VI = `${SITE_URL}/vi/solutions/vn-sme`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  const title = t(m, "meta.solutions.vnSme.title");
  const description = t(m, "meta.solutions.vnSme.description");
  return {
    title,
    description,
    alternates: {
      canonical: CANONICAL_VI,
      languages: {
        en: CANONICAL_EN,
        vi: CANONICAL_VI,
        "x-default": CANONICAL_EN,
      },
    },
    openGraph: {
      title,
      description,
      url: CANONICAL_VI,
      siteName: "BlockID.au",
      type: "website",
      locale: "vi_VN",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function ViSolutionsVnSmePage() {
  const m = await getMessages("vi");

  return (
    <SolutionsPageShell
      slug="vn-sme"
      lang="vi"
      eyebrow={t(m, "solutions.vnSme.eyebrow")}
      headline={t(m, "solutions.vnSme.headline")}
      personaLine={t(m, "solutions.vnSme.persona")}
      emotionalLine={t(m, "hero.v3.emotional")}
      outcomeLine={t(m, "hero.v3.outcome")}
      primaryCtaLabel={t(m, "hero.v3.cta.primary.signedOut")}
      secondaryCtaLabel={t(m, "hero.v3.cta.secondary")}
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
        {
          title: t(m, "solutions.vnSme.benefit3.title"),
          body: t(m, "solutions.vnSme.benefit3.body"),
        },
      ]}
      journeyTitle={t(m, "solutions.vnSme.journey.title")}
      journey={[
        {
          window: t(m, "solutions.vnSme.journey.window1"),
          headline: t(m, "solutions.vnSme.journey.step1.head"),
          bullets: [
            t(m, "solutions.vnSme.journey.step1.b1"),
            t(m, "solutions.vnSme.journey.step1.b2"),
            t(m, "solutions.vnSme.journey.step1.b3"),
          ],
        },
        {
          window: t(m, "solutions.vnSme.journey.window2"),
          headline: t(m, "solutions.vnSme.journey.step2.head"),
          bullets: [
            t(m, "solutions.vnSme.journey.step2.b1"),
            t(m, "solutions.vnSme.journey.step2.b2"),
            t(m, "solutions.vnSme.journey.step2.b3"),
          ],
        },
        {
          window: t(m, "solutions.vnSme.journey.window3"),
          headline: t(m, "solutions.vnSme.journey.step3.head"),
          bullets: [
            t(m, "solutions.vnSme.journey.step3.b1"),
            t(m, "solutions.vnSme.journey.step3.b2"),
            t(m, "solutions.vnSme.journey.step3.b3"),
          ],
        },
      ]}
      faqTitle={t(m, "solutions.vnSme.faq.title")}
      faqs={[
        { q: t(m, "solutions.vnSme.faq.q1"), a: t(m, "solutions.vnSme.faq.a1") },
        { q: t(m, "solutions.vnSme.faq.q2"), a: t(m, "solutions.vnSme.faq.a2") },
        { q: t(m, "solutions.vnSme.faq.q3"), a: t(m, "solutions.vnSme.faq.a3") },
      ]}
      disclaimer={t(m, "solutions.vnSme.disclaimer")}
    />
  );
}
