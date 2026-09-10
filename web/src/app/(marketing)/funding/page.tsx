/**
 * /funding — "Do you need money?" landing (G11 S3, T0242).
 *
 * Journey (plan §4a): hero with live counts → 3-question intake (client,
 * `FundingIntake`) → free preview → transparent paywall (A$3 guest · 3
 * credits · included in Starter / Startup Package / evaluator plans) →
 * `/funding/report/[id]`. The free directories stay one click away.
 *
 * Positioning (plan §5a): grant lists and official links are free; we sell
 * the eligibility analysis, ranking, estimates and timeline — never the
 * information. Disclaimer (§5f) via `FundingDisclaimer`.
 *
 * ISR (1h): the page reads no cookies — the intake resolves who is signed in
 * after hydration, so the counts cache and the paywall still shows the right
 * rail.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingIntake } from "@/components/funding/funding-intake";
import { listGrants, listPrograms } from "@/lib/funding/data";
import {
  capitalSlug,
  formatAudCompact,
  grantStats,
  latestVerifiedAt,
} from "@/lib/funding/directory";
import { CAPITALS } from "@/lib/funding/seed-map";
import { getArticleBySlug } from "@/lib/insights";

// G11 §1b / T0249 — the funding insight articles that carry the "See which of
// these you qualify for → /funding" callout; this strip is the return link.
// Titles come from content/insights/manifest.json so the copy never drifts.
const FUNDING_READ_MORE_SLUGS = [
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

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Do you need money for your startup? Grants, programs and investors in Australia",
  description:
    "Every open Australian startup grant and every accelerator, incubator and founder program in the eight capitals — free to browse, with official links. Answer three questions for a free match, then a ranked report with a 12-month plan for A$3.",
  alternates: { canonical: "https://blockid.au/funding" },
};

export default async function FundingLandingPage() {
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

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Do you need money?"
        title={
          stats.open > 0
            ? `${stats.open} Australian grants worth up to ${formatAudCompact(stats.openMaxAud)} are open right now.`
            : "Australian startup grants, programs and investors — in one place."
        }
        subtitle={`Government grants, accelerators, angels and tax offsets — matched to your idea, your state and your stage. The lists are free. The eligibility check, ranking and 12-month plan are A$3, or included with Founder Radar.${openPrograms ? ` ${openPrograms} programs are taking applications today.` : ""}`}
        primaryCta={{ href: "#intake", label: "Match me — three questions, free" }}
        secondaryCta={{ href: "/funding/grants", label: "Browse open grants — free" }}
      />

      <FundingIntake openGrantCount={stats.open} openProgramCount={openPrograms} />

      <section className="mx-auto max-w-5xl px-6 pb-16" aria-labelledby="funding-paths">
        <h2 id="funding-paths" className="text-2xl font-semibold text-primary">
          Three ways to get money moving
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <PathCard
            title="Non-dilutive: grants and tax offsets"
            body="R&D Tax Incentive, ESIC, state commercialisation grants, CSIRO Kick-Start. Every row links to the official page — apply there, never through a middleman."
            href="/funding/grants"
            cta="See the grants"
          />
          <PathCard
            title="Programs: accelerators and incubators"
            body={`Intake windows for ${CAPITALS.length} capitals, month by month, with equity terms and what you actually get.`}
            href="/funding/programs"
            cta="See programs by city"
          />
          <PathCard
            title="Investors: get investor-ready first"
            body="Your Startup Value Index across 8 dimensions, an AUD valuation range and the next three moves — the free score, then the full Trust BizReport for A$3."
            href="/analyze"
            cta="Get my score — free"
          />
        </div>

        <div className="mt-10 rounded-2xl border border-line-subtle bg-surface-sunken p-6">
          <h3 className="text-lg font-semibold text-primary">Programs by capital</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {CAPITALS.map((c) => (
              <li key={c}>
                <Link
                  href={`/funding/programs/${capitalSlug(c)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface px-3 py-1 text-sm text-secondary hover:text-primary"
                >
                  {c}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3" aria-label="What is free and what is paid">
          <PriceCard
            tier="Free"
            price="A$0"
            body="Every grant and program with official links and last-verified dates, plus the three-question preview: counts, top matches and why."
          />
          <PriceCard
            tier="Money Finder report"
            price="A$3 · or 3 credits"
            body="Ranked list, eligibility checklist ✓ / ✗ / ?, A$ estimates, 12-month timeline and your next three actions — one startup, one profile."
          />
          <PriceCard
            tier="Founder Radar"
            price="A$29/mo · Starter"
            body="The report included, 20 AI credits a month, and an alert before every window you match closes. 7-day trial; also in the Startup Package and evaluator plans."
          />
        </div>

        <div className="mt-10 rounded-2xl border border-line-subtle p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-tertiary">
            For investors, accelerators and advisers
          </p>
          <p className="mt-2 text-secondary">
            Evaluate any Australian startup for A$3, or track a portfolio from A$79 a month —
            one rubric across 8 dimensions and 13 criteria, backed by the startup&apos;s own
            evidence. The Grant &amp; Program Finder is included in every evaluator plan.
          </p>
          <Link
            href="/pricing?segment=evaluator"
            className="mt-4 inline-flex items-center gap-2 font-semibold text-action"
          >
            See evaluator plans <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {readMore.length > 0 && (
          <nav aria-label="Read more about startup funding in Australia" className="mt-10">
            <p className="text-sm font-semibold uppercase tracking-wide text-tertiary">Read more</p>
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {readMore.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/insights/${a.slug}`}
                    className="text-sm text-secondary underline-offset-4 hover:text-primary hover:underline"
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <FundingDisclaimer lastVerifiedAt={verified} className="mt-10" />
      </section>
    </MarketingShell>
  );
}

function PathCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-line-subtle bg-surface p-6">
      <h3 className="text-lg font-semibold text-primary">{title}</h3>
      <p className="mt-2 flex-1 text-sm text-secondary">{body}</p>
      <Link href={href} className="mt-4 inline-flex items-center gap-2 font-semibold text-action">
        {cta} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

function PriceCard({ tier, price, body }: { tier: string; price: string; body: string }) {
  return (
    <article className="rounded-2xl border border-line-subtle bg-surface p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">{tier}</p>
      <p className="mt-1 text-xl font-semibold text-primary">{price}</p>
      <p className="mt-2 text-sm text-secondary">{body}</p>
    </article>
  );
}
