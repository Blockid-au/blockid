import { readFileSync } from "node:fs";
import Link from "next/link";
import path from "node:path";
import { NavV2 } from "@/components/landing/nav-v2";
import { HeroSection } from "@/components/marketing/hero-section";
import { OutcomeGrid } from "@/components/marketing/outcome-grid";
import { SampleOutputs } from "@/components/marketing/sample-outputs";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { GrowthPhaseStrip } from "@/components/marketing/growth-phase-strip";
import { LogoBand } from "@/components/marketing/logo-band";
import { FinalCTA } from "@/components/marketing/final-cta";
import { EquityBand } from "@/components/marketing/equity-band";
import { AudienceSplit } from "@/components/marketing/audience-split";
import {
  readSignedInHint,
  SIGNED_IN_LANDING_HREF,
} from "@/lib/supabase/session-hint";

// Homepage v4 (2026-09-08) — evaluation-led, two audiences, one dark band.
//
// WHAT CHANGED AND WHY
//
// v3 told visitors about our own weighting ("AI evaluation, weighted 70%.
// Blockchain equity on subscription, 30%"). That is a sentence from a
// strategy deck: true, and useless to a founder deciding whether to paste a
// deck. v4 keeps the same 70/30 emphasis but expresses it structurally —
// four evaluation-led bands before equity gets its own smaller one — and
// spends the words on what the visitor gets instead.
//
// v3 also spoke only to founders. An investor had no line addressed to them
// and no route in, despite /for/investor and the sample reports existing.
// AudienceSplit fixes that with one question and one link per side.
//
// PATTERN: bento grid (ui-ux-pro-max "Bento Box Grid") over a proof-first
// tour. The product is a *set* of artefacts produced from one input, so
// varying tile weight shows the whole set at a glance the way Stripe and
// Linear show a multi-artefact product — rather than the skill's default
// scroll-storytelling pattern, which needs animation-heavy chapters and
// would fight both the calm reference class and the 390px requirement.
//
// LIGHT/DARK RHYTHM — light-dominant, ONE dark punctuation band plus the
// dark footer edge, held for the whole page:
//
//   1. HeroSection    — LIGHT  (bg.base)    H1 + omnibox + one real result.
//   2. OutcomeGrid    — LIGHT  (bg.sunken)  bento of what a run returns.
//   3. SampleOutputs  — LIGHT  (bg.base)    three anonymised runs.
//   4. HowItWorks     — DARK   punctuation  4 steps …
//   5.   └ GrowthPhaseStrip — nested INSIDE the same dark band.
//   6. EquityBand     — LIGHT  (bg.sunken)  the 30%: register, ESOP, payouts.
//   7. AudienceSplit  — LIGHT  (bg.base)    founders | investors.
//   8. LogoBand       — LIGHT  (bg.sunken)  where it is built and how it runs.
//   9. FinalCTA       — LIGHT  (bg.base)    one primary button.
//  10. Entity strip   — DARK   footer edge  PPL Food PTY LTD.
export const metadata = {
  title:
    "Know what your company is worth · BlockID.au",
  description:
    "Give it a pitch deck, a website, or a few sentences. Get a score across eight dimensions, a valuation from four methods, the next moves that lift both, and a data room investors can read. Issue and administer equity when you are ready.",
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
        {/* 1. Hero — the omnibox. Whatever is typed here carries straight
            through to a running analysis; it is never asked for twice. */}
        <HeroSection />

        {/* 2. What a run returns — bento, evaluation-led. */}
        <OutcomeGrid />

        {/* 3. Proof: three anonymised runs at three different stages. */}
        <SampleOutputs />

        {/* 4 + 5. The page's ONE dark punctuation band: the four steps with
            the 12-phase journey nested inside it, so the two dark regions
            that used to sit adjacent read as a single island. The strip
            links to the real Atlassian walkthrough. */}
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

        {/* 6. The equity half — deliberately the smaller half. */}
        <EquityBand />

        {/* 7. Founders and investors, one question each. */}
        <AudienceSplit />

        {/* 8. Where it is built and how it is run. */}
        <LogoBand />

        {/* 9. Final CTA — one primary button, pricing as a text link. */}
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
