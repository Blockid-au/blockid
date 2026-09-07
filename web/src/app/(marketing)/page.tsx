import { readFileSync } from "node:fs";
import path from "node:path";
import { NavV2 } from "@/components/landing/nav-v2";
import { HeroSection } from "@/components/marketing/hero-section";
import { LogoBand } from "@/components/marketing/logo-band";
import { FeaturesGrid } from "@/components/marketing/features-grid";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { CTASection } from "@/components/marketing/cta-section";
import { TrustStrip } from "@/components/landing/trust-strip";
import {
  readSignedInHint,
  SIGNED_IN_LANDING_HREF,
} from "@/lib/supabase/session-hint";

// Phase 2 hero rework (2026-09) put the SVI score front-and-centre in the
// H1 ("Know your startup's SVI score in 60 seconds"). The <title> and
// og:image:alt below intentionally mirror that headline so the browser tab,
// search snippet, and social card all reinforce the same score-first promise.
export const metadata = {
  title:
    "Know your startup's SVI score in 60 seconds · BlockID.au",
  description:
    "AU-first startup evaluation across 8 SVI dimensions. Real benchmarks, evidence-linked scoring, founder-first tools — get your Startup Value Index, AUD valuation range and GTM strategy in under 3 seconds.",
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

  const entityLine = [
    "Auschain PTY LTD",
    "ACN 659 615 111",
    "ABN 79 659 615 111",
    version,
  ]
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
        {/* Hero: full viewport, animated gradient search ring */}
        <HeroSection />

        {/* Logo band: trusted by AU founders */}
        <LogoBand />

        {/* Features: 6 glassmorphism cards */}
        <FeaturesGrid />

        {/* How it works: 3 numbered steps */}
        <HowItWorksSection />

        {/* Partners / trust strips */}
        <section
          id="partners"
          aria-labelledby="partners-heading"
          className="border-t py-12"
          style={{
            backgroundColor: "#0A0F1E",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <h2 id="partners-heading" className="sr-only">
            Programs and integrations
          </h2>
          <div className="mx-auto max-w-5xl px-6">
            <TrustStrip group="accepted" className="mt-4" />
            <TrustStrip group="integrated" className="mt-8" />
          </div>
        </section>

        {/* CTA: bottom gradient-border card */}
        <CTASection />

        {/* Entity footer strip */}
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
