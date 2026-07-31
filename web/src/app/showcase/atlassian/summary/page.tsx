// /showcase/atlassian/summary — Step 9 (final) of the Atlassian walkthrough.
//
// The wrap-up screen. Recap grid pointing back at each of the 8 earlier
// steps, a KPI strip pulled from the fixture, and three CTAs pointing the
// visitor into their own BlockID journey (register / demo / other case
// studies). The AtlassianWalkthroughProvider renders the shell with the
// Next → button naturally disabled because getNextStep(9) === null.
//
// Server component only. No Supabase, no cookies, no I/O. Anonymous 200.

import type { Metadata } from "next";
import Link from "next/link";

import {
  BenchmarkNotice,
  FolkloreChecksSection,
  HumanReviewFlagsSection,
} from "@/components/showcase/atlassian-benchmark";
import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import { ATLASSIAN_DEMO } from "@/lib/showcase/atlassian/fixture";
import {
  ATLASSIAN_WALKTHROUGH,
  buildStepUrl,
} from "@/lib/showcase/atlassian/steps";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wrap-up — Atlassian demo — Step 9 — BlockID",
  description:
    "You've walked through Atlassian's 24-year journey. Here's the recap, the KPIs, and what to do next in your own BlockID workspace.",
};

// One-line takeaway per step. Kept in-file so the summary page reads as a
// standalone recap; each string is the takeaway a visitor should carry away
// after seeing the corresponding step.
const STEP_TAKEAWAY: Record<number, string> = {
  1: "Self-funded Sydney to NASDAQ, two secondaries, founders kept voting control.",
  2: "A live dashboard is what BlockID would show for your own startup.",
  3: "The 13 criteria are graded from evidence with citations, not vibes.",
  4: "12 phases mapped to S0\u2013S5, with what the filings do and don\u0027t show.",
  5: "Seven C-Level agents brief you where their advice matters most.",
  6: "The data room is 65+ documents grouped into 12 categories, AU-first.",
  7: "Four valuation methods across four points in time — see which fits when.",
  8: "The 12-chapter mentor guide, replayed against Atlassian's real path.",
  9: "You've seen the demo. Now start your own workspace.",
};

function formatAUD(n: number): string {
  if (n >= 1_000_000_000) {
    return `A$${(n / 1_000_000_000).toFixed(1)}B`;
  }
  if (n >= 1_000_000) {
    return `A$${(n / 1_000_000).toFixed(0)}M`;
  }
  return `A$${n.toLocaleString()}`;
}

