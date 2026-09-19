import { Briefcase, ClipboardPaste, FileText, Gauge, Handshake, Rocket } from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { Footer } from "@/components/marketing/footer";
import { HeroSection } from "@/components/marketing/hero-section";
import { SampleResultCard } from "@/components/marketing/homepage/sample-result-card";
import {
  CtaBand,
  CtaLink,
  FeatureGrid,
  ProofBand,
  Section,
  StatStrip,
} from "@/components/marketing/template";
import { heroLine } from "@/lib/marketing/hero-variants";
import { formatCount, formatRhoPair, readHomeStats } from "@/lib/marketing/home-stats";
import { pageMetadata } from "@/lib/seo/page-meta";
import { HOME_AUDIENCES, HOME_GO_DEEPER, HOME_PROOF_ITEMS, HOME_STEPS } from "./home-content";

// Homepage v6 — "Unicorn" (G17, 2026-09-19, docs/plans/unicorn-homepage-2026-09-19.md).
//
// WHY THE REBUILD
//
// v5 (2026-09-08) showed the product's own output in six stacked sections
// and a tier ladder — 448 lines, two audiences competing in the hero, a
// price table on the home, and copy that assumed the reader knew "SVI".
// The founder asked for a modern single-column home: a very clear hero for
// the evaluator ladder, short and easy to grasp, no price tables, one
// template for the whole site, and the search box with the colour-changing
// ring kept as the one signature effect.
//
// PATTERN (ui-ux-pro-max, 2026-09-19): "Minimal single column" — single
// CTA focus, large type, whitespace, ≤ 3 benefits, proof BEFORE the second
// CTA — in the flat / modern-SaaS style (one elevation scale, 150–200 ms
// transitions, Lucide only, light default with a dark pairing).
//
// SIX BLOCKS (D3), each ≤ 1 screen on desktop:
//
//   1. Hero + search       HeroSection (client island: arm swap + submit)
//   2. Who it's for        three audience cards → /solutions/*
//   3. How it works        three numbered steps + the "Go deeper" row that
//                          keeps the old /#worth-style anchors landing on
//                          /product#… (fragments never reach the server)
//   4. One sample result   SampleResultCard from the published fixture
//   5. Proof               StatStrip from the content JSONs + ProofBand
//   6. Final CTA + footer  CtaBand, then the one public Footer
//
// NO prices, NO tier ladder, NO unlock preview on the home (D3) — that
// depth lives on /product and /samples, prices only on /pricing. The page
// test pins `/A\$\d/` absent. Every colour is a token; the only client JS
// is the hero. `PageViewTracker` (root layout) and the GA4 hooks in
// `hero-section.tsx` are unchanged.
export const metadata = pageMetadata({
  // Title = the E1 H1 without its full stop; description = the E2 promise,
  // trimmed to the 160-character budget the site-meta sweep enforces.
  title: heroLine("E1").en.replace(/\.$/, ""),
  description:
    "Eight dimensions, an evidence-backed valuation range and an Investor Dossier for any Australian startup. Investors and accelerators use it; founders score free.",
  path: "/",
  viPath: "/vi",
});

// S31-D: static + ISR. The page reads no request state; the proof strip
// reads the content JSONs at build / revalidate. 300 s matches the edge
// TTL in lib/security/public-cacheable-routes.ts.
export const revalidate = 300;

const AUDIENCE_ICONS = { investors: Briefcase, accelerators: Rocket, advisors: Handshake } as const;
const STEP_ICONS = { paste: ClipboardPaste, score: Gauge, dossier: FileText } as const;

