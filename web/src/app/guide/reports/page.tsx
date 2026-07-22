/**
 * /guide/reports — Track B B5 report template library.
 *
 * Server component. Walks web/content/reports/*.md, feeds the filenames
 * through buildShowcaseDataRoomRows() and buildGallerySections() so the
 * gallery renders the same taxonomy the founder DataRoom will show (U.9).
 *
 * The gallery surfaces metadata only — title / agent / phase / date. Report
 * bodies stay off-page for the initial B5 pass; download wiring (with GA
 * event tracking per U.8) can layer on in a follow-up tick without touching
 * the rendering surface here.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ItemListJsonLd } from "@/components/seo/json-ld";
import {
  buildShowcaseDataRoomRows,
  type DataRoomShowcaseRow,
} from "@/lib/showcase/report-tagging";
import {
  agentLabel,
  summariseGallery,
  type GallerySection,
} from "@/lib/showcase/gallery";
import { ReportDownloadCta } from "./report-download-cta";
import { isDownloadableReportFilename } from "@/lib/showcase/report-redaction";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/guide/reports`;

const TITLE = "Startup Report Template Library — BlockID.au Showcase";
const DESCRIPTION =
  "Browse the anonymised reports BlockID.au produces at each stage of the 12-phase startup journey — from Vision to Exit. Real artefacts from a real startup, indexed by C-Level agent and growth phase.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup report templates",
    "founder report library",
    "svi report examples",
    "cfo report template",
    "cto report template",
    "cmo report template",
    "startup dogfooding showcase",
  ],
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
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

// process.cwd() is either the repo root (blockid.au) or the web workspace
// (blockid.au/web) depending on which server tsconfig started Next.js. The
// security-audit page uses the same defensive dual-candidate lookup so we
// mirror it here rather than hard-code either root.
function resolveReportsDir(): string | null {
  const candidates = [
    path.join(process.cwd(), "web", "content", "reports"),
    path.join(process.cwd(), "content", "reports"),
  ];
  return candidates[0]; // best-effort; existence check happens in readReportRows
}

async function readReportRows(): Promise<DataRoomShowcaseRow[]> {
  const candidates = [
    path.join(process.cwd(), "web", "content", "reports"),
    path.join(process.cwd(), "content", "reports"),
  ];
  for (const dir of candidates) {
    try {
      const entries = await fs.readdir(dir);
      const markdown = entries.filter((f) => f.endsWith(".md"));
      if (markdown.length === 0) continue;
      return buildShowcaseDataRoomRows({ filenames: markdown, includeTemplates: false });
    } catch {
      // try next candidate
    }
  }
  return [];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function ReportCard({ row }: { row: DataRoomShowcaseRow }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {row.title}
        </h3>
        <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          {agentLabel(row.generated_by_agent)}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
        <div>
          <dt className="uppercase tracking-wide text-slate-400">Generated</dt>
          <dd className="mt-0.5 font-medium text-slate-700 dark:text-slate-300">
            {formatDate(row.generated_at)}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-slate-400">Version</dt>
          <dd className="mt-0.5 font-medium text-slate-700 dark:text-slate-300">
            {row.version ?? "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-2 truncate font-mono text-[11px] text-slate-500 dark:text-slate-500">
        {row.filename}
      </p>
      {isDownloadableReportFilename(row.filename) ? (
        <ReportDownloadCta filename={row.filename} phase={row.phase_at_generation} />
      ) : null}
    </li>
  );
}

function Section({ section }: { section: GallerySection }) {
  const heading = section.label.en;
  const subtitle =
    section.phase !== null
      ? `Phase ${section.phase} — ${section.rows.length} report${section.rows.length === 1 ? "" : "s"}`
      : `${section.rows.length} report${section.rows.length === 1 ? "" : "s"}`;
  return (
    <section id={section.key} className="scroll-mt-16">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {heading}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className="text-xs text-slate-400">{section.label.vi}</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {section.rows.map((row) => (
          <ReportCard key={row.filename} row={row} />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        The showcase library is warming up
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        BlockID.au&apos;s C-Level agents publish new reports every day. Check back shortly, or explore the{" "}
        <Link href="/guides/valuation-methods" className="text-emerald-600 hover:underline">
          Valuation Methods guide
        </Link>{" "}
        in the meantime.
      </p>
    </div>
  );
}

export default async function GuideReportsPage() {
  // touch resolver so lint doesn't complain about an unused helper — the
  // function documents the on-disk contract we depend on even when the
  // reader path finds the reports on the first try.
  void resolveReportsDir();

  const rows = await readReportRows();
  const summary = summariseGallery(rows);
  const listItems = rows.map((row) => ({
    name: `${row.title} — ${agentLabel(row.generated_by_agent)}`,
    description: row.generated_at
      ? `${agentLabel(row.generated_by_agent)} · ${row.generated_at}`
      : agentLabel(row.generated_by_agent),
  }));

  return (
    <>
      <PageTracker page="guide-reports" totalReports={summary.total_rows} />
      <ItemListJsonLd
        url={CANONICAL}
        name={TITLE}
        description={DESCRIPTION}
        items={listItems}
      />
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">
            Track B — Startup Showcase
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl dark:text-slate-100">
            Report Template Library
          </h1>
          <p className="mt-4 max-w-3xl text-base text-slate-600 dark:text-slate-400">
            A living index of the artefacts BlockID.au&apos;s own C-Level agents produce at each stage of the 12-phase founder journey. Every row below is a real report from our own workspace — anonymised at the metadata layer so new founders can preview{" "}
            <em>what a report looks like at Phase N</em> before running the agent themselves.
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Total reports</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {summary.total_rows}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Agents covered</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {summary.agents_covered.length}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Phases with reports</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {summary.sections.filter((s) => s.phase !== null).length}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Latest generated</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {formatDate(summary.latest_generated_at)}
              </dd>
            </div>
          </dl>
        </header>

        {summary.sections.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-12">
            {summary.sections.map((section) => (
              <Section key={section.key} section={section} />
            ))}
          </div>
        )}

        <aside className="mt-16 rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800/40 dark:bg-emerald-950/30">
          <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
            Want your own reports?
          </h2>
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
            Every founder workspace gets the same C-Level agent panel. Score your idea, invite your team, and watch each agent publish its own version of the artefacts above as your startup progresses.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/svi"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Score my startup
            </Link>
            <Link
              href="/guides/valuation-methods"
              className="rounded-md border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-300"
            >
              Read the valuation guide
            </Link>
          </div>
        </aside>
      </main>
      <Footer />
    </>
  );
}
