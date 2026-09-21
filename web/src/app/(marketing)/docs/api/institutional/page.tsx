/**
 * /docs/api/institutional — the Institutional API contract, in-app (G22-C).
 *
 * Until now `/developers/api#institutional` linked the contract out to
 * GitHub (`docs/api/institutional.md`). This page renders that document on
 * the marketing template (`PageHero` → "On this page" → `<Prose>` body →
 * `CtaBand`), read at build time by `loadInstitutionalDoc()` and rendered by
 * `lib/markdown/lite` (tables, code fences, lists, inline code — token
 * classes only, HTML escaped). `/developers/api` and the API registry link
 * here; the source path + GitHub link stay in the footer of the page so an
 * integrator can diff the file.
 *
 * Static: no `revalidate`, no request APIs — the document is baked into the
 * prerendered HTML by `next build`. Should the read fail at build the page
 * still renders (a notice + the GitHub link + the endpoint list), never 500.
 *
 * Test contract: one H1, `data-testid="institutional-doc"` body with every
 * `##` of the document as an h2, `institutional-doc-toc`, the six registry
 * endpoints linked, canonical /docs/api/institutional.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Building2, KeyRound, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FOCUS_RING, FeatureGrid, MOTION, PageHero, Prose, Section } from "@/components/marketing/template";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { INSTITUTIONAL_DOCS_PATH, INSTITUTIONAL_ENDPOINTS } from "@/lib/api-docs-registry";
import { pageMetadata } from "@/lib/seo/page-meta";
import { cn } from "@/lib/utils";
import { INSTITUTIONAL_DOC_GITHUB_URL, INSTITUTIONAL_DOC_REPO_PATH, loadInstitutionalDoc } from "./institutional-doc";

export const PATH = INSTITUTIONAL_DOCS_PATH;
const TITLE = "Institutional API reference (read-only)";
const DESCRIPTION =
  "Read-only Institutional API for accelerators, programs and funds: six endpoints, bearer-key auth, hourly limits, ETag caching, error envelope and PII stance.";

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH, ogType: "article" });

const DOC = loadInstitutionalDoc();

const HERO_SUB =
  "Accelerators, programs and funds that run BlockID Cohorts read the assessment numbers into their own systems — a program CRM, a portfolio dashboard, an LP data room — through six read-only endpoints. This page is the contract, rendered from the repository document.";

const FACTS = [
  { icon: Building2, title: "Read-only, keyed to the caller", body: "Cohorts, cohort items, snapshots, one company's Assessment Card, published benchmarks and the methodology facts — never a write, never a cross-tenant read." },
  { icon: KeyRound, title: "Same key as the Evaluator API", body: "A bk_live_ key with the evaluations:read scope on a Fund, Program or Index API plan; 600 reads per key per hour on top of the per-minute budget." },
  { icon: ShieldCheck, title: "No founder PII, every read audited", body: "Company name, ids, scores and counts only. Each read writes one institutional.read row to the hash-chained audit log the organisation owner can export." },
] as const;

export default function InstitutionalApiDocPage() {
  return (
    <MarketingShell>
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Developers", href: "/developers" },
          { name: "API reference", href: "/developers/api" },
          { name: "Institutional API", href: PATH },
        ]}
      />
      <PageHero
        eyebrow="Developers · API reference"
        title="Institutional API (read-only)"
        sub={HERO_SUB}
        ctas={[
          { href: "#contract", label: "Read the contract", ctaId: "institutional_doc_contract" },
          { href: "/developers/api#institutional", label: "Endpoint reference + snippets" },
        ]}
        align="start"
      />

      <Section id="at-a-glance" eyebrow="At a glance" title="What the contract guarantees" tone="sunken">
        <FeatureGrid columns={3} ariaLabel="Institutional API guarantees" items={FACTS.map((f) => ({ icon: f.icon, title: f.title, body: f.body }))} />
      </Section>

      <Section id="endpoints" eyebrow="Endpoints" title={`${INSTITUTIONAL_ENDPOINTS.length} read-only routes under /api/v1/institutional/*`} lede="Each row opens the endpoint page with parameters, an example response, curl and TypeScript snippets, rate limits and error codes.">
        <ul data-testid="institutional-doc-endpoints" className="grid gap-2 sm:grid-cols-2">
          {INSTITUTIONAL_ENDPOINTS.map((ep) => (
            <li key={ep.slug} className="min-w-0">
              <Link
                href={`/developers/api/${ep.slug}`}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg border border-line-subtle bg-surface px-4 py-2 text-sm text-primary hover:border-line hover:bg-surface-hover",
                  MOTION,
                  FOCUS_RING,
                )}
              >
                <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent">{ep.method}</span>
                <code className="min-w-0 truncate font-mono text-xs">{ep.path}</code>
                <ArrowRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="contract" eyebrow="The contract" title={DOC?.title ?? "Institutional API (read-only)"}>
        {DOC ? (
          <>
            <nav aria-label="On this page" data-testid="institutional-doc-toc" className="mb-8 rounded-xl border border-line-subtle bg-surface p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">On this page</p>
              <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {DOC.headings
                  .filter((h) => h.level === 2)
                  .map((h, i) => (
                    <li key={h.id} className="min-w-0">
                      <a href={`#${h.id}`} className={cn("inline-flex min-h-11 items-center rounded-sm text-action underline decoration-dotted underline-offset-4 hover:text-action-hover", MOTION, FOCUS_RING)}>
                        {i + 1}. {h.text}
                      </a>
                    </li>
                  ))}
              </ol>
            </nav>
            <Prose measure="wide">
              {/* Rendered by lib/markdown/lite from the repo document: escaped, token classes only. */}
              <div data-testid="institutional-doc" dangerouslySetInnerHTML={{ __html: DOC.html }} />
            </Prose>
          </>
        ) : (
          <Prose measure="wide">
            <p data-testid="institutional-doc-missing">
              The contract document could not be read at build time. The source of truth is <code>{INSTITUTIONAL_DOC_REPO_PATH}</code> in the repository —{" "}
              <a href={INSTITUTIONAL_DOC_GITHUB_URL} rel="noopener">
                read it on GitHub
              </a>
              . The endpoint pages above are generated from the same registry and stay current.
            </p>
          </Prose>
        )}
        <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted" data-testid="institutional-doc-source">
          <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>
            Source: <code className="font-mono [overflow-wrap:anywhere]">{INSTITUTIONAL_DOC_REPO_PATH}</code> — rendered at build; the machine-readable copy is{" "}
            <a href="/api/openapi.json" className={cn("inline-flex min-h-11 items-center rounded-sm text-action underline underline-offset-4 hover:text-action-hover", MOTION, FOCUS_RING)}>
              /api/openapi.json
            </a>
            .{" "}
            <a href={INSTITUTIONAL_DOC_GITHUB_URL} rel="noopener" className={cn("inline-flex min-h-11 items-center rounded-sm text-action underline underline-offset-4 hover:text-action-hover", MOTION, FOCUS_RING)}>
              View the file on GitHub
            </a>
          </span>
        </p>
      </Section>

      <CtaBand
        title="Mint a key and read your first cohort"
        sub="Keys are created under Workspace → Settings → Enterprise → API keys with the evaluations:read scope. The Evaluator API v1 (read/write) sits beside it on the same reference."
        primary={{ href: "/developers/api#institutional", label: "Open the API reference", ctaId: "institutional_doc_reference" }}
        secondary={{ href: "/methodology/governance", label: "Score governance" }}
      />
    </MarketingShell>
  );
}
