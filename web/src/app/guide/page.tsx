/**
 * /guide — index of the 12-chapter BlockID Startup Journey guide.
 *
 * The individual chapters live at /guide/[chapter] (dynamic segment) and
 * /guide/reports + /guide/scn already exist. The bare `/guide` path was
 * a 404 despite being referenced from footers, CTAs, and internal cross-links
 * (see how-it-works, business-id, and hero surfaces). This index lists all
 * 12 chapters so the entry point is real and crawlable.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { listChapters } from "@/lib/guide/startup-journey";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/guide`;

export const metadata: Metadata = {
  title: "The 12-Chapter Startup Journey — BlockID Guide",
  description:
    "A step-by-step playbook for Australian founders — from Day-0 vision through fundraise to exit. 12 chapters covering ideation, PMF, revenue, team, funding, and scale.",
  keywords: [
    "startup journey guide",
    "founder playbook",
    "australian startup guide",
    "12 chapter startup",
    "blockid guide",
  ],
  openGraph: {
    title: "The 12-Chapter Startup Journey — BlockID Guide",
    description:
      "A step-by-step playbook for Australian founders — from Day-0 vision through fundraise to exit.",
    type: "website",
    url: CANONICAL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "The 12-Chapter Startup Journey — BlockID Guide",
    description:
      "A step-by-step playbook for Australian founders — from Day-0 vision through fundraise to exit.",
  },
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
};

export default function GuideIndexPage() {
  const chapters = listChapters();

  return (
    <div className="min-h-svh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar />

      <main className="mx-auto max-w-5xl px-6 pt-24 pb-16">
        <header className="mb-10 text-center">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-brand-700">
            The BlockID Guide
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            The 12-Chapter Startup Journey
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
            A step-by-step playbook for Australian founders — from Day-0 vision
            through fundraise to exit. Every chapter maps to a BlockID workspace
            action, a report template, and the AU-specific tooling founders
            actually reach for at that stage.
          </p>
          <div className="mt-6 flex justify-center gap-3 text-sm">
            <Link
              href="/guide/reports"
              className="rounded-full border border-slate-300 px-4 py-2 hover:border-brand-500 dark:border-slate-700"
            >
              Report library
            </Link>
            <Link
              href="/guide/scn"
              className="rounded-full border border-slate-300 px-4 py-2 hover:border-brand-500 dark:border-slate-700"
            >
              Startup Content Network
            </Link>
          </div>
        </header>

        <ol className="grid gap-4 sm:grid-cols-2">
          {chapters.map((c, i) => (
            <li key={c.slug}>
              <Link
                href={`/guide/${c.slug}`}
                className="block h-full rounded-2xl border border-slate-200 bg-white p-6 transition-colors hover:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-2 flex items-baseline gap-3">
                  <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                    Ch {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">
                    {c.phaseLabel.en}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {c.title.en}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {c.summary.en}
                </p>
              </Link>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ready to move from reading to shipping?
          </p>
          <div className="mt-4 flex justify-center gap-3 text-sm">
            <Link
              href="/svi"
              className="rounded-full bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700"
            >
              Analyse an idea
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-slate-300 px-5 py-2 hover:border-brand-500 dark:border-slate-700"
            >
              See pricing
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
