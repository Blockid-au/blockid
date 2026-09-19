/**
 * Shared body for /funding and /vi/funding (T0242 page, T0248 copy pack).
 *
 * Every D-3 string (hero H1 / sub / trust line, CTAs, paywall, price ladder)
 * comes from `lib/funding/copy.ts` via `fundingCopy(group, key, tokens,
 * messages)` — EN by default, the VI catalogue (`funding.copy.*` in
 * messages/vi.json) when the Vietnamese page passes `getMessages("vi")`. The
 * client intake keeps its EN strings; the runtime translator swaps them on
 * /vi/* (seeded by `buildSeedCatalog` from the same keys).
 *
 * The hero number is computed live from `au_grants` (sum of `amount_max_aud`
 * over open rows) — never hard-coded (plan §4i D-3).
 *
 * G17 P2-A: on the unicorn template — PageHero → FundingIntake (its own
 * `#intake` section, shared with the workspace) → Section (three paths,
 * FeatureGrid) → Section (capitals + price ladder as a StatStrip) →
 * Section (evaluators + read-more + disclaimer) → CtaBand.
 */

import Link from "next/link";
import { ArrowRight, Gauge, Landmark, Rocket } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, FOCUS_RING, MOTION, PageHero, Section, StatStrip } from "@/components/marketing/template";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingIntake } from "@/components/funding/funding-intake";
import { listGrants, listPrograms } from "@/lib/funding/data";
import { capitalSlug, formatAudCompact, grantStats, latestVerifiedAt } from "@/lib/funding/directory";
import { fundingCopy, type FundingCopyGroup } from "@/lib/funding/copy";
import { CAPITALS } from "@/lib/funding/seed-map";
import { FUNDING_CRUMBS } from "@/lib/funding/seo";
import { getArticleBySlug } from "@/lib/insights";

// G11 §1b / T0249 — the funding insight articles that carry the "See which of
// these you qualify for → /funding" callout; this strip is the return link.
// Titles come from content/insights/manifest.json so the copy never drifts.
export const FUNDING_READ_MORE_SLUGS = [
  "government-grants-startups-australia-2026",
  "non-dilutive-funding-strategies-australia",
  "esic-and-rnd-tax-incentive-guide-2026",
  "r-and-d-tax-incentive-startups-australia",
  "esic-compliance-guide-early-stage-startups",
  "revenue-based-financing-australia",
  "australian-startup-funding-rounds-2026-guide",
  "venture-debt-vs-equity-funding-australia",
  "bootstrapping-vs-fundraising-australian-founders",
] as const;

export interface FundingLandingProps {
  /** `getMessages("vi")` on the Vietnamese page; omit for English. */
  messages?: Readonly<Record<string, string>> | null;
}

