// /about/invest — the "Invest in BlockID" pitch (G13-W5-IA5, spec §A.4 /
// §C.2, founder decision F2). Lived at /investors until S-IA5, where it
// collided with /investor (the public landing FOR investors); /investors
// is now a permanent redirect here (lib/nav/legacy-redirects.ts) and this
// page carries its own canonical. Entity on the JSON-LD is the legal one
// (Auschain PTY LTD — the OrganizationJsonLd in the root layout); the
// footer keeps the marketing entity.
//
// G17 P2-A: on the unicorn template — PageHero → Section (market, StatStrip)
// → Section (product) → Section (investor tools, FeatureGrid) → Section
// (business model + ladder by name; amounts live on /pricing) → Section
// (traction, StatStrip) → Section (team, Prose) → Section (the ask,
// FeatureGrid) → CtaBand. Copy in `invest-content.ts`.

import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  DollarSign,
  Eye,
  FolderOpen,
  Layers,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  CtaBand,
  FeatureGrid,
  PageHero,
  Prose,
  Section,
  StatStrip,
  type FeatureItem,
} from "@/components/marketing/template";
import { WebPageJsonLd } from "@/components/seo/json-ld";
import { pageMetadata, SITE_URL } from "@/lib/seo/page-meta";
import {
  INVEST_ASK,
  INVEST_BUSINESS_MODEL,
  INVEST_INVESTOR_TOOLS,
  INVEST_LADDER,
  INVEST_MARKET_STATS,
  INVEST_SVI_DIMENSIONS,
  INVEST_TEAM_PARAGRAPH,
  INVEST_TRACTION_POINTS,
  INVEST_TRACTION_STATS,
  type InvestCard,
  type InvestIcon,
} from "./invest-content";

export const INVEST_PATH = "/about/invest";
const TITLE = "Invest in BlockID — the investment opportunity";
const DESCRIPTION =
  "Why BlockID: 600K AU companies, evidence-backed SVI engine, SaaS + credit hybrid model, 88-99.9% gross margins. Explore the investment opportunity.";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: INVEST_PATH,
});

export const revalidate = 300;

const ICONS: Record<InvestIcon, LucideIcon> = {
  "shield-check": ShieldCheck,
  eye: Eye,
  folder: FolderOpen,
  "bar-chart": BarChart3,
  layers: Layers,
  trending: TrendingUp,
  users: Users,
  dollar: DollarSign,
  rocket: Rocket,
};

const items = (cards: readonly InvestCard[]): FeatureItem[] =>
  cards.map((c) => ({ icon: ICONS[c.icon], title: c.title, body: c.body }));

export default function InvestInBlockIdPage() {
  return (
    <MarketingShell>
      <WebPageJsonLd
        url={`${SITE_URL}${INVEST_PATH}`}
        name={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[
          { name: "About", url: `${SITE_URL}/about` },
          { name: "Invest in BlockID", url: `${SITE_URL}${INVEST_PATH}` },
        ]}
      />

      <PageHero
        eyebrow="Investment opportunity"
        title="The ownership intelligence platform for 600,000 Australian companies."
        sub="BlockID gives investors clarity and confidence to back great Australian startups — from first look to portfolio management, with verified data at your fingertips."
        ctas={[
          {
            href: "mailto:admin@blockid.au?subject=BlockID%20Investment%20Enquiry",
            label: "Schedule a call",
            ctaId: "invest_hero_call",
          },
          { href: "/contact", label: "Contact us" },
        ]}
      />

      <Section
        id="market"
        eyebrow="Why BlockID"
        title="Most companies reach their first round unprepared."
        lede="Most Australian startups reach their first funding round with cap tables in spreadsheets, no formal valuation history and incomplete compliance records. BlockID solves this from day one — a structured, evidence-backed foundation that makes companies investable earlier and reduces due diligence friction for investors."
        tone="sunken"
      >
        <StatStrip ariaLabel="Market" stats={INVEST_MARKET_STATS} />
      </Section>

      <Section
        id="product"
        eyebrow="The product"
        title="Startup Value Index (SVI)"
        lede="Our proprietary SVI engine scores startups across 8 dimensions using AI-powered analysis and real evidence — not self-reported surveys. Each analysis produces a comprehensive report with actionable recommendations, competitive intelligence and growth scoring."
        actions={[{ href: "/product", label: "How the score works", variant: "link" }]}
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="The eight SVI dimensions">
          {INVEST_SVI_DIMENSIONS.map((dim) => (
            <li key={dim} className="flex items-center gap-2 rounded-lg border border-line-subtle bg-surface px-3 py-2.5 shadow-1">
              <CheckCircle2 strokeWidth={1.75} aria-hidden className="h-3.5 w-3.5 shrink-0 text-action" />
              <span className="text-xs font-medium text-primary">{dim}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="tools" eyebrow="Investor tools" title="What an evaluator gets." tone="sunken">
        <FeatureGrid columns={2} ariaLabel="Investor tools" items={items(INVEST_INVESTOR_TOOLS)} />
      </Section>

      <Section
        id="model"
        eyebrow="Business model"
        title="Subscriptions plus credits, at software margins."
        actions={[{ href: "/pricing", label: "See the price ladder", variant: "link" }]}
      >
        <FeatureGrid columns={2} ariaLabel="Business model" items={items(INVEST_BUSINESS_MODEL)} />
        <div className="mt-8 overflow-hidden rounded-xl border border-line-subtle bg-surface shadow-1">
          <div className="border-b border-line-subtle bg-surface-sunken px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">The ladder</p>
          </div>
          <ul className="divide-y divide-line-subtle">
            {INVEST_LADDER.map(({ tier, detail }) => (
              <li key={tier} className="px-5 py-3">
                <p className="text-sm font-semibold text-primary">{tier}</p>
                <p className="text-xs text-secondary">{detail}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-line-subtle px-5 py-3 text-xs text-muted">
            Amounts, GST and trial terms are on{" "}
            <Link href="/pricing" className="font-medium text-action underline-offset-4 hover:underline">
              /pricing
            </Link>
            .
          </p>
        </div>
      </Section>

      <Section id="traction" eyebrow="Traction" title="What is live today." tone="sunken">
        <StatStrip ariaLabel="Traction" stats={INVEST_TRACTION_STATS} caption="Each figure has a source in the repository; nothing here is projected." />
        <ul className="mt-8 space-y-2.5">
          {INVEST_TRACTION_POINTS.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-secondary">
              <CheckCircle2 strokeWidth={1.75} aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-action" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="team" eyebrow="The team" title="Solo founder + 11 C-Level agents.">
        <Prose>
          <p>{INVEST_TEAM_PARAGRAPH}</p>
        </Prose>
      </Section>

      <Section id="ask" eyebrow="What we are looking for" title="Partners, angels, programs." tone="sunken">
        <FeatureGrid columns={3} ariaLabel="What we are looking for" items={items(INVEST_ASK)} />
      </Section>

      <CtaBand
        title="Interested in partnering with BlockID?"
        sub="We are looking for strategic partners, angel investors and accelerator partnerships to help bring ownership intelligence to every Australian founder."
        primary={{
          href: "mailto:admin@blockid.au?subject=BlockID%20Investment%20Enquiry",
          label: "Schedule a call",
          ctaId: "invest_final_call",
        }}
        secondary={{ href: "/contact", label: "Contact us" }}
        footnote={
          <>
            Or email us directly at{" "}
            <a href="mailto:admin@blockid.au" className="text-action underline underline-offset-2">
              admin@blockid.au
            </a>
          </>
        }
        tone="base"
      />
    </MarketingShell>
  );
}
