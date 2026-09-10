/**
 * /funding — "Do you need money?" landing (interim, G11 S2).
 *
 * The nav CTA and the footer Funding column point here. This version is the
 * free front door only: live counts from `au_grants` / `au_programs`, links to
 * the free directories, and the paths to the two things we do sell — the
 * A$3 Trust BizReport (founder) and the Evaluator ladder. The 3-question
 * intake, free preview and the paid A$3 Money Finder report replace the
 * middle of this page in T0242 (S3).
 *
 * Positioning (plan §5a): grant lists and official links are free; we sell
 * the eligibility analysis, ranking and timeline — never the information.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { listGrants, listPrograms } from "@/lib/funding/data";
import {
  capitalSlug,
  formatAudCompact,
  grantStats,
  latestVerifiedAt,
} from "@/lib/funding/directory";
import { CAPITALS } from "@/lib/funding/seed-map";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Do you need money for your startup? Grants, programs and investors in Australia",
  description:
    "Every open Australian startup grant and every accelerator, incubator and founder program in the eight capitals — free to browse, with official links. Then a 12-month plan for A$3.",
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

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Do you need money?"
        title={
          stats.open > 0
            ? `${stats.open} Australian grants worth up to ${formatAudCompact(stats.openMaxAud)} are open right now.`
            : "Australian startup grants, programs and investors — in one place."
        }
        subtitle={`Government grants, accelerators, angels and tax offsets — matched to your idea, your state and your stage. The lists are free. The eligibility check, ranking and 12-month plan are A$3.${openPrograms ? ` ${openPrograms} programs are taking applications today.` : ""}`}
        primaryCta={{ href: "/funding/grants", label: "Browse open grants — free" }}
        secondaryCta={{ href: "/funding/programs", label: "Programs in your city" }}
      />

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

        <div className="mt-10 rounded-2xl border border-line-subtle p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-tertiary">
            For investors, accelerators and advisers
          </p>
          <p className="mt-2 text-secondary">
            Evaluate any Australian startup for A$3, or track a portfolio from A$79 a month —
            one rubric across 8 dimensions and 13 criteria, backed by the startup&apos;s own
            evidence.
          </p>
          <Link
            href="/pricing?segment=evaluator"
            className="mt-4 inline-flex items-center gap-2 font-semibold text-action"
          >
            See evaluator plans <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <FundingDisclaimer lastVerifiedAt={verified} />
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
