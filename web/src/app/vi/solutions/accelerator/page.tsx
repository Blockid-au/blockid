/**
 * /vi/solutions/accelerator — Vietnamese mirror of the Accelerator persona
 * page (P-04). Master Upgrade Plan §7.7 bilingual rule + D4 pre-empt.
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { SolutionsPageShell } from "../../../(marketing)/solutions/solutions-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/solutions/accelerator`;
const CANONICAL_VI = `${SITE_URL}/vi/solutions/accelerator`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  const title = t(m, "meta.solutions.accelerator.title");
  const description = t(m, "meta.solutions.accelerator.description");
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

export default async function ViSolutionsAcceleratorPage() {
  const m = await getMessages("vi");

  return (
    <SolutionsPageShell
      slug="accelerator"
      lang="vi"
      eyebrow={t(m, "solutions.accelerator.eyebrow")}
      headline={t(m, "solutions.accelerator.headline")}
      personaLine={t(m, "solutions.accelerator.persona")}
      emotionalLine={t(m, "hero.v3.emotional")}
      outcomeLine={t(m, "hero.v3.outcome")}
      primaryCtaLabel={t(m, "hero.v3.cta.primary.signedOut")}
      secondaryCtaLabel={t(m, "hero.v3.cta.secondary")}
      benefitsTitle={t(m, "solutions.accelerator.benefits.title")}
      benefits={[
        {
          title: t(m, "solutions.accelerator.benefit1.title"),
          body: t(m, "solutions.accelerator.benefit1.body"),
        },
        {
          title: t(m, "solutions.accelerator.benefit2.title"),
          body: t(m, "solutions.accelerator.benefit2.body"),
        },
        {
          title: t(m, "solutions.accelerator.benefit3.title"),
          body: t(m, "solutions.accelerator.benefit3.body"),
        },
      ]}
      journeyTitle={t(m, "solutions.accelerator.journey.title")}
      journey={[
        {
          window: t(m, "solutions.accelerator.journey.window1"),
          headline: t(m, "solutions.accelerator.journey.step1.head"),
          bullets: [
            t(m, "solutions.accelerator.journey.step1.b1"),
            t(m, "solutions.accelerator.journey.step1.b2"),
            t(m, "solutions.accelerator.journey.step1.b3"),
          ],
        },
        {
          window: t(m, "solutions.accelerator.journey.window2"),
          headline: t(m, "solutions.accelerator.journey.step2.head"),
          bullets: [
            t(m, "solutions.accelerator.journey.step2.b1"),
            t(m, "solutions.accelerator.journey.step2.b2"),
            t(m, "solutions.accelerator.journey.step2.b3"),
          ],
        },
        {
          window: t(m, "solutions.accelerator.journey.window3"),
          headline: t(m, "solutions.accelerator.journey.step3.head"),
          bullets: [
            t(m, "solutions.accelerator.journey.step3.b1"),
            t(m, "solutions.accelerator.journey.step3.b2"),
            t(m, "solutions.accelerator.journey.step3.b3"),
          ],
        },
      ]}
      faqTitle={t(m, "solutions.accelerator.faq.title")}
      faqs={[
        { q: t(m, "solutions.accelerator.faq.q1"), a: t(m, "solutions.accelerator.faq.a1") },
        { q: t(m, "solutions.accelerator.faq.q2"), a: t(m, "solutions.accelerator.faq.a2") },
        { q: t(m, "solutions.accelerator.faq.q3"), a: t(m, "solutions.accelerator.faq.a3") },
      ]}
      disclaimer={t(m, "solutions.accelerator.disclaimer")}
    />
  );
}
