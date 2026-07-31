/**
 * /vi/solutions/founder — Vietnamese mirror of the Founder persona page (P-01).
 *
 * Master Upgrade Plan §7.7 bilingual rule + user-locked decision D4 (pre-empt).
 * All strings resolve via `t()` against the `vi.json` catalog (with EN fallback
 * for any missing key).
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { SolutionsPageShell } from "../../../(marketing)/solutions/solutions-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/solutions/founder`;
const CANONICAL_VI = `${SITE_URL}/vi/solutions/founder`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  const title = t(m, "meta.solutions.founder.title");
  const description = t(m, "meta.solutions.founder.description");
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

export default async function ViSolutionsFounderPage() {
  const m = await getMessages("vi");

  return (
    <SolutionsPageShell
      slug="founder"
      lang="vi"
      eyebrow={t(m, "solutions.founder.eyebrow")}
      headline={t(m, "solutions.founder.headline")}
      personaLine={t(m, "solutions.founder.persona")}
      emotionalLine={t(m, "hero.v3.emotional")}
      outcomeLine={t(m, "hero.v3.outcome")}
      primaryCtaLabel={t(m, "hero.v3.cta.primary.signedOut")}
      secondaryCtaLabel={t(m, "hero.v3.cta.secondary")}
      benefitsTitle={t(m, "solutions.founder.benefits.title")}
      benefits={[
        {
          title: t(m, "solutions.founder.benefit1.title"),
          body: t(m, "solutions.founder.benefit1.body"),
        },
        {
          title: t(m, "solutions.founder.benefit2.title"),
          body: t(m, "solutions.founder.benefit2.body"),
        },
        {
          title: t(m, "solutions.founder.benefit3.title"),
          body: t(m, "solutions.founder.benefit3.body"),
        },
      ]}
      journeyTitle={t(m, "solutions.founder.journey.title")}
      journey={[
        {
          window: t(m, "solutions.founder.journey.window1"),
          headline: t(m, "solutions.founder.journey.step1.head"),
          bullets: [
            t(m, "solutions.founder.journey.step1.b1"),
            t(m, "solutions.founder.journey.step1.b2"),
            t(m, "solutions.founder.journey.step1.b3"),
          ],
        },
        {
          window: t(m, "solutions.founder.journey.window2"),
          headline: t(m, "solutions.founder.journey.step2.head"),
          bullets: [
            t(m, "solutions.founder.journey.step2.b1"),
            t(m, "solutions.founder.journey.step2.b2"),
            t(m, "solutions.founder.journey.step2.b3"),
          ],
        },
        {
          window: t(m, "solutions.founder.journey.window3"),
          headline: t(m, "solutions.founder.journey.step3.head"),
          bullets: [
            t(m, "solutions.founder.journey.step3.b1"),
            t(m, "solutions.founder.journey.step3.b2"),
            t(m, "solutions.founder.journey.step3.b3"),
          ],
        },
      ]}
      faqTitle={t(m, "solutions.founder.faq.title")}
      faqs={[
        { q: t(m, "solutions.founder.faq.q1"), a: t(m, "solutions.founder.faq.a1") },
        { q: t(m, "solutions.founder.faq.q2"), a: t(m, "solutions.founder.faq.a2") },
        { q: t(m, "solutions.founder.faq.q3"), a: t(m, "solutions.founder.faq.a3") },
      ]}
      disclaimer={t(m, "solutions.founder.disclaimer")}
    />
  );
}
