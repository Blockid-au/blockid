import type { Metadata } from "next";
import { GoogleStyleSearch } from "@/components/search/GoogleStyleSearch";
import { ProShell } from "@/components/layout/ProShell";

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
    <ProShell variant="app">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[11px] tracking-[0.2em] uppercase text-white/50">
          BlockID Search
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Search the Startup Value Index
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-white/70">
          Type a startup name to score it on the Startup Value Index — eight
          dimensions, an AUD valuation range and an Investor Dossier — or
          browse the live index by sector and stage.
        </p>

        {q ? (
          <p className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-white/70">
            You searched for{" "}
            <span className="font-medium text-white">
              &ldquo;{q}&rdquo;
            </span>
            . Score it now, or browse the live index.
          </p>
        ) : null}

        <div className="mt-10">
          <GoogleStyleSearch autoFocus placeholder="Try another search…" />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="/startup-index"
            className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0A0F1E] hover:bg-white/90"
          >
            Browse the Startup Value Index →
          </a>
          <a
            href={q ? `/score?q=${encodeURIComponent(q)}` : "/score"}
            className="rounded-full border border-white/15 px-4 py-2 text-[13px] font-semibold text-white/80 hover:text-white"
          >
            Score a startup
          </a>
        </div>
      </section>
    </ProShell>
  );
}
