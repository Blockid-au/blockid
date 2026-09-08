// /analyze — unified context-aware entry point.
//
// The three legacy paths (/score free-text, /one-click-report file+URL,
// hero search bar) now converge here. The page shell + hero framing is
// a Server Component so the initial HTML ships fast; the actual
// SmartIntake omnibox is a Client Component that handles drag/drop,
// URL paste, and debounced classification.

import type { Metadata } from "next";
import Link from "next/link";
import { AnalyzeRoot } from "@/components/analyze/analyze-root";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Analyze your startup — SVI Score, Valuation, and Next Actions",
  description:
    "Drop your pitch deck, paste your site URL, or type your idea. The SVI analyzer classifies your stage, runs the right C-Level agents, and returns a score, valuation, and prioritised next actions.",
  openGraph: {
    title: "Analyze your startup — Startup Value Index",
    description:
      "Context-aware analysis: deck, URL, or idea. Stage-detected, agent-tuned, credit-transparent.",
    type: "website",
  },
};

interface SearchParams {
  tier?: string;
}

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const tier = params.tier === "paid" ? "paid" : "free";
  // Anonymous + ?tier=paid means "sell me the A$3 report", not "spend credits
  // you don't have". AnalyzeRoot uses this to switch the confirm step over to
  // the guest checkout. getCurrentUser tolerates missing cookies/Supabase and
  // returns null rather than throwing.
  const user = await getCurrentUser();
  return (
    <main className="min-h-screen bg-surface">
      <section
        aria-labelledby="analyze-hero-heading"
        className="border-b border-line-subtle bg-surface-raised"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 text-center sm:py-14">
          <p className="text-xs uppercase tracking-[0.28em] text-tertiary">
            Startup Value Index · Context-aware
          </p>
          <h1
            id="analyze-hero-heading"
            className="max-w-3xl text-3xl font-semibold text-primary sm:text-5xl"
          >
            One box. Any input. A real analysis.
          </h1>
          <p className="max-w-2xl text-sm text-secondary sm:text-base">
            Drop a pitch deck, paste your site URL, or type your idea. We
            detect your stage, pick the right C-Level agents, and show the
            price before charging you a single credit.
          </p>
          <AnalyzeRoot
            tier={tier as "free" | "paid"}
            authenticated={Boolean(user)}
          />
          <p className="text-xs text-muted">
            Prefer a walkthrough?{" "}
            <Link href="/tbr/demo" className="text-action hover:underline">
              See a real trust report demo
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
