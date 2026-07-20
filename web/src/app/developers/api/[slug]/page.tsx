import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Gauge } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import {
  API_ENDPOINTS,
  getEndpointBySlug,
  type ApiEndpointDoc,
  type ApiParamDoc,
} from "@/lib/api-docs-registry";
import { cn } from "@/lib/utils";
import { CopySnippet } from "./copy-snippet";

interface RouteParams {
  slug: string;
}

export function generateStaticParams(): RouteParams[] {
  return API_ENDPOINTS.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ep = getEndpointBySlug(slug);
  if (!ep) return {};
  const title = `${ep.method} ${ep.path} — BlockID API`;
  const url = `https://blockid.au/developers/api/${ep.slug}`;
  return {
    title,
    description: ep.summary,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: {
      title,
      description: ep.summary,
      type: "article",
      url,
      siteName: "BlockID",
      locale: "en_AU",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: ep.summary,
    },
  };
}

function MethodPill({ method }: { method: ApiEndpointDoc["method"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
        method === "GET"
          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
          : "bg-blue-100 text-blue-700 border border-blue-200",
      )}
    >
      {method}
    </span>
  );
}

function ParamsTable({ params }: { params: ApiParamDoc[] }) {
  if (params.length === 0) {
    return (
      <p className="text-sm text-ink-500 italic">
        This endpoint takes no parameters.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-surface-200">
      <table className="w-full text-sm">
        <thead className="bg-surface-50">
          <tr>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-ink-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-ink-500 uppercase tracking-wider">
              In
            </th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-ink-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-ink-500 uppercase tracking-wider">
              Required
            </th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-ink-500 uppercase tracking-wider">
              Description
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100 bg-white">
          {params.map((p) => (
            <tr key={`${p.in}:${p.name}`}>
              <td className="px-4 py-2.5 align-top">
                <code className="font-mono text-xs font-semibold text-ink-800">
                  {p.name}
                </code>
                {p.example ? (
                  <div className="mt-1 text-[11px] text-ink-400">
                    e.g. <code className="font-mono">{p.example}</code>
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-2.5 align-top text-xs text-ink-600">{p.in}</td>
              <td className="px-4 py-2.5 align-top">
                <code className="font-mono text-xs text-ink-600">{p.type}</code>
              </td>
              <td className="px-4 py-2.5 align-top text-xs">
                {p.required ? (
                  <span className="inline-flex rounded-full bg-red-50 border border-red-200 px-2 py-0.5 font-semibold text-red-700">
                    required
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-surface-100 border border-surface-200 px-2 py-0.5 text-ink-500">
                    optional
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 align-top text-sm text-ink-600 leading-relaxed">
                {p.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({
  code,
  language,
  copyLabel,
  tone = "default",
}: {
  code: string;
  language: string;
  copyLabel: string;
  tone?: "default" | "success";
}) {
  return (
    <div className="relative rounded-xl bg-ink-900 border border-ink-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-ink-700">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
          {language}
        </span>
      </div>
      <CopySnippet text={code} label={copyLabel} />
      <pre
        className={cn(
          "p-4 overflow-x-auto text-sm leading-relaxed",
          tone === "success" ? "text-emerald-300" : "text-slate-300",
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default async function ApiEndpointDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const ep = getEndpointBySlug(slug);
  if (!ep) notFound();

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-6">
            <Link
              href="/developers/api"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              <ArrowLeft strokeWidth={2} className="h-4 w-4" />
              All endpoints
            </Link>
          </div>

          <header>
            <div className="flex items-center gap-3 mb-3">
              <MethodPill method={ep.method} />
              <code className="text-base font-mono font-semibold text-ink-800">
                {ep.path}
              </code>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-surface-50 px-2.5 py-1 text-[11px] font-semibold text-ink-600">
                <Gauge strokeWidth={1.75} className="h-3 w-3 text-ink-500" />
                {ep.rateLimit.perMinute}/min · {ep.rateLimit.bucket}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-800">
              {ep.title}
            </h1>
            <p className="mt-3 text-base text-ink-500 leading-relaxed">
              {ep.summary}
            </p>
          </header>

          <section className="mt-10">
            <h2 className="text-xl font-bold text-ink-800 mb-3">Description</h2>
            <p className="text-sm text-ink-600 leading-relaxed whitespace-pre-line">
              {ep.description}
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold text-ink-800 mb-3">Parameters</h2>
            <ParamsTable params={ep.params} />
          </section>

          {ep.requestBodyExample ? (
            <section className="mt-10">
              <h2 className="text-xl font-bold text-ink-800 mb-3">
                Request body
              </h2>
              <CodeBlock
                code={ep.requestBodyExample}
                language="json"
                copyLabel="request body"
              />
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="text-xl font-bold text-ink-800 mb-3">
              Response example
            </h2>
            <CodeBlock
              code={ep.responseExample}
              language="json"
              copyLabel="response example"
              tone="success"
            />
          </section>

          <section className="mt-10 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-xl font-bold text-ink-800 mb-3">cURL</h2>
              <CodeBlock
                code={ep.curlSnippet}
                language="bash"
                copyLabel="cURL snippet"
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink-800 mb-3">JavaScript</h2>
              <CodeBlock
                code={ep.jsSnippet}
                language="javascript"
                copyLabel="JavaScript snippet"
              />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold text-ink-800 mb-3">Rate limit</h2>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm text-ink-600">
              <p>
                Up to{" "}
                <strong className="text-ink-800">
                  {ep.rateLimit.perMinute} requests per minute
                </strong>{" "}
                per IP under the{" "}
                <code className="rounded bg-white border border-surface-200 px-1.5 py-0.5 font-mono text-xs">
                  {ep.rateLimit.bucket}
                </code>{" "}
                bucket. Consistent 429s? Contact us and we&apos;ll bump you.
              </p>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold text-ink-800 mb-3">Error codes</h2>
            <ul className="divide-y divide-surface-100 rounded-xl border border-surface-200 bg-white">
              {ep.errorCodes.map((e) => (
                <li key={`${e.code}:${e.when}`} className="flex gap-4 p-4">
                  <code
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 h-fit text-xs font-mono font-semibold",
                      e.code >= 500
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : e.code >= 400
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200",
                    )}
                  >
                    {e.code}
                  </code>
                  <p className="text-sm text-ink-600 leading-relaxed">
                    {e.when}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold text-ink-800 mb-3">Changelog</h2>
            <ol className="space-y-2">
              {ep.changelog.map((c) => (
                <li
                  key={`${c.date}:${c.note}`}
                  className="flex gap-4 text-sm"
                >
                  <time
                    dateTime={c.date}
                    className="shrink-0 font-mono text-xs text-ink-400 pt-0.5"
                  >
                    {c.date}
                  </time>
                  <span className="text-ink-600 leading-relaxed">{c.note}</span>
                </li>
              ))}
            </ol>
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
