// /analyze — unified context-aware entry point.
//
// The three legacy paths (/score free-text, /one-click-report file+URL,
// hero search bar) now converge here. The page shell + hero framing is
// a Server Component so the initial HTML ships fast; the actual
// SmartIntake omnibox is a Client Component that handles drag/drop,
// URL paste, and debounced classification.
//
// QA audit 2026-09-14 F4: this is the main conversion page (the hero hands
// off here, /score 301s here) yet it shipped with no header, nav or footer —
// a trial user had no path to Sign in / Pricing / Home / Privacy. It now
// renders inside `MarketingShell` (skip link + NavV2 + `<main
// id="main-content">` + Footer) like /pricing. The shell is a server
// component with no `headers()`/`cookies()`; the page itself stays dynamic
// (`getCurrentUser()` reads the session cookie) and is not on the S31-D
// public-cacheable allow-list, so nothing about caching or CSP mode changes.

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import Link from "next/link";
import { AnalyzeRoot } from "@/components/analyze/analyze-root";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getCurrentUser } from "@/lib/auth";
import { parseClaimedParam } from "@/lib/analyses/summary";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/t";
import { freeReportCopy } from "@/lib/reports/free-report-copy";

export const metadata: Metadata = pageMetadata({
  title: "Analyze your startup — SVI score and valuation",
  description: "Drop your pitch deck, paste your site URL or type your idea. Get a score across eight dimensions, a valuation from four methods and a ranked list of fixes.",
  path: "/analyze",
});

interface SearchParams {
  tier?: string;
  /** Text or URL the visitor already typed in the homepage hero. */
  q?: string;
  /** Which variant the hero classified: "url" | "deck" | "idea". */
  kind?: string;
  /** `signup` — coming back from the account wall, run already promised free. */
  resume?: string;
  /** How many earlier runs the signup/login just attached to the account. */
  claimed?: string;
}

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const tier = params.tier === "paid" ? "paid" : "free";
  // The hero already collected the input. Carrying it through here is what
  // stops /analyze asking for it a second time.
  const initialQuery = typeof params.q === "string" ? params.q : undefined;
  const initialKind = typeof params.kind === "string" ? params.kind : undefined;
  // Anonymous + ?tier=paid means "sell me the A$3 report", not "spend credits
  // you don't have". AnalyzeRoot uses this to switch the confirm step over to
  // the guest checkout. getCurrentUser tolerates missing cookies/Supabase and
  // returns null rather than throwing.
  // Returning from the signup gate: this exact run was promised free before
  // the account existed, so it starts immediately instead of routing through
  // a credit confirmation a brand-new (zero-credit) account could not clear.
  const resumedFromSignup = params.resume === "signup";
  // Real claim count from the auth endpoint, carried through the redirect.
  const claimed = parseClaimedParam(params.claimed);
  const user = await getCurrentUser();
  // G25-C — the free-allowance copy (EN / VI), resolved once here so the
  // client tree never carries the catalogues.
  const locale = await getLocale();
  const copy = freeReportCopy(await getMessages(locale), locale);
  return (
    <MarketingShell>
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
            Drop a pitch deck, paste your site URL, or type your idea. We work
            out what stage the business is at, look at what matters at that
            stage, and show you the price before anything is charged.
          </p>
          <AnalyzeRoot
            tier={tier as "free" | "paid"}
            freeReportCopy={copy}
            authenticated={Boolean(user)}
            initialQuery={initialQuery}
            initialKind={initialKind}
            resumedFromSignup={resumedFromSignup}
            claimed={claimed}
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
    </MarketingShell>
  );
}
