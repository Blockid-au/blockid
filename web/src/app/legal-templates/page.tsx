/**
 * /legal-templates — public listing of AU legal templates (round 5.6d).
 *
 * Renders a card grid of the three legal templates shipped under
 * `web/content/templates/legal/*.md`. Public — no auth required.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { listTemplates } from "@/lib/templates/legal-templates";

const SITE_URL = "https://blockid.au";

export const dynamic = "force-static";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "AU Legal Templates — BlockID.au",
  description:
    "AU-flavoured constitution, ESOP scheme rules, and SAFE — starting-point legal templates for Australian startups. Template only; not legal advice.",
  alternates: { canonical: `${SITE_URL}/legal-templates` },
  robots: { index: true, follow: true },
};

const CATEGORY_LABEL: Record<string, string> = {
  corporate: "Corporate",
  employment: "Employment / ESOP",
  fundraising: "Fundraising",
};

export default function LegalTemplatesIndex() {
  const templates = listTemplates();

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          AU Legal Templates
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
          Starting-point legal templates for Australian startups
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          Three AU-flavoured templates founders and investors ask for most
          often — a modern Pty Ltd constitution, an ESOP scheme calibrated to
          the Div 83A start-up concession, and a post-money SAFE with NSW
          governing law. Every template is drafted with citations back to the
          Corporations Act 2001 (Cth) and Division 83A of the ITAA97.
        </p>
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <strong>Template only — not legal advice.</strong> Have every
          template reviewed by an Australian-qualified lawyer before adoption.
          BlockID does not hold an AFSL and cannot provide personal legal,
          financial, or tax advice.
        </div>
      </header>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => (
          <li
            key={tpl.slug}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-3 inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {CATEGORY_LABEL[tpl.category] ?? tpl.category}
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {tpl.title}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {tpl.summary}
            </p>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>v{tpl.version}</span>
              <span>{tpl.placeholders.length} placeholders</span>
            </div>
            <Link
              href={`/legal-templates/${tpl.slug}`}
              className="mt-5 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Preview template →
            </Link>
          </li>
        ))}
      </ul>

      <footer className="mt-16 border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Templates maintained by BlockID.au. Sourced against LawPath, Maddocks
        and Clayton Utz publicly available guidance, and the Y Combinator
        Post-Money SAFE (US) as the AU-flavoured baseline.
      </footer>
    </main>
  );
}
