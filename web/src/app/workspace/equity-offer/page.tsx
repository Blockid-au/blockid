// Workspace › Equity Offer (Equity-for-Solution intake landing).
//
// Server component. Gated by `equity_offer.request` entitlement via
// <FeatureGate>. NO auto-issuance happens here — this page only describes
// the programme and links to the request-a-call intake form.
//
// The disclaimer body comes from the canonical registry in
// `@/lib/legal/surfaces` (surface = 'equity_offer_page'). We fall back to
// inline copy that matches the surface body_md byte-for-byte so consent
// hashing stays deterministic if the surface entry is ever unavailable.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { getSurface } from "@/lib/legal/surfaces";

export const metadata: Metadata = {
  title: "Pay in Equity — Enterprise Solution + Equity",
  description:
    "Request-a-call intake for BlockID's Enterprise-for-Equity programme.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const FALLBACK_DISCLAIMER = `**Not an offer to issue securities.** This page describes a *request-a-call* intake for a possible equity-for-solution engagement. No securities are being offered, issued, or transferred through this interface. Any subsequent issuance would only occur (a) after execution of a written agreement between the startup and the recipient, (b) under an available exemption in the Corporations Act 2001 (Cth) such as s708 (small-scale personal offers) or s708(8)/(11) (sophisticated / professional investor), and (c) after BlockID.au's internal legal review has been passed. BlockID.au does not act as an intermediary, dealer, or advisor for securities transactions and does not hold an Australian Financial Services Licence. Prospective participants must independently satisfy any wholesale-investor requirements and obtain their own legal, tax, and financial advice.`;

const INDICATIVE_TERMS: Array<{
  stage: string;
  band: string;
  vesting: string;
  instrument: string;
}> = [
  {
    stage: "Idea / Pre-seed",
    band: "5–10%",
    vesting: "2y monthly, 3mo cliff",
    instrument: "Advisory SAFE",
  },
  {
    stage: "Seed",
    band: "3–7%",
    vesting: "2y monthly, 6mo cliff",
    instrument: "Warrant + Option",
  },
  {
    stage: "Series A+",
    band: "1–5%",
    vesting: "2y monthly, 6mo cliff",
    instrument: "Options / RSAs",
  },
];

export default async function EquityOfferPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/equity-offer");

  const surface = getSurface("equity_offer_page");
  const disclaimerBody = surface?.body_md ?? FALLBACK_DISCLAIMER;

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <FeatureGate
          feature="equity_offer.request"
          label="Pay in Equity"
        >
          <header className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Pay in Equity: Enterprise Solution + 5–10% Equity
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              A request-a-call intake for founders who want BlockID Enterprise
              delivered against an equity component rather than pure cash.
            </p>
          </header>

          {/* Big, unmissable disclaimer block at the top */}
          <section
            aria-label="Legal disclaimer"
            className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-900/20 p-5"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
              Read this first
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-amber-900 dark:text-amber-100">
              {disclaimerBody}
            </p>
            <p className="mt-3 text-xs font-medium text-amber-900/80 dark:text-amber-100/80">
              Not financial advice. Seek independent counsel. This is not an
              offer of securities.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              What BlockID Enterprise delivers
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc list-inside">
              <li>
                Full Scale-tier stack: SVI, valuation, cap-table, ESOP,
                investor portal, data room, unlimited AI reports.
              </li>
              <li>
                Dedicated Customer Success Manager and priority engineering
                support.
              </li>
              <li>
                Quarterly LP-grade reports produced by the C-Level agent suite
                with counsel-reviewed disclaimers.
              </li>
              <li>
                Optional blockchain sync of the cap table (display-only
                mirror; legal title stays off-chain).
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Indicative terms
              </h2>
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Indicative
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              For discussion only. Actual terms depend on counsel review,
              company stage, valuation, and jurisdiction.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-4">Stage</th>
                    <th className="py-2 pr-4">Equity band</th>
                    <th className="py-2 pr-4">Vesting</th>
                    <th className="py-2 pr-4">Instrument</th>
                  </tr>
                </thead>
                <tbody>
                  {INDICATIVE_TERMS.map((row) => (
                    <tr
                      key={row.stage}
                      className="border-b border-slate-100 dark:border-slate-900 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-200">
                        {row.stage}
                      </td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                        {row.band}
                      </td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                        {row.vesting}
                      </td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                        {row.instrument}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/30 dark:to-slate-950 p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Ready to talk?
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Submit an intake and our legal + CS team will contact you within
              3 business days. No obligation. No securities issued at intake.
            </p>
            <div className="mt-4">
              <Link
                href="/workspace/equity-offer/request"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
              >
                Request a Call
              </Link>
            </div>
          </section>

          <NotFinancialAdvice kind="equity_offer_disclaimer" compact />
        </FeatureGate>
      </div>
    </WorkspaceLayout>
  );
}
