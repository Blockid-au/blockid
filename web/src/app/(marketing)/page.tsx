import { readFileSync } from "node:fs";
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

// Fintech v2 (2026-09-08): the homepage tells the 70/30 story — 70%
// AI-powered evaluation + valuation, 30% blockchain equity on
// subscription. Section order is deliberate:
//
//   1. HeroSection       — H1 leads with the AI valuation promise.
//   2. TwoPillarSplit    — asymmetric 70/30 pillar cards.
//   3. SampleOutputs     — analysis-only samples (AI pillar).
//   4. HowItWorksSection — 4 steps, 3 AI + 1 tokenize.
//   5. GrowthPhaseStrip  — belongs to the AI pillar (evaluation journey).
//   6. LogoBand          — trust + compliance strip (dark island).
//   7. FinalCTA          — primary Analyse button, text link to pricing.
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
    <div style={{ backgroundColor: "#0A0F1E" }} className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[#00D4FF] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0A0F1E]"
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

        {/* 4. How-it-works — 4 steps (3 AI + 1 tokenize). */}
        <HowItWorksSection />

        {/* 5. Growth phase strip — belongs to the AI pillar. Wraps to
            /showcase/atlassian so visitors can walk a real journey. */}
        <a
          href="/showcase/atlassian/growth-phases"
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]"
          aria-label="Where is your startup on the 12-phase growth journey?"
        >
          <GrowthPhaseStrip
            variant="menu"
            eyebrow="Where's your startup?"
          />
        </a>

        {/* 6. Trust + compliance strip — dark island. */}
        <LogoBand />

        {/* 7. Final CTA — primary Analyse button + secondary pricing link. */}
        <FinalCTA />

        {/* Entity footer strip — preserves the PPL Food entity line. */}
        <section
          id="trust"
          aria-labelledby="trust-heading"
          className="border-t py-10"
          style={{
            backgroundColor: "#0A0F1E",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <h2 id="trust-heading" className="sr-only">
            About BlockID.au
          </h2>
          <div className="mx-auto max-w-4xl px-6 text-center">
            <p
              className="text-xs font-medium uppercase tracking-[0.2em]"
              style={{ color: "#94A3B8" }}
            >
              Australian owned {"·"} Built in Sydney
            </p>
            <p className="mt-3 text-sm" style={{ color: "#94A3B8" }}>
              {entityLine}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
