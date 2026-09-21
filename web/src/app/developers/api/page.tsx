import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Code2, Gauge, Terminal } from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { Footer } from "@/components/marketing/footer";
import { API_ENDPOINTS, FAKE_BEARER, INSTITUTIONAL_DOCS_PATH, INSTITUTIONAL_ENDPOINTS, type ApiEndpointDoc } from "@/lib/api-docs-registry";
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

// G21 P3-B — the two snippets the Institutional API section shows. The
// only bearer literal is FAKE_BEARER (registry PII guard).
const INSTITUTIONAL_CURL = `# list your cohorts, then every published benchmark at stage 4
curl "https://blockid.au/api/v1/institutional/cohorts" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"
curl "https://blockid.au/api/v1/institutional/benchmarks?stage=4" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"`;

const INSTITUTIONAL_TS = `type Envelope<T> = { ok: true } & T | { ok: false; error: string; message: string };

async function institutional<T>(path: string, etag?: string): Promise<{ status: number; etag: string | null; body: Envelope<T> | null }> {
  const res = await fetch(\`https://blockid.au/api/v1/institutional\${path}\`, {
    headers: { Authorization: "Bearer ${FAKE_BEARER}", ...(etag ? { "If-None-Match": etag } : {}) },
  });
  return { status: res.status, etag: res.headers.get("etag"), body: res.status === 304 ? null : await res.json() };
}

const cohorts = await institutional<{ data: { id: string; name: string }[] }>("/cohorts");
if (cohorts.body?.ok) {
  const first = cohorts.body.data[0];
  const items = await institutional<{ data: { items: { company: string; svi: number | null; evidence_confidence: number | null }[] } }>(\`/cohorts/\${first.id}\`);
  if (items.body?.ok) console.table(items.body.data.items);
}`;

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
      <NavV2 />
      <main id="main" className="flex-1 pt-10 md:pt-16 pb-24">
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
              Five public endpoints with no key at all; eleven more behind a
              bk_live_ key you mint yourself.
            </p>
            <p className="mt-3 text-sm text-ink-400 max-w-lg mx-auto">
              Public: SVI Index aggregates, the Business ID profile JSON, the
              pricing experiment harness and the first-principles idea
              questions engine. Keyed: credit-metered SVI analysis and the
              Evaluator API v1 (evaluations, dossier, assessments) and the
              read-only Institutional API (cohorts, snapshots, benchmarks — Fund,
              Program and Index API plans). The same registry that renders this page emits{" "}
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

            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sorted.map((ep) => (
                <li key={ep.slug} className="min-w-0">
                  <Link
                    href={`/developers/api/${ep.slug}`}
                    className="group block h-full rounded-2xl border border-surface-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm transition-colors"
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <MethodPill method={ep.method} />
                      <code className="min-w-0 text-sm font-mono font-semibold text-ink-800 truncate">
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

          {/* G21 P3-B — the read-only Institutional API, in one place with the two snippets. */}
          <section id="institutional" className="mt-16 scroll-mt-24 rounded-2xl border border-surface-200 bg-white p-6" aria-labelledby="institutional-heading" data-testid="institutional-api">
            <div className="flex items-center gap-2">
              <Building2 strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
              <h2 id="institutional-heading" className="text-lg font-semibold text-ink-800">
                Institutional API (read-only)
              </h2>
            </div>
            <p className="mt-2 text-sm text-ink-600 leading-relaxed">
              For accelerators, programs and funds that run BlockID Cohorts and want the numbers in their own systems:{" "}
              {INSTITUTIONAL_ENDPOINTS.length} read-only endpoints under <code className="font-mono text-brand-700">/api/v1/institutional/*</code> — cohorts, cohort items (SVI, evidence confidence, verification, gaps, decision), snapshots, one company&apos;s Assessment Card, the published benchmark segments (always with n) and the methodology facts to pin. Same <code className="font-mono">bk_live_</code> key as the Evaluator API with the <code className="font-mono">evaluations:read</code> scope; Fund, Program and Index API plans; 600 reads per key per hour on top of the per-minute budget. Every read is written to the audit log with the key&apos;s id; no response carries a founder&apos;s e-mail or a private note. Full contract: <Link href={INSTITUTIONAL_DOCS_PATH} className="text-brand-600 hover:underline" data-testid="institutional-docs-link">/docs/api/institutional</Link>.
            </p>
            <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
              {INSTITUTIONAL_ENDPOINTS.map((ep) => (
                <li key={ep.slug} className="min-w-0 truncate">
                  <Link href={`/developers/api/${ep.slug}`} className="text-brand-700 hover:underline">
                    <code className="font-mono text-xs">{ep.path}</code>
                  </Link>
                </li>
              ))}
            </ul>
            {/* min-w-0 on the grid children: a <pre> otherwise widens its column past the viewport at 375 px (sweep). */}
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">curl</p>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">
                  <code>{INSTITUTIONAL_CURL}</code>
                </pre>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">TypeScript</p>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">
                  <code>{INSTITUTIONAL_TS}</code>
                </pre>
              </div>
            </div>
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
