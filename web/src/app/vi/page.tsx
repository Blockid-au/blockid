/**
 * /vi — the Vietnamese homepage mirror (G17 P2-A, 2026-09-19).
 *
 * Rebuilt on the unicorn template to match the English home (D3): the one
 * H1 from `hero.line.e1` + the E2 sub-line from vi.json, the same search
 * box (`ViHeroSearch` → `SmartIntake`, hand-off to /analyze), three
 * audience cards onto the `/vi/solutions/*` mirrors, the founder notice,
 * and the closing CtaBand — no prices (D3), no `A$` strings. Copy keys
 * live under `vi.home.*` in messages/vi.json.
 *
 * Chrome mirrors the English home: NavV2 + `<main id="main-content">` +
 * the one Footer (its language row links back to `/`). Static + ISR like
 * the English page (it reads no request state).
 */

import type { Metadata } from "next";
import { Briefcase, Handshake, Rocket } from "lucide-react";
import Link from "next/link";
import { NavV2 } from "@/components/landing/nav-v2";
import { Footer } from "@/components/marketing/footer";
import {
  CtaBand,
  FeatureGrid,
  FOCUS_RING,
  MOTION,
  PageHero,
  Section,
} from "@/components/marketing/template";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { ViHeroSearch } from "./vi-hero-search";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  return pageMetadata({
    title: t(m, "meta.home.title"),
    description: t(m, "meta.home.description"),
    path: "/vi",
    viPath: "/vi",
    lang: "vi",
  });
}

const AUDIENCES = [
  { key: "investor", icon: Briefcase, href: "/vi/solutions/investor" },
  { key: "accelerator", icon: Rocket, href: "/vi/solutions/accelerator" },
  { key: "advisor", icon: Handshake, href: "/vi/solutions/advisor" },
] as const;

export default async function ViHomePage() {
  const m = await getMessages("vi");

  return (
    <div lang="vi" className="min-h-screen bg-surface text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-action focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-action"
      >
        Đi tới nội dung chính
      </a>

      <NavV2 />

      <main id="main-content">
        <PageHero
          eyebrow={t(m, "vi.home.eyebrow")}
          title={t(m, "hero.line.e1")}
          sub={t(m, "hero.line.e2")}
          ctas={[
            { href: "/analyze", label: t(m, "vi.home.cta.primary"), ctaId: "vi_hero_score" },
            { href: "/tbr/demo", label: t(m, "vi.home.cta.secondary"), ctaId: "vi_hero_sample" },
          ]}
          visual={<ViHeroSearch placeholder={t(m, "vi.home.search.placeholder")} />}
          footnote={
            <>
              {t(m, "vi.home.founderLine")}{" "}
              <Link
                href="/vi/solutions/founder"
                className={`inline-flex min-h-11 items-center rounded-md font-medium text-action underline-offset-4 hover:underline ${MOTION} ${FOCUS_RING}`}
              >
                {t(m, "vi.home.founderLink")}
              </Link>
            </>
          }
        />

        <Section
          id="audiences"
          eyebrow={t(m, "vi.home.audiences.eyebrow")}
          title={t(m, "vi.home.audiences.title")}
          lede={t(m, "vi.home.audiences.lede")}
          align="center"
          tone="sunken"
        >
          <FeatureGrid
            columns={3}
            ariaLabel={t(m, "vi.home.audiences.title")}
            items={AUDIENCES.map((a) => ({
              icon: a.icon,
              title: t(m, `vi.home.audience.${a.key}.title`),
              body: t(m, `vi.home.audience.${a.key}.body`),
              href: a.href,
              cta: t(m, "vi.home.audience.cta"),
              ctaId: `vi_home_audience_${a.key}`,
            }))}
          />
        </Section>

        <Section id="notice" ariaLabel="Vietnamese founder notice" spacing="sm" align="center">
          <p className="mx-auto max-w-2xl text-center text-sm text-secondary">{t(m, "vi.hero.notice")}</p>
        </Section>

        <CtaBand
          title={t(m, "vi.home.final.title")}
          sub={t(m, "vi.home.final.sub")}
          primary={{ href: "/analyze", label: t(m, "vi.home.cta.primary"), ctaId: "vi_home_final_score" }}
          secondary={{ href: "/samples", label: t(m, "vi.home.final.secondary") }}
          tone="dark"
        />
      </main>

      {/* The one public footer — marketing entity PPL Food PTY LTD (billing /
          legal / JSON-LD say Auschain PTY LTD; never swap). */}
      <Footer />
    </div>
  );
}
