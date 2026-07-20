import { readFileSync } from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import { SVIEntrance } from "@/components/svi/svi-entrance";
import { NavV2 } from "@/components/landing/nav-v2";
import { HeroSearch } from "@/components/landing/hero-search";
import { HowItWorks } from "@/components/landing/how-it-works";

export const metadata = {
  title:
    "BlockID.au — Search any startup. Get an investor-ready score.",
  description:
    "Type a company name and BlockID scores its investor-readiness in 30 seconds — free, no signup.",
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
  const upgradeV2 = process.env.NEXT_PUBLIC_UPGRADE_V2 === "true";

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
