import type { Metadata } from "next";
import { GoogleStyleSearch } from "@/components/search/GoogleStyleSearch";
import { ProShell } from "@/components/layout/ProShell";

export const metadata: Metadata = {
  title: "Search — BlockID",
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
          Search coming soon
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-white/70">
          We&apos;re building live search over the Startup Value Index™ — every
          Australian startup, valuation, sector and stage. In the meantime you
          can browse the live index.
        </p>

        {q ? (
          <p className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-white/70">
            You searched for{" "}
            <span className="font-medium text-white">
              &ldquo;{q}&rdquo;
            </span>
            . We&apos;ll notify early users when results go live.
          </p>
        ) : null}

        <div className="mt-10">
          <GoogleStyleSearch autoFocus placeholder="Try another search…" />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="/index"
            className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0A0F1E] hover:bg-white/90"
          >
            Browse Startup Index →
          </a>
          <a
            href="/founding-50"
            className="rounded-full border border-white/15 px-4 py-2 text-[13px] font-semibold text-white/80 hover:text-white"
          >
            Founding 100 · A$5
          </a>
        </div>
      </section>
    </ProShell>
  );
}
