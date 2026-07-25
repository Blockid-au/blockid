// Startup Package — Public landing page (RSC)
//
// Marketing shell over a hero + 5-step value prop + dual CTA. Primary CTA
// starts the free mini-interview at /startup-package/interview. Secondary
// CTA hits POST /api/stripe/checkout with planId=founder_package (routed
// via the existing checkout endpoint) so the paid tier reuses the entire
// Stripe path.
//
// Server component — no client hooks. Client behaviour (the "Unlock"
// button POST) lives in a tiny client sub-component below.

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CheckoutButton } from "./checkout-button";

export const metadata: Metadata = {
  title: "Startup Package · Idea to investor-ready in 90 days",
  description:
    "Guided interview, C-Level AI analysis, real-time SVI, dataroom templates, public /startup/[slug] listing — one A$149 package.",
  openGraph: {
    title: "BlockID Startup Package — investor-ready in 90 days",
    description:
      "Guided interview + C-Level AI analysis + real-time SVI + Day-0 dataroom + public listing. One A$149 unlock, pay-as-you-go from there.",
    url: "https://blockid.au/startup-package",
    type: "website",
  },
  alternates: { canonical: "https://blockid.au/startup-package" },
};

const VALUE_STEPS = [
  {
    n: "1",
    title: "Guided interview",
    body: "8 short questions, ~15 minutes. Answers autosave and feed the agent pipeline.",
  },
  {
    n: "2",
    title: "C-Level AI analysis",
    body: "CTO, CMO, CFO, CHRO, CLO — each pass surfaces real risks and next steps.",
  },
  {
    n: "3",
    title: "Real-time SVI",
    body: "Startup Value Index recomputes with every answer, so you see the delta live.",
  },
  {
    n: "4",
    title: "Day-0 dataroom",
    body: "Pitch deck, one-pager, founder pack, valuation memo — auto-drafted and downloadable.",
  },
  {
    n: "5",
    title: "Public /startup/[slug]",
    body: "Investor-ready listing with SVI, deck, reserved allocation — share with one URL.",
  },
] as const;

export default function StartupPackagePage() {
  return (
    <MarketingShell>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-400">
          Founder Package · Ship 1
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-slate-100 sm:text-5xl">
          Start your investor-ready startup in 90 days
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">
          A guided interview, seven C-Level agents, a live Startup Value Index,
          and a Day-0 dataroom — one A$149 unlock and pay-as-you-go from there.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/startup-package/interview"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400"
          >
            Get your sample analysis (free)
          </Link>
          <CheckoutButton
            planId="founder_package"
            label="Unlock full Package · A$149"
          />
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Free sample uses your monthly founder credits — no card required.
        </p>
      </section>

      {/* ── 5-step value prop ────────────────────────────────────── */}
      <section
        aria-labelledby="how-it-works"
        className="mx-auto max-w-5xl px-6 py-10"
      >
        <h2
          id="how-it-works"
          className="text-center text-2xl font-semibold text-slate-100"
        >
          How the Package works
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {VALUE_STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"
            >
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-semibold text-cyan-300"
              >
                {step.n}
              </span>
              <h3 className="mt-3 text-base font-semibold text-slate-100">
                {step.title}
              </h3>
              <p className="mt-1 text-sm text-slate-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Under-the-hood credibility ───────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 py-10 text-slate-300">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-100">
            What's inside your A$149 unlock
          </h2>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <li>• 25 seed credits (~25 agent passes)</li>
            <li>• 4 auto-agent passes on the interview</li>
            <li>• Day-0 dataroom (10 templates)</li>
            <li>• Public /startup/[slug] listing</li>
            <li>• DB-first reserved cap-table allocation</li>
            <li>• Weekly progress email (phase-aware)</li>
            <li>• Live SVI meter as you type</li>
            <li>• Downloadable PDF pack + investor one-pager</li>
          </ul>
          <p className="mt-6 text-xs text-slate-500">
            Every additional agent report or auto-fill deliverable charges from
            your credit balance. You always see the credit cost and target word
            count before we spend anything.
          </p>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-24 pt-10 text-center">
        <h2 className="text-2xl font-semibold text-slate-100">
          Ready to see your first score?
        </h2>
        <p className="mt-2 text-slate-400">
          The sample interview takes about 3 minutes and runs one CEO agent
          on your text — no card required.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/startup-package/interview"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Start the free interview
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-slate-400 underline hover:text-slate-200"
          >
            Compare plans
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