/** "A$3.2M" / "A$850,000" — the live hero figure. */
export function heroSum(openMaxAud: number): string {
  if (openMaxAud >= 1_000_000) {
    const m = openMaxAud / 1_000_000;
    return `A$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  return formatAudCompact(openMaxAud);
}

export async function FundingLanding({ messages = null }: FundingLandingProps) {
  const c = (group: FundingCopyGroup, key: string, tokens: Record<string, string | number> = {}) =>
    fundingCopy(group, key, tokens, messages);

  const [grants, programs] = await Promise.all([
    listGrants({ excludeNonMatching: true }).catch(() => []),
    listPrograms({}).catch(() => []),
  ]);
  const stats = grantStats(grants);
  const openPrograms = programs.filter((p) => p.status === "open").length;
  const verified = latestVerifiedAt([...grants, ...programs]);
  const readMore = FUNDING_READ_MORE_SLUGS.flatMap((slug) => {
    const a = getArticleBySlug(slug);
    return a ? [{ slug: a.slug, title: a.title }] : [];
  });

  const title = stats.open > 0 && stats.openMaxAud > 0 ? c("hero", "h1", { sum: heroSum(stats.openMaxAud) }) : c("hero", "h1Fallback");
  const subtitle = [c("hero", "sub"), c("hero", "subPrice"), openPrograms ? c("hero", "programsOpen", { m: openPrograms }) : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <MarketingShell>
      <BreadcrumbListJsonLd items={[...FUNDING_CRUMBS.landing]} />
      <PageHero
        eyebrow={c("hero", "eyebrow")}
        title={title}
        sub={subtitle}
        ctas={[
          { href: "#intake", label: c("cta", "matchMeFree"), ctaId: "funding_hero_match" },
          { href: "/funding/grants", label: c("cta", "browseGrants") },
        ]}
        footnote={<span data-funding-trust-line>{c("hero", "trust")}</span>}
        align="start"
      />

      <FundingIntake openGrantCount={stats.open} openProgramCount={openPrograms} />

      <Section id="paths" title="Three ways to get money moving" tone="sunken">
        <FeatureGrid
          columns={3}
          ariaLabel="Three ways to get money moving"
          items={[
            {
              icon: Landmark,
              title: "Non-dilutive: grants and tax offsets",
              body: "R&D Tax Incentive, ESIC, state commercialisation grants, CSIRO Kick-Start. Every row links to the official page — apply there, never through a middleman.",
              href: "/funding/grants",
              cta: "See the grants",
              ctaId: "funding_path_grants",
            },
            {
              icon: Rocket,
              title: "Programs: accelerators and incubators",
              body: `Intake windows for ${CAPITALS.length} capitals, month by month, with equity terms and what you actually get.`,
              href: "/funding/programs",
              cta: "See programs by city",
              ctaId: "funding_path_programs",
            },
            {
              icon: Gauge,
              title: "Investors: get investor-ready first",
              body: "Your Startup Value Index across 8 dimensions, an AUD valuation range and the next three moves — the free score, then the full Trusted Business Report for A$3.",
              href: "/analyze",
              cta: "Get my score — free",
              ctaId: "funding_path_score",
            },
          ]}
        />

        <div className="mt-10 rounded-xl border border-line-subtle bg-surface p-6 shadow-1">
          <h3 className="font-display text-lg font-semibold text-primary">Programs by capital</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {CAPITALS.map((cap) => (
              <li key={cap}>
                <Link
                  href={`/funding/programs/${capitalSlug(cap)}`}
                  className={`inline-flex min-h-11 items-center gap-1 rounded-full border border-line-subtle bg-surface px-3 py-1 text-sm text-secondary hover:text-primary ${MOTION} ${FOCUS_RING}`}
                >
                  {cap}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        id="pricing"
        eyebrow="What is free and what is paid"
        title="The list is free. The analysis is the product."
        lede={c("hero", "subPrice")}
      >
        <StatStrip
          ariaLabel="What is free and what is paid"
          stats={[
            {
              value: "A$0",
              label: "Free",
              hint: "Every grant and program with official links and last-verified dates, plus the three-question preview: counts, top matches and why.",
            },
            {
              value: c("pricing", "reportPrice"),
              label: "Money Finder report",
              hint: "Ranked list, eligibility checklist ✓ / ✗ / ?, A$ estimates, 12-month timeline and your next three actions — one startup, one profile.",
            },
            {
              value: c("pricing", "radarPrice"),
              label: "Founder Radar",
              hint: "The report included, 20 AI credits a month, and an alert before every window you match closes. 7-day trial; also in the Startup Package and evaluator plans.",
            },
          ]}
        />

        <div className="mt-10 rounded-xl border border-line-subtle bg-surface-sunken p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            For investors, accelerators and advisers
          </p>
          <p className="mt-2 text-secondary">
            Evaluate any Australian startup for A$3, or track a portfolio from A$79 a month —
            one rubric across 8 dimensions and 13 criteria, backed by the startup&apos;s own
            evidence. The Grant &amp; Program Finder is included in every evaluator plan.
          </p>
          <Link
            href="/pricing?segment=evaluator"
            className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-action ${MOTION} ${FOCUS_RING}`}
          >
            See evaluator plans <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {readMore.length > 0 && (
          <nav aria-label="Read more about startup funding in Australia" className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Read more</p>
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {readMore.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/insights/${a.slug}`}
                    className={`inline-flex min-h-11 items-center rounded-md text-sm text-secondary underline-offset-4 hover:text-primary hover:underline ${FOCUS_RING}`}
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <FundingDisclaimer lastVerifiedAt={verified} className="mt-10" />
      </Section>

      <CtaBand
        title={c("cta", "matchMeFree")}
        sub={c("hero", "trust")}
        primary={{ href: "#intake", label: c("cta", "matchMeFree"), ctaId: "funding_final_match" }}
        secondary={{ href: "/funding/grants", label: c("cta", "browseGrants") }}
      />
    </MarketingShell>
  );
}
