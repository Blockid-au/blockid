/**
 * /about — who builds BlockID and how.
 *
 * G17 P2-A: on the unicorn template — PageHero → Section (mission, Prose)
 * → Section (what we do, FeatureGrid) → Section (approach, FeatureGrid) →
 * Section (team, Prose) → Section (proof, ProofBand) → Section (Australian-
 * native) → LogoCloud → CtaBand. Copy lives in `about-content.ts`.
 *
 * Server component. Renders inside `MarketingShell`.
 */

import type { Metadata } from "next";
import {
  Bot,
  CheckCircle2,
  Code2,
  FileText,
  Globe,
  LayoutDashboard,
  Scale,
  Shield,
  Target,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { pageMetadata } from "@/lib/seo/page-meta";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  CtaBand,
  FeatureGrid,
  PageHero,
  ProofBand,
  Prose,
  Section,
  type FeatureItem,
} from "@/components/marketing/template";
import { LogoCloud } from "@/components/landing/logo-cloud";
import {
  ABOUT_APPROACH,
  ABOUT_AU_NATIVE,
  ABOUT_PROOF,
  ABOUT_TEAM_PARAGRAPHS,
  ABOUT_WHAT_WE_DO,
  type AboutCard,
  type AboutIcon,
} from "./about-content";

export const metadata: Metadata = pageMetadata({
  title: "About BlockID — AI startup ownership platform",
  description: "BlockID helps Australian founders build valuable, investable businesses from day one with AI-powered valuation, ownership intelligence, and investor-readiness tools.",
  path: "/about",
});

export const revalidate = 300;

const ICONS: Record<AboutIcon, LucideIcon> = {
  target: Target,
  layout: LayoutDashboard,
  file: FileText,
  globe: Globe,
  zap: Zap,
  code: Code2,
  shield: Shield,
  scale: Scale,
  bot: Bot,
  trending: TrendingUp,
};

function items(cards: readonly AboutCard[], prefix: string): FeatureItem[] {
  return cards.map((c, i) => ({
    icon: ICONS[c.icon],
    title: c.title,
    body: c.body,
    href: c.href,
    cta: c.cta,
    ctaId: c.href ? `about_${prefix}_${i + 1}` : undefined,
  }));
}

export default function AboutPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="About BlockID.au"
        title="Helping Australian founders build valuable, investable businesses from day one."
        sub="BlockID is an AI-powered startup valuation and ownership intelligence platform. We give founders the clarity, confidence and tools to move from idea to investable business — with evidence-backed scoring, not guesswork."
        ctas={[
          { href: "/analyze", label: "Score a startup", ctaId: "about_hero_score" },
          { href: "/contact", label: "Contact us" },
        ]}
        align="start"
      />

      <Section id="mission" eyebrow="Our mission" title="Close the gap between a spreadsheet and an investable company." tone="sunken">
        <Prose>
          <p>
            Too many startups lose momentum — and equity — because cap tables live in spreadsheets, valuations
            are guesswork, and fundraising readiness is an afterthought. We believe every Australian founder
            deserves institutional-grade tools to build, protect and grow their company. BlockID exists to close
            that gap.
          </p>
        </Prose>
      </Section>

      <Section id="what" eyebrow="What we do" title="One platform, six surfaces.">
        <FeatureGrid columns={3} ariaLabel="What we do" items={items(ABOUT_WHAT_WE_DO, "what")} />
      </Section>

      <Section id="approach" eyebrow="Our approach" title="Evidence first, Australia first." tone="sunken">
        <FeatureGrid columns={2} ariaLabel="Our approach" items={items(ABOUT_APPROACH, "approach")} />
      </Section>

      <Section id="team" eyebrow="The team" title="One founder, a C-suite of agents, a human review." actions={[{ href: "/team", label: "Meet the agents", variant: "link" }]}>
        <Prose>
          {ABOUT_TEAM_PARAGRAPHS.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </Prose>
      </Section>

      <Section id="proof" ariaLabel="Platform at a glance" spacing="sm" tone="sunken">
        <ProofBand eyebrow="Platform at a glance" ariaLabel="Platform at a glance" items={ABOUT_PROOF} />
      </Section>

      <Section id="australian" eyebrow="Australian-native" title="Built here, hosted here, compliant here.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {ABOUT_AU_NATIVE.map((item) => (
            <li key={item} className="flex items-start gap-2.5 rounded-xl border border-line-subtle bg-surface p-4 text-sm text-secondary shadow-1">
              <CheckCircle2 strokeWidth={1.75} aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-action" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {/* Curator-controlled accelerator strip — renders nothing when the config is empty. */}
        <LogoCloud group="accepted" className="mt-12" />
      </Section>

      <CtaBand
        title="Get your free Startup Value Index analysis in under 60 seconds."
        sub="Paste a name, a deck or a URL. No card, no account needed for the first run."
        primary={{ href: "/analyze", label: "Get your free SVI", ctaId: "about_final_score" }}
        secondary={{ href: "/contact", label: "Contact us" }}
      />
    </MarketingShell>
  );
}
