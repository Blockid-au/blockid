import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Code2, Gauge, Terminal } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { API_ENDPOINTS, type ApiEndpointDoc } from "@/lib/api-docs-registry";
import { cn } from "@/lib/utils";

const TITLE = "Public API Reference — BlockID Developer Platform";
const DESCRIPTION =
  "Reference documentation for BlockID's public API — SVI Index aggregates, pricing experiment assign, event write, and the first-principles idea questions engine.";
const CANONICAL = "https://blockid.au/developers/api";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "BlockID API",
    "SVI Index API",
    "pricing experiment API",
    "startup API Australia",
    "OpenAPI spec",
    "public API documentation",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

function MethodPill({ method }: { method: ApiEndpointDoc["method"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        method === "GET"
          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
          : "bg-blue-100 text-blue-700 border border-blue-200",
      )}
    >
      {method}
    </span>
  );
}

export default function ApiIndexPage() {
  const sorted = [...API_ENDPOINTS].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-4xl px-6">
          <header className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-4 py-1.5 mb-6">
              <Code2 strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              <span className="text-xs font-semibold text-brand-700">
                Public API Reference
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink-800">
              BlockID Public API
            </h1>
            <p className="mt-4 text-lg md:text-xl text-ink-500">
              No auth required. No key to email us for. Just call the endpoint.
            </p>
            <p className="mt-3 text-sm text-ink-400 max-w-lg mx-auto">
              Four public endpoints for ecosystem partners — SVI Index
              aggregates, the pricing experiment harness, and the
              first-principles idea questions engine. The same registry that
              renders this page emits{" "}
              <Link
                href="/api/openapi.json"
                className="text-brand-600 hover:underline"
              >
                openapi.json
              </Link>
              , so both surfaces stay in lock-step.
            </p>
          </header>

          <section className="mt-16">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="text-2xl font-bold text-ink-800 flex items-center gap-2">
                <Terminal strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                Endpoints
              </h2>
              <p className="text-xs text-ink-400">
                Sorted by path · {sorted.length} endpoint{sorted.length === 1 ? "" : "s"}
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {sorted.map((ep) => (
                <li key={ep.slug}>
                  <Link
                    href={`/developers/api/${ep.slug}`}
                    className="group block h-full rounded-2xl border border-surface-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm transition-colors"
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <MethodPill method={ep.method} />
                      <code className="text-sm font-mono font-semibold text-ink-800 truncate">
                        {ep.path}
                      </code>
                    </div>
                    <h3 className="text-base font-semibold text-ink-800 group-hover:text-brand-700">
                      {ep.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-ink-500 line-clamp-3">
                      {ep.summary}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-surface-50 px-2.5 py-1 text-[11px] font-semibold text-ink-600">
                        <Gauge strokeWidth={1.75} className="h-3 w-3 text-ink-500" />
                        {ep.rateLimit.perMinute}/min · {ep.rateLimit.bucket}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 group-hover:gap-1.5 transition-all">
                        Read docs
                        <ArrowRight strokeWidth={2} className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-16 rounded-2xl border border-surface-200 bg-surface-50 p-6">
            <h2 className="text-lg font-semibold text-ink-800">
              Machine-readable spec
            </h2>
            <p className="mt-2 text-sm text-ink-600 leading-relaxed">
              An OpenAPI 3.1 document covering every endpoint on this page is
              served at{" "}
              <Link
                href="/api/openapi.json"
                className="font-mono text-brand-600 hover:underline"
              >
                /api/openapi.json
              </Link>
              . Point your codegen or Postman at it — cached for one hour.
            </p>
          </section>

          <footer className="mt-16 border-t border-surface-200 pt-6 text-xs text-ink-400">
            API served from Sydney AU. Data anonymised per Privacy Act 1988.
          </footer>
        </div>
      </main>
      <Footer />
    </>
  );
}
