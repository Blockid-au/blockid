import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { HeroSection } from "@/components/marketing/hero-section";
import { LogoBand } from "@/components/marketing/logo-band";
import { FinalCTA } from "@/components/marketing/final-cta";
import { UnlockPreview } from "@/components/marketing/unlock-preview";
import { TierLadder } from "@/components/marketing/homepage/tier-ladder";
import {
  DimensionRadar,
  DimensionTable,
} from "@/components/marketing/homepage/dimension-radar";
import { ValuationRanges } from "@/components/marketing/homepage/valuation-ranges";
import { JourneyPath } from "@/components/marketing/homepage/journey-path";
import { DataRoomBuild } from "@/components/marketing/homepage/data-room-build";
import {
  RunComparison,
  RunComparisonLegend,
} from "@/components/marketing/homepage/run-comparison";
import { runById } from "@/components/marketing/homepage/sample-runs";
import { heroLine } from "@/lib/marketing/hero-variants";
import {
  readSignedInHint,
  SIGNED_IN_LANDING_HREF,
} from "@/lib/supabase/session-hint";

// Homepage v5 (2026-09-08) — the page now looks like the thing the product
// makes.
//
// WHY THE REBUILD
//
// v4 described the product in prose: text cards, text headings, bulleted
// lists. But this product produces numbers and shapes — a score across
// eight dimensions, a range settled between five valuation methods, a
// position on a twelve-phase journey, a data room that fills up. A page
// that looks nothing like its own output does not read as credible, and it
// asks a visitor to take on trust exactly the thing we could simply show
// them. v5 shows the output and lets the copy support it.
//
// PATTERN: ui-ux-pro-max "Product Demo + Features" — hero, then the
// product's own artefact centre stage, then one artefact per section — with
// the house "Bento Box Grid" style for tile weight inside each band. The
// usual demo asset for that pattern is a video or a mockup; here the demo
// asset is the real output, drawn as inline SVG and CSS from the published
// runs, which is stronger than a screenshot and cannot go stale.
//
// CHART FORMS (dataviz): interval chart for a range, radar with emphasis
// for the eight dimensions, an ordered path with three marks for the
// journey, meters for the data room, small multiples for stage comparison.
// One data hue throughout (`action`), context in neutral grey — the
// emphasis form — so there is no categorical palette anywhere on the page
// and nothing to fail a CVD check.
//
// PROVENANCE: every number routes through
// `components/marketing/homepage/sample-runs.ts`, which is either the three
// published anonymised runs or a shipped product module. Its colocated
// suite pins the figures.
//
// THE THREE QUESTIONS are the page's spine — each owns a section: #worth,
// #state, #next.
//
// ── FUNNEL PASS (2026-09-09) ────────────────────────────────────────────
//
// v5 showed the output, which was the right call and stays. What it did not
// do was make the three rungs legible or the next action obvious at any
// scroll depth: the only prices on the whole page were the words "A$3" in a
// hero bullet and a subordinate /pricing link at the bottom, so a visitor
// could read six thousand pixels without learning what free gets them.
//
// PATTERN (ui-ux-pro-max): the v5 "Product Demo + Features" spine with the
// "Pricing-Focused Landing" pattern grafted on — hero value proposition,
// then the product's own output, then a three-tier ladder, then the close.
// Style stays "Data-Dense Dashboard", which is what the page already is.
// CTA placement follows that pattern: in the hero, on each tier card, and at
// the bottom.
//
// WHAT CHANGED, AND WHY
//
//   * Hero: the question-anchor row and the trust-point row — two rows, no
//     price between them — became ONE row carrying the three rungs with
//     their prices. Concise but complete: what it is, what you get, what it
//     costs, above the fold.
//   * NEW #tiers section, the funnel's spine, after the proof and before the
//     close. It is where the hero strip points.
//   * REMOVED EquityBand and AudienceSplit (≈1,060px of prose between the
//     proof and the close). Equity is not dropped — it is the third rung's
//     own content, stated as a thing you get for A$29 rather than as a
//     section arguing for itself. The investor path keeps its entry in the
//     final CTA.
//   * Every band tightened by one step of vertical padding.
//
// LIGHT/DARK RHYTHM — light-dominant, ONE dark punctuation band plus the
// dark footer edge:
//
//   1. Hero            LIGHT  (bg.base)    H1 + omnibox + ladder + a real run.
//   2. #worth          LIGHT  (bg.sunken)  valuation intervals.
//   3. #state          LIGHT  (bg.base)    the eight-dimension radar.
//   4. journey         DARK   punctuation  twelve phases, three marks.
//   5. #next           LIGHT  (bg.sunken)  the data room filling up.
//   6. Three runs      LIGHT  (bg.base)    small multiples.
//   7. #tiers          LIGHT  (bg.sunken)  the three rungs.
//   7b. #unlock        LIGHT  (bg.base)    eight locked workspace cards (T0238).
//   8. LogoBand        LIGHT  (bg.sunken)  where it is built and how it runs.
//   9. FinalCTA        LIGHT  (bg.base)    one primary button.
//  10. Entity strip    DARK   footer edge  PPL Food PTY LTD.
// Title + description are the hero's own lines (T0250): the title is the
// first breath of F1, the description the whole of F1, so what a search
// result promises is exactly what the H1 says.
export const metadata = {
  title: "See your startup the way an investor will · BlockID.au",
  description: heroLine("F1").en,
  alternates: {
    canonical: "https://blockid.au",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Reads the current build's version string from
 * `web/content/reports/version.json` — cached at module scope.
 */
let cachedVersion: string | null | undefined;
function readVersionString(): string | null {
  if (cachedVersion !== undefined) return cachedVersion;
  try {
    const p = path.join(process.cwd(), "content", "reports", "version.json");
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    cachedVersion =
      typeof parsed.version === "string" && parsed.version.length > 0
        ? parsed.version
        : null;
  } catch {
    cachedVersion = null;
  }
  return cachedVersion;
}

export default async function HomePage() {
  const version = readVersionString();
  const isSignedIn = await readSignedInHint();

  // Redirect signed-in users via NavV2 hint (used for dashboard link)
  void isSignedIn;
  void SIGNED_IN_LANDING_HREF;

  const entityLine = ["PPL Food PTY LTD", version]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" · ");

  // The radar is drawn for the revenue-stage run: it is the only one of the
  // three whose readings all sit inside the cohort band, so the shape reads
  // as a shape rather than as a spike.
  const radarRun = runById("revenue");

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-action focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-action"
      >
        Skip to content
      </a>

      <NavV2 />

      <main id="main-content">
        {/* 1. Hero — the omnibox. Whatever is typed here carries straight
            through to a running analysis; it is never asked for twice. */}
        <HeroSection />

        {/* 2. WHAT IS IT WORTH — three real ranges on one shared axis. */}
        <section
          id="worth"
          aria-labelledby="worth-heading"
          className="scroll-mt-20 border-t border-line-subtle bg-surface-sunken py-12 sm:py-14"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-12">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                  What is it worth
                </p>
                <h2
                  id="worth-heading"
                  className="mt-3 font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
                >
                  One range, not one number.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-secondary sm:text-base">
                  A single figure is a guess with the error bars filed off.
                  Every run returns a span — the low you can defend and the
                  high you can argue for — and shows the working behind both,
                  so you can hold the number in a conversation instead of
                  quoting it.
                </p>
                <Link
                  href="/one-click-report"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken"
                >
                  Get the written report, A$3
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>

              <div className="rounded-2xl border border-line-subtle bg-surface p-6 shadow-xs sm:p-8">
                <ValuationRanges />
              </div>
            </div>
          </div>
        </section>

        {/* 3. WHAT STATE AM I IN — the eight-dimension shape. */}
        <section
          id="state"
          aria-labelledby="state-heading"
          className="scroll-mt-20 border-t border-line-subtle bg-surface py-12 sm:py-14"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                What state am I in
              </p>
              <h2
                id="state-heading"
                className="mt-3 font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
              >
                Eight dimensions, against Australian companies at your stage.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-secondary sm:text-base">
                The score is not one opinion. It is eight readings, each with
                the evidence behind it and each placed against what companies
                at the same stage in this market actually score — so a weak
                dimension is a specific thing to go and fix, not a mood.
              </p>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-12">
              <div className="rounded-2xl border border-line-subtle bg-surface p-4 shadow-xs sm:p-6">
                <DimensionRadar run={radarRun} />
              </div>
              <div>
                <p className="flex items-baseline gap-2">
                  <span className="font-sans text-5xl font-semibold leading-none text-primary">
                    {radarRun.sviScore}
                  </span>
                  <span className="text-sm font-medium uppercase tracking-wider text-muted">
                    out of 100
                  </span>
                </p>
                <p className="mt-4 text-sm leading-relaxed text-secondary">
                  The eight readings behind that score, for the revenue-stage
                  run below: four published, four held back with the
                  company&rsquo;s identity.
                </p>
                <div className="mt-4">
                  <DimensionTable run={radarRun} />
                </div>
                <Link
                  href="/guide/scn"
                  className="mt-5 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-action transition-colors duration-200 hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  How each dimension is scored
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 4. The page's ONE dark punctuation band: the twelve-phase journey
            with three real positions marked on it. */}
        <section
          aria-labelledby="journey-heading"
          data-theme="dark"
          className="border-y border-line-subtle bg-surface py-12 sm:py-14"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                And where on the path
              </p>
              <h2
                id="journey-heading"
                className="mt-3 font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
              >
                Twelve phases. A run tells you which one you are in.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-secondary sm:text-base">
                Building a company is the same twelve pieces of work in
                roughly the same order. Knowing which one you are actually in
                is what stops a quarter going into the wrong thing.
              </p>
            </div>

            <JourneyPath />

            <Link
              href="/showcase/atlassian/growth-phases"
              className="mt-8 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-action transition-colors duration-200 hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Walk the twelve phases with a company that finished them
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </section>

        {/* 5. WHAT DO I DO NEXT — the data room, filling up. */}
        <section
          id="next"
          aria-labelledby="next-heading"
          className="scroll-mt-20 border-t border-line-subtle bg-surface-sunken py-12 sm:py-14"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                What do I do next
              </p>
              <h2
                id="next-heading"
                className="mt-3 font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
              >
                The room an investor asks to see.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-secondary sm:text-base">
                Diligence is a list, and the list is knowable. A run turns the
                same eight readings into the documents that are missing, in
                the order they will be asked for — with a template behind each
                one so you are not starting from a blank page.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-line-subtle bg-surface p-5 shadow-xs sm:p-7">
              <DataRoomBuild />
            </div>
          </div>
        </section>

        {/* 6. Three anonymised runs, so a visitor can locate themselves. */}
        <section
          aria-labelledby="runs-heading"
          className="border-t border-line-subtle bg-surface py-12 sm:py-14"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="runs-heading"
                className="font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
              >
                Three real runs, anonymised.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary sm:text-base">
                Same box, same eight dimensions, three companies at very
                different points. Nothing here is invented — these are the
                numbers the analysis returned, with the identifying details
                removed.
              </p>
            </div>

            <div className="mt-8">
              <RunComparison />
            </div>
            <div className="mt-8">
              <RunComparisonLegend />
            </div>
          </div>
        </section>

        {/* 7. THE THREE RUNGS. The funnel's spine, and where the hero strip
            points. It sits AFTER the proof deliberately: a price is a
            question about value, and the four sections above it are the
            answer. Form is a KPI row of stat tiles, not a chart — see the
            note in tier-ladder.tsx. */}
        <section
          id="tiers"
          aria-labelledby="tiers-heading"
          className="scroll-mt-20 border-t border-line-subtle bg-surface-sunken py-12 sm:py-14"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                What it costs
              </p>
              <h2
                id="tiers-heading"
                className="mt-3 font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
              >
                Three steps, and the first one is free.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary sm:text-base">
                Each step asks for one more thing than the last, and gives you
                something the last one could not. You never pay to find out
                whether it works.
              </p>
            </div>

            <div className="mt-8">
              <TierLadder />
            </div>

            <p className="mt-6 text-xs leading-relaxed text-muted">
              Prices in Australian dollars, inclusive of GST. The Startup Value
              Index is a directional analysis, not a financial valuation or an
              investment recommendation.
            </p>
          </div>
        </section>

        {/* 7b. What you unlock after login (G11 §3c, T0238). Sits directly
            under the ladder because it answers the question the A$29 rung
            raises. Base surface so it separates from the sunken #tiers. */}
        <UnlockPreview tone="base" />

        {/* 8. Where it is built and how it is run. Sunken here so it keeps
            its boundary against the base-surface unlock strip above. */}
        <LogoBand className="bg-surface-sunken" />

        {/* 9. Final CTA — one primary button, pricing as a text link. */}
        <FinalCTA />

        {/* 11. Entity strip — the page's second and last dark region, at
            the footer edge where a colour change reads as a boundary.
            Token-bound inside data-theme="dark" (globals.css rev.4), so
            text-muted resolves to #CBD5E1 on #0B0F1A (11.6:1) instead of
            the old inline #94A3B8. ENTITY STRING IS DELIBERATE: marketing
            surfaces show PPL Food PTY LTD; billing/legal/JSON-LD use
            Auschain PTY LTD. Do not change either. */}
        <section
          id="trust"
          aria-labelledby="trust-heading"
          data-theme="dark"
          className="border-t border-line-subtle bg-surface py-10"
        >
          <h2 id="trust-heading" className="sr-only">
            About BlockID.au
          </h2>
          <div className="mx-auto max-w-4xl px-6 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
              Australian owned {"·"} Built in Sydney
            </p>
            <p className="mt-3 text-sm text-muted">{entityLine}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
