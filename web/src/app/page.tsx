import { readFileSync } from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import { SVIEntrance } from "@/components/svi/svi-entrance";
import { NavV2 } from "@/components/landing/nav-v2";
import { HeroSearch } from "@/components/landing/hero-search";
import { HeroV3, EmotionalBand } from "@/components/landing/hero-v3";
import { HowItWorks } from "@/components/landing/how-it-works";
import { TrustStrip } from "@/components/landing/trust-strip";

export const metadata = {
  title:
    "BlockID.au — One Business. One Trusted Identity.",
  description:
    "Give your business a trusted digital identity. BlockID.au turns identity, evidence and capabilities into one reusable Business ID — verified for investors, procurement, grants and partners.",
  alternates: {
    canonical: "https://blockid.au",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Reads the current build's version string from
 * `web/content/reports/version.json` — cached at module scope. The homepage
 * is `force-dynamic`, so this used to hit the disk on every request. The
 * version.json file only changes on deploy, and each deploy spawns a fresh
 * Node process, so a per-process cache is safe and cannot go stale. Returns
 * `null` when the file is missing or malformed so the caller can omit the
 * suffix rather than render a placeholder — the trust strip must never lie.
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

export default function HomePage() {
  const upgradeV3 = process.env.NEXT_PUBLIC_UPGRADE_V3 === "true";
  const upgradeV2 = process.env.NEXT_PUBLIC_UPGRADE_V2 === "true";

  // V3 rollout §7.8 stage (a): message swap + emotional band behind
  // NEXT_PUBLIC_UPGRADE_V3. Falls back to V2 (search-first) or the legacy
  // SVIEntrance if neither flag is set. Only the marketing hero swaps here;
  // /how-it-works, /partners, /trust bands stay identical between V2 and V3.
  if (upgradeV3) {
    const version = readVersionString();
    const entityLine = [
      "Auschain PTY LTD",
      "ACN 659 615 111",
      "ABN 79 659 615 111",
      version,
    ]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join(" · ");

    return (
      <div data-theme="lux" className="bg-brand-navy min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-navy"
        >
          Skip to content
        </a>
        <NavV2 />
        <main id="main-content">
          <HeroV3 />
          <EmotionalBand />
          <section
            id="how"
            aria-labelledby="how-it-works-heading"
            className="border-t border-brand-navy/10 py-16"
          >
            <h2 id="how-it-works-heading" className="sr-only">
              How BlockID.au works
            </h2>
            <HowItWorks />
          </section>
          <section
            id="partners"
            aria-labelledby="partners-heading"
            className="border-t border-brand-navy/10 py-12"
          >
            <h2 id="partners-heading" className="sr-only">
              Programs and integrations
            </h2>
            <div className="mx-auto max-w-5xl px-6">
              <TrustStrip group="accepted" className="mt-4" />
              <TrustStrip group="integrated" className="mt-8" />
            </div>
          </section>
          <section
            id="trust"
            aria-labelledby="trust-heading"
            className="border-t border-brand-navy/10 py-12"
          >
            <h2 id="trust-heading" className="sr-only">
              About BlockID.au
            </h2>
            <div className="mx-auto max-w-4xl px-6 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-600">
                Australian owned {"·"} Built in Sydney
              </p>
              <p className="mt-3 text-sm text-ink-700">{entityLine}</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (upgradeV2) {
    const version = readVersionString();
    const entityLine = [
      "Auschain PTY LTD",
      "ACN 659 615 111",
      "ABN 79 659 615 111",
      version,
    ]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join(" · ");

    return (
      <div data-theme="lux" className="bg-brand-navy min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-navy"
        >
          Skip to content
        </a>
        <NavV2 />
        <main id="main-content">
          <HeroSearch />
          <section
            id="how"
            aria-labelledby="how-it-works-heading"
            className="border-t border-brand-navy/10 py-16"
          >
            <h2 id="how-it-works-heading" className="sr-only">
              How BlockID.au works
            </h2>
            <HowItWorks />
          </section>
          <section
            id="partners"
            aria-labelledby="partners-heading"
            className="border-t border-brand-navy/10 py-12"
          >
            <h2 id="partners-heading" className="sr-only">
              Programs and integrations
            </h2>
            <div className="mx-auto max-w-5xl px-6">
              <TrustStrip group="accepted" className="mt-4" />
              <TrustStrip group="integrated" className="mt-8" />
            </div>
          </section>
          <section
            id="trust"
            aria-labelledby="trust-heading"
            className="border-t border-brand-navy/10 py-12"
          >
            <h2 id="trust-heading" className="sr-only">
              About BlockID.au
            </h2>
            <div className="mx-auto max-w-4xl px-6 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-600">
                Australian owned {"·"} Built in Sydney
              </p>
              <p className="mt-3 text-sm text-ink-700">{entityLine}</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <Suspense>
      <SVIEntrance />
    </Suspense>
  );
}