export default function AtlassianSummaryMirrorPage() {
  const sviMean = Math.round(
    ATLASSIAN_DEMO.sviScores.reduce((sum, s) => sum + s.score0to100, 0) /
      ATLASSIAN_DEMO.sviScores.length,
  );

  const ipoValuation = ATLASSIAN_DEMO.valuations.find(
    (v) => v.timestamp === "2015-IPO" && v.method === "Comparables",
  );
  const currentValuation = ATLASSIAN_DEMO.valuations.find(
    (v) => v.timestamp === "2026-current" && v.method === "Comparables",
  );

  const totalMilestones = ATLASSIAN_DEMO.milestones.length;
  const phasesMapped = new Set(
    ATLASSIAN_DEMO.milestones.map((m) => m.phaseSlug),
  ).size;
  const firstYear = Math.min(...ATLASSIAN_DEMO.milestones.map((m) => m.year));
  const lastYear = Math.max(...ATLASSIAN_DEMO.milestones.map((m) => m.year));

  return (
    <AtlassianWalkthroughProvider stepNumber={9}>
      <div className="min-h-screen bg-surface-50">
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <header className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              Wrap-up · Step 9 of 9
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-ink-900">
              You&apos;ve walked through Atlassian&apos;s documented arc — here&apos;s
              your recap
            </h1>
            <p className="mt-2 max-w-3xl text-base text-ink-700">
              Nine steps, one demo. Every screen you just saw uses the same
              components that render your own startup&apos;s workspace in BlockID —
              only the data changes. Below: the recap of what you covered, the
              headline KPIs of the journey, and three suggested next steps.
            </p>
          </header>

          <div className="mb-8">
            <BenchmarkNotice />
          </div>

          <section aria-labelledby="kpi-heading" className="mb-8">
            <h2 id="kpi-heading" className="sr-only">
              Journey KPIs
            </h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label="Years covered"
                value={`${firstYear}–${lastYear}`}
                hint="24-year timeline"
              />
              <KpiCard
                label="Milestones"
                value={String(totalMilestones)}
                hint="every one cited"
              />
              <KpiCard
                label="Phases mapped"
                value={`${phasesMapped}/12`}
                hint="12-phase coverage"
              />
              <KpiCard
                label="SVI composite"
                value={`${sviMean}/100`}
                hint="mean of 13 criteria"
              />
              <KpiCard
                label="IPO 2015"
                value={
                  ipoValuation ? formatAUD(ipoValuation.valueAUD) : "A$8.0B"
                }
                hint="first-day close"
              />
              <KpiCard
                label="Today"
                value={
                  currentValuation
                    ? formatAUD(currentValuation.valueAUD)
                    : "A$33.0B"
                }
                hint="Jul 2026 market cap"
              />
            </div>
          </section>

          <section aria-labelledby="recap-heading" className="mb-10">
            <h2
              id="recap-heading"
              className="mb-4 text-xl font-semibold text-ink-900"
            >
              The 9 steps you covered
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ATLASSIAN_WALKTHROUGH.map((step) => {
                const isCurrent = step.n === 9;
                return (
                  <Link
                    key={step.n}
                    href={isCurrent ? "#" : buildStepUrl(step)}
                    aria-current={isCurrent ? "step" : undefined}
                    className={
                      "block rounded-lg border p-4 transition " +
                      (isCurrent
                        ? "border-brand-500 bg-brand-50"
                        : "border-surface-200 bg-white hover:border-brand-300 hover:bg-brand-50/40")
                    }
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-mono text-white">
                        Step {step.n}
                      </span>
                      <span className="text-sm font-semibold text-ink-900">
                        {step.title}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-ink-700">
                      {STEP_TAKEAWAY[step.n]}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="cta-heading" className="mb-10">
            <h2
              id="cta-heading"
              className="mb-4 text-xl font-semibold text-ink-900"
            >
              Your next steps in BlockID
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <NextCta
                href="/register"
                title="Sign up as a founder"
                body="Create your own startup profile. Answer the 13-criterion SVI. Get your first agent briefings on your credit balance — no card needed to start."
                cta="Register →"
                emphasis
              />
              <NextCta
                href="/demo"
                title="Book a live demo"
                body="Prefer to see it with a human? Book 30 minutes with a BlockID mentor and walk your own numbers through the same 9-step arc."
                cta="Book a demo →"
              />
              <NextCta
                href="/showcase"
                title="Explore other case studies"
                body="Xero, Canva, SafetyCulture — same 12-phase spine, three very different Australian journeys. See which one your own path most rhymes with."
                cta="Browse showcase →"
              />
            </div>
          </section>

          <div className="mb-10">
            <FolkloreChecksSection />
          </div>

          <div className="mb-10">
            <HumanReviewFlagsSection />
          </div>

          <footer className="rounded-lg border border-brand-200 bg-brand-50 p-5 text-sm text-brand-900">
            <p className="font-semibold">A closing note from a founder-mentor</p>
            <p className="mt-2 text-brand-900">
              The most useful thing about this case study is where it goes
              quiet. For thirteen years Atlassian published almost nothing a
              third party could check; the record only starts at the 2015
              registration statement. Every &ldquo;not publicly disclosed&rdquo;
              above is that gap showing through — and it is a fair warning
              about how much of any founder story is reconstructed after the
              fact.
            </p>
            <p className="mt-2 text-brand-900">
              This demo is BlockID&apos;s version of that same instinct. We showed
              you every screen the platform can render, populated with real
              citations, so you can judge the guidance quality without needing
              to sign up first. If it earns your trust, the next step is to
              open your own workspace — and let the same agents write against
              your startup instead of Atlassian&apos;s.
            </p>
          </footer>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{value}</p>
      <p className="mt-0.5 text-[10px] text-ink-500">{hint}</p>
    </div>
  );
}

function NextCta({
  href,
  title,
  body,
  cta,
  emphasis,
}: {
  href: string;
  title: string;
  body: string;
  cta: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "block rounded-lg border p-4 transition " +
        (emphasis
          ? "border-brand-500 bg-brand-600 text-white hover:bg-brand-700"
          : "border-surface-200 bg-white text-ink-900 hover:border-brand-300 hover:bg-brand-50/40")
      }
    >
      <p className="text-sm font-semibold">{title}</p>
      <p
        className={
          "mt-1 text-xs " + (emphasis ? "text-brand-50" : "text-ink-700")
        }
      >
        {body}
      </p>
      <p
        className={
          "mt-2 text-xs font-semibold " +
          (emphasis ? "text-white" : "text-brand-700")
        }
      >
        {cta}
      </p>
    </Link>
  );
}
