/**
 * /vi — the Vietnamese homepage mirror (G21 P0-B, 2026-09-20; was G17 P2-A).
 *
 * Mirrors the English home v7 block for block on the unicorn template: the
 * one H1 from `hero.line.fi1` + the FI2 sub-line from vi.json, the same
 * search box (`ViHeroSearch` → `SmartIntake`, hand-off to /analyze), the two
 * CTAs (cohort pilot / score my startup), the trust line, then Problem →
 * Product sequence → Three messages → Why not ChatGPT → Built for → the
 * TrustBand placeholder (lane P0-A) → the closing CtaBand — no prices (D3),
 * no `A$` strings, no agent counts. Copy keys live under `vi.home.*` in
 * messages/vi.json; list-valued keys are `|`-separated.
 *
 * Chrome mirrors the English home: NavV2 + `<main id="main-content">` +
 * the one Footer (its language row links back to `/`). Static + ISR like
 * the English page (it reads no request state).
 */

import type { Metadata } from "next";
import {
  FileInput,
  FileSearch,
  FileText,
  Gauge,
  ShieldCheck,
  Table2,
  Timer,
  TrendingUp,
} from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { Footer } from "@/components/marketing/footer";
import {
  BuiltFor,
  CtaBand,
  CtaLink,
  FeatureGrid,
  PageHero,
  ProblemFlow,
  Section,
  SequenceFlow,
  TrustBand,
  WhyNotChatGPT,
} from "@/components/marketing/template";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { HOME_SAMPLE_LINK, HOME_SECONDARY_CTA, HOME_SEQUENCE } from "../(marketing)/home-content";
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

const PROBLEM_KEYS = ["inputs", "review", "feedback"] as const;
const SEQUENCE = [
  { key: "application", icon: FileInput },
  { key: "evidence", icon: FileSearch },
  { key: "score", icon: Gauge },
  { key: "dossier", icon: FileText },
  { key: "cohort", icon: Table2 },
  { key: "progress", icon: TrendingUp },
] as const;
const MESSAGES = [
  { key: "faster", icon: Timer },
  { key: "evidence", icon: ShieldCheck },
  { key: "improvement", icon: TrendingUp },
] as const;

/** `|`-separated list values in vi.json. */
function list(value: string): string[] {
  return value.split("|").map((s) => s.trim()).filter(Boolean);
}

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
          title={t(m, "hero.line.fi1")}
          sub={t(m, "hero.line.fi2")}
          ctas={[
            { href: "/vi/solutions/accelerator#pilot", label: t(m, "vi.home.cta.primary"), ctaId: "vi_hero_pilot" },
            { href: HOME_SECONDARY_CTA.href, label: t(m, "vi.home.cta.secondary"), ctaId: "vi_hero_score" },
          ]}
          visual={<ViHeroSearch placeholder={t(m, "vi.home.search.placeholder")} />}
          footnote={
            <span data-testid="hero-trust-line" className="font-medium tracking-wide text-secondary">
              {t(m, "vi.home.trustLine")}
            </span>
          }
        />

        <Section
          id="problem"
          eyebrow={t(m, "vi.home.problem.eyebrow")}
          title={t(m, "vi.home.problem.title")}
          lede={t(m, "vi.home.problem.lede")}
          align="center"
          tone="sunken"
        >
          <ProblemFlow
            ariaLabel={t(m, "vi.home.problem.title")}
            steps={PROBLEM_KEYS.map((k) => ({
              title: t(m, `vi.home.problem.${k}.title`),
              body: t(m, `vi.home.problem.${k}.body`),
              examples: list(t(m, `vi.home.problem.${k}.examples`)),
            }))}
          />
        </Section>

        <Section
          id="sequence"
          eyebrow={t(m, "vi.home.sequence.eyebrow")}
          title={t(m, "vi.home.sequence.title")}
          lede={t(m, "vi.home.sequence.lede")}
          align="center"
        >
          <SequenceFlow
            ariaLabel={t(m, "vi.home.sequence.title")}
            href={HOME_SEQUENCE.href}
            linkLabel={t(m, "vi.home.sequence.link")}
            ctaId="vi_home_sequence_product"
            steps={SEQUENCE.map((s) => ({
              icon: s.icon,
              title: t(m, `vi.home.sequence.${s.key}.title`),
              caption: t(m, `vi.home.sequence.${s.key}.caption`),
            }))}
          />
          <p className="mt-6 text-center text-sm text-muted">
            <CtaLink href={HOME_SAMPLE_LINK.href} label={t(m, "vi.home.sample.label")} ctaId="vi_home_sample_dossier" variant="link" />
          </p>
        </Section>

        <Section
          id="messages"
          eyebrow={t(m, "vi.home.messages.eyebrow")}
          title={t(m, "vi.home.messages.title")}
          align="center"
          tone="sunken"
        >
          <FeatureGrid
            columns={3}
            ariaLabel={t(m, "vi.home.messages.eyebrow")}
            items={MESSAGES.map((x) => ({
              icon: x.icon,
              title: t(m, `vi.home.messages.${x.key}.title`),
              body: t(m, `vi.home.messages.${x.key}.body`),
            }))}
          />
        </Section>

        <Section
          id="why-not-chatgpt"
          eyebrow={t(m, "vi.home.whynot.eyebrow")}
          title={t(m, "vi.home.whynot.title")}
          align="center"
        >
          <WhyNotChatGPT
            other={{
              title: t(m, "vi.home.whynot.other.title"),
              sub: t(m, "vi.home.whynot.other.sub"),
              items: list(t(m, "vi.home.whynot.other.items")),
            }}
            ours={{
              title: t(m, "vi.home.whynot.ours.title"),
              sub: t(m, "vi.home.whynot.ours.sub"),
              items: list(t(m, "vi.home.whynot.ours.items")),
            }}
            line={t(m, "vi.home.whynot.line")}
          />
        </Section>

        <Section
          id="built-for"
          eyebrow={t(m, "vi.home.builtFor.eyebrow")}
          title={t(m, "vi.home.builtFor.title")}
          lede={t(m, "vi.home.builtFor.lede")}
          align="center"
          tone="sunken"
        >
          <BuiltFor
            ariaLabel={t(m, "vi.home.builtFor.eyebrow")}
            items={list(t(m, "vi.home.builtFor.items")).map((label) => ({ label }))}
          />
        </Section>

        {/* Trust band — same slot as the English home (G21 P0-A). */}
        <TrustBand locale="vi" />

        <Section id="notice" ariaLabel="Vietnamese founder notice" spacing="sm" align="center">
          <p className="mx-auto max-w-2xl text-center text-sm text-secondary">{t(m, "vi.hero.notice")}</p>
        </Section>

        <CtaBand
          title={t(m, "vi.home.final.title")}
          sub={t(m, "vi.home.final.sub")}
          primary={{ href: "/vi/solutions/accelerator#pilot", label: t(m, "vi.home.cta.primary"), ctaId: "vi_home_final_pilot" }}
          secondary={{ href: HOME_SECONDARY_CTA.href, label: t(m, "vi.home.cta.secondary"), ctaId: "vi_home_final_score" }}
          tone="sunken"
        />
      </main>

      {/* The one public footer — entity strings from lib/site/legal-entity.ts (G21 P0-A). */}
      <Footer />
    </div>
  );
}
