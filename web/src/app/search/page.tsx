import type { Metadata } from "next";
import { GoogleStyleSearch } from "@/components/search/GoogleStyleSearch";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaRow, PageHero } from "@/components/marketing/template";

export const metadata: Metadata = {
  title: "Search",
  description: "Search startups, sectors and valuations on BlockID.au.",
  robots: { index: false, follow: true },
};

// Query is echoed to a server-side console log so we can measure demand
// while the actual search backend is being built.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp?.q;
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();

  if (q) {
    console.log(
      JSON.stringify({
        event: "search_query",
        q,
        at: new Date().toISOString(),
      }),
    );
  }

  return (
    <MarketingShell>
      <PageHero
        eyebrow="BlockID Search"
        title="Search the Startup Value Index"
        sub="Type a startup name to score it on the Startup Value Index — eight dimensions, an AUD valuation range and an Investor Dossier — or browse the live index by sector and stage."
        align="start"
        visual={
          <div className="mt-2 max-w-3xl">
            {q ? (
              <p className="mb-6 rounded-lg border border-line-subtle bg-surface-sunken px-4 py-3 text-[13px] text-secondary">
                You searched for <span className="font-medium text-primary">&ldquo;{q}&rdquo;</span>. Score it now, or browse the live index.
              </p>
            ) : null}
            <GoogleStyleSearch autoFocus placeholder="Try another search…" />
            <CtaRow
              className="mt-8"
              ctas={[
                { href: "/startup-index", label: "Browse the Startup Value Index", ctaId: "search_browse_index" },
                { href: q ? `/score?q=${encodeURIComponent(q)}` : "/score", label: "Score a startup", variant: "secondary", ctaId: "search_score" },
              ]}
            />
          </div>
        }
      />
    </MarketingShell>
  );
}