export default function HomePage() {
  const stats = readHomeStats();

  return (
    <div className="min-h-screen bg-surface text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-action focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-action"
      >
        Skip to content
      </a>

      <NavV2 />

      <main id="main-content">
        {/* 1. Hero — the one H1, the E2 sub-line, two CTAs, the omnibox in
            its ring. Whatever is typed here carries straight through to a
            running analysis; it is never asked for twice. */}
        <HeroSection />

        {/* 2. WHO IT'S FOR — the evaluator ladder, one card each. */}
        <Section
          id="audiences"
          eyebrow="Who it's for"
          title="One rubric, three kinds of evaluator."
          lede="The same score, the same evidence, the same cohort tables — read from three different chairs."
          align="center"
          tone="sunken"
        >
          <FeatureGrid
            columns={3}
            ariaLabel="Who it's for"
            items={HOME_AUDIENCES.map((a) => ({
              ...a,
              icon: AUDIENCE_ICONS[a.icon as keyof typeof AUDIENCE_ICONS],
            }))}
          />
        </Section>

        {/* 3. HOW IT WORKS — three steps, then the "Go deeper" row. */}
        <Section
          id="how"
          eyebrow="How it works"
          title="Paste. Score. Open the dossier."
          align="center"
        >
          <FeatureGrid
            columns={3}
            numbered
            ariaLabel="How it works"
            items={HOME_STEPS.map((s) => ({
              ...s,
              icon: STEP_ICONS[s.icon as keyof typeof STEP_ICONS],
            }))}
          />
          <nav
            aria-label="Go deeper"
            data-testid="home-go-deeper"
            className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-line-subtle pt-8"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Go deeper</span>
            {HOME_GO_DEEPER.map((link) => (
              <CtaLink key={link.href} href={link.href} label={link.label} variant="link" arrow={false} />
            ))}
          </nav>
        </Section>

        {/* 4. ONE SAMPLE RESULT — a real anonymised run, fixed height (CLS). */}
        <Section
          id="sample"
          eyebrow="A sample result"
          title="This is what comes back."
          lede="An MVP-stage company, scored in sixty seconds. Open the full dossier or the written report a founder receives."
          align="center"
          tone="sunken"
        >
          <SampleResultCard runId="mvp" />
        </Section>

        {/* 5. PROOF — four live figures from the content JSONs, then the
            quiet row of where it is built and how it is run. */}
        <Section
          id="proof"
          eyebrow="On the record"
          title="Live numbers, open methodology."
          align="center"
        >
          <StatStrip
            stats={[
              { value: formatCount(stats.startupsScored), label: "startups scored", hint: "on the platform, QA excluded", href: "/startup-index" },
              { value: formatCount(stats.registerSignals), label: "open-register signals", hint: "ABR and public registers", href: "/methodology" },
              { value: formatRhoPair(stats.backtestRhoRound, stats.backtestRhoValuation), label: "backtest ρ (round / valuation)", hint: "Spearman, weekly", href: "/methodology/calibration" },
              { value: formatCount(stats.evaluatorOrgs), label: "evaluators on a plan", hint: "investors, accelerators, advisors", href: "/solutions/investor" },
            ]}
            caption={
              stats.asAt
                ? `As at ${stats.asAt}. Figures are read from the same published files that feed /methodology and the platform stats API.`
                : "Figures are read from the same published files that feed /methodology and the platform stats API."
            }
          />
          <ProofBand className="mt-12" eyebrow="Where it is built, and how it is run" items={HOME_PROOF_ITEMS} />
        </Section>

        {/* 6. FINAL CTA. */}
        <CtaBand
          title="Score your first startup."
          sub="Sixty seconds, no card. Evaluators can run a whole intake; founders get their own score and feedback free."
          primary={{ href: "/analyze", label: "Score a startup", ctaId: "home_final_score" }}
          secondary={{ href: "/samples", label: "See sample results" }}
          tone="dark"
        />
      </main>

      {/* The one public footer (S-IA5) — identical on every page. ENTITY
          STRING IS DELIBERATE: marketing surfaces show PPL Food PTY LTD;
          billing / legal / JSON-LD use Auschain PTY LTD. Do not change either. */}
      <Footer />
    </div>
  );
}
