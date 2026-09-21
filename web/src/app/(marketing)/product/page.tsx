/**
 * /product — the "intro" page (G17 D4, 2026-09-19).
 *
 * The homepage v5 (2026-09-08) showed the product's own output in six
 * stacked sections — valuation intervals, the eight-dimension radar, the
 * twelve-phase journey, the data room filling up, the tier ladder, the
 * unlock preview. G17 cut the home to six short blocks and moved that depth
 * HERE, unchanged: the same components, the same section ids (`#worth`,
 * `#state`, `#journey`, `#next`, `#unlock`) so every old `/#worth` deep link
 * lands on `/product#worth` through the "Go deeper" row on the home.
 *
 * Layout is the template (D5): PageHero → Section × 5 → CtaBand, inside
 * MarketingShell (NavV2 + the one Footer). Static + ISR like the home.
 */

import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  CtaBand,
  TrustBand,
  CtaLink,
  PageHero,
  Section,
} from "@/components/marketing/template";
import { UnlockPreview } from "@/components/marketing/unlock-preview";
import {
  DimensionRadar,
  DimensionTable,
} from "@/components/marketing/homepage/dimension-radar";
import { ValuationRanges } from "@/components/marketing/homepage/valuation-ranges";
import { JourneyPath } from "@/components/marketing/homepage/journey-path";
import { DataRoomBuild } from "@/components/marketing/homepage/data-room-build";
import { runById } from "@/components/marketing/homepage/sample-runs";
import { pageMetadata } from "@/lib/seo/page-meta";

export const metadata = pageMetadata({
  title: "Product — the Startup Value Index, explained",
  description:
    "What a Startup Value Index run returns: a valuation range with the working shown, eight dimensions scored against Australian peers, and the data room you need.",
  path: "/product",
});

export const revalidate = 300;

export default function ProductPage() {
  // The radar is drawn for the revenue-stage run: it is the only one of the
  // three whose readings all sit inside the cohort band, so the shape reads
  // as a shape rather than as a spike.
  const radarRun = runById("revenue");

  return (
    <MarketingShell>
      <PageHero
        eyebrow="Product"
        title="One run. Four answers."
        sub="Paste a name, a deck or a URL. Sixty seconds later you have a valuation range with the working shown, an eight-dimension score against Australian companies at the same stage, a position on the twelve-phase journey and the list of what a data room is still missing."
        ctas={[
          { href: "/analyze", label: "Score a startup", ctaId: "product_hero_score" },
          { href: "/samples", label: "See sample results" },
        ]}
        align="start"
      />

      {/* 1. WHAT IS IT WORTH — three real ranges on one shared axis. */}
      <Section
        id="worth"
        eyebrow="What is it worth"
        title="One range, not one number."
        lede="A single figure is a guess with the error bars filed off. Every run returns a span — the low you can defend and the high you can argue for — and shows the working behind both, so you can hold the number in a conversation instead of quoting it."
        tone="sunken"
        actions={[{ href: "/one-click-report", label: "Get the written report", variant: "link" }]}
      >
        <div className="rounded-xl border border-line-subtle bg-surface p-6 shadow-1 sm:p-8">
          <ValuationRanges />
        </div>
      </Section>

      {/* 2. WHAT STATE AM I IN — the eight-dimension shape. */}
      <Section
        id="state"
        eyebrow="What state am I in"
        title="Eight dimensions, against Australian companies at your stage."
        lede="The score is not one opinion. It is eight readings, each with the evidence behind it and each placed against what companies at the same stage in this market actually score — so a weak dimension is a specific thing to go and fix, not a mood."
      >
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-12">
          <div className="rounded-xl border border-line-subtle bg-surface p-4 shadow-1 sm:p-6">
            <DimensionRadar run={radarRun} />
          </div>
          <div>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-bold leading-none text-primary tabular-nums">
                {radarRun.sviScore}
              </span>
              <span className="text-sm font-medium uppercase tracking-wider text-muted">
                out of 100
              </span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-secondary">
              The eight readings behind that score, for the revenue-stage run:
              four published, four held back with the company&rsquo;s identity.
            </p>
            <div className="mt-4">
              <DimensionTable run={radarRun} />
            </div>
            <CtaLink
              href="/guide/scn"
              label="How each dimension is scored"
              variant="link"
              className="mt-5"
            />
          </div>
        </div>
      </Section>

      {/* 3. The twelve-phase journey — a white band between two sunken ones (G26: light only). */}
      <Section
        id="journey"
        eyebrow="And where on the path"
        title="Twelve phases. A run tells you which one you are in."
        lede="Building a company is the same twelve pieces of work in roughly the same order. Knowing which one you are actually in is what stops a quarter going into the wrong thing."
        tone="base"
        divider
        actions={[
          {
            href: "/showcase/atlassian/growth-phases",
            label: "Walk the twelve phases with a company that finished them",
            variant: "link",
          },
        ]}
      >
        <JourneyPath />
      </Section>

      {/* 4. WHAT DO I DO NEXT — the data room, filling up. */}
      <Section
        id="next"
        eyebrow="What do I do next"
        title="The room an investor asks to see."
        lede="Diligence is a list, and the list is knowable. A run turns the same eight readings into the documents that are missing, in the order they will be asked for — with a template behind each one so you are not starting from a blank page."
        tone="sunken"
      >
        <div className="rounded-xl border border-line-subtle bg-surface p-5 shadow-1 sm:p-7">
          <DataRoomBuild />
        </div>
      </Section>

      {/* 5. What you unlock after login (G11 §3c, T0238) — its own section
          markup, kept as-is; `#unlock` was a homepage anchor. */}
      <UnlockPreview tone="base" />

      {/* G21 P0-A — who stands behind the score, above the close. */}
      <TrustBand />

      <CtaBand
        title="Score your first startup."
        sub="The free score takes sixty seconds and needs no card. Evaluators can run a whole intake; founders get their own feedback."
        primary={{ href: "/analyze", label: "Score a startup", ctaId: "product_cta_score" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </MarketingShell>
  );
}
