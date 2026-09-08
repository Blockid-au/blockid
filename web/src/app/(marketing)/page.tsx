import { readFileSync } from "node:fs";
import Link from "next/link";
import path from "node:path";
import { NavV2 } from "@/components/landing/nav-v2";
import { HeroSection } from "@/components/marketing/hero-section";
import { TwoPillarSplit } from "@/components/marketing/two-pillar-split";
import { SampleOutputs } from "@/components/marketing/sample-outputs";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { GrowthPhaseStrip } from "@/components/marketing/growth-phase-strip";
import { LogoBand } from "@/components/marketing/logo-band";
import { FinalCTA } from "@/components/marketing/final-cta";
import {
  readSignedInHint,
  SIGNED_IN_LANDING_HREF,
} from "@/lib/supabase/session-hint";

// Fintech v3 (2026-09-08): the homepage tells the 70/30 story — 70%
// AI-powered evaluation + valuation, 30% blockchain equity on
// subscription.
//
// LIGHT/DARK RHYTHM. v2 banded dark -> light -> light -> dark -> dark ->
// dark -> light -> dark, which is why the page read as sections from
// different sites stacked together. The design system is light-first
// (docs/design-system.md rev.3), so v3 is light-DOMINANT with exactly ONE
// dark punctuation band in the middle:
//
//   1. HeroSection       — LIGHT  (bg.base)     H1 + omnibox + proof row.
//   2. TwoPillarSplit    — LIGHT  (bg.sunken)   asymmetric 70/30 cards.
//   3. SampleOutputs     — LIGHT  (bg.base)     three anonymised stages.
//   4. HowItWorks        — DARK   punctuation   4 steps …
//   5.   └ GrowthPhaseStrip — nested INSIDE the same dark band so the
//        12-phase journey is part of the punctuation, not a second
//        adjacent dark fragment.
//   6. LogoBand          — LIGHT  (bg.sunken)   trust + compliance.
//   7. FinalCTA          — LIGHT  (bg.base)     primary Analyse button.
//   8. Entity strip      — DARK   footer edge   PPL Food PTY LTD.
//
// So the page alternates base/sunken/base — dark — sunken/base — dark
// footer. Two dark regions total, both deliberate, both at structural
// boundaries.
export const metadata = {
  title:
    "AI-powered startup valuation before you pitch · BlockID.au",
  description:
    "Paste your pitch deck, URL, or idea. Get an SVI score, 4-method valuation, and investor-ready data room in 30 seconds. Add blockchain equity on subscription.",
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
        {/* 1. Hero — input omnibox anchor, H1 leads AI-valuation promise. */}
        <HeroSection />

        {/* 2. Two-pillar split — asymmetric 70/30 (AI col-span-8, blockchain
            col-span-4 on desktop; stacked AI-first on mobile). */}
        <TwoPillarSplit />

        {/* 3. Sample outputs — analysis-only samples so visitors see what
            the omnibox produces before they type. */}
        <SampleOutputs />

        {/* 4 + 5. How-it-works, with the 12-phase growth strip nested
            INSIDE the same dark band. Keeping them in one section is what
            turns two adjacent dark fragments into a single deliberate
            punctuation island. The strip links to the real Atlassian
            walkthrough so visitors can walk an actual journey. */}
        <HowItWorksSection>
          <Link
            href="/showcase/atlassian/growth-phases"
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-inset"
            aria-label="Where is your startup on the 12-phase growth journey?"
          >
            <GrowthPhaseStrip
              variant="menu"
              eyebrow="Where's your startup? — 12-phase journey"
            />
          </Link>
        </HowItWorksSection>

        {/* 6. Trust + compliance strip — light. */}
        <LogoBand />

        {/* 7. Final CTA — primary Analyse button + secondary pricing link. */}
        <FinalCTA />

        {/* Entity footer strip — preserves the PPL Food entity line. */}
        {/* 8. Entity strip — the page's second and last dark region, at
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
