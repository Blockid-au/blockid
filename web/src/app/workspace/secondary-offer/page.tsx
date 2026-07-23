// Workspace › Secondary Offer (T_SVI_EXC_0012, v0.5).
//
// Founder-side intake landing for declaring a *secondary parcel offer*
// (existing shareholder selling into the sophisticated-investor pool).
// Server component. Auth-gated via getCurrentUser + redirect; then wraps
// the SecondaryOfferIntakeForm client child inside WorkspaceLayout.
//
// Regulatory posture (per T_SVI_EXC_0011 research): Path A — sophisticated
// investor only, no retail. This page describes the programme and prompts
// the founder to submit an *intent* (status='draft'). Actual matching to
// investors happens off-platform after admin promotes the offer to 'live'.
//
// The disclaimer body is inline (secondary-offer surface is not yet in the
// registry — see /home/dovanlong/blockid.au/web/src/lib/legal/surfaces.ts).
// Byte-for-byte constant so consent hashing stays deterministic once the
// surface is added.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { SecondaryOfferIntakeForm } from "./intake-form";

export const metadata: Metadata = {
  title: "Secondary Offer — Founder Intake",
  description:
    "Declare a secondary parcel offer to sophisticated investors (draft intent, no securities issued at intake).",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DISCLAIMER_BODY = `**Not an offer to issue securities.** This page collects a *draft intent* to sell an existing secondary parcel of shares to verified sophisticated / professional investors as defined in the Corporations Act 2001 (Cth). No securities are being offered, issued, transferred, or introduced through this interface. Any actual transaction would only occur (a) after execution of a written share sale agreement between seller and buyer, (b) under an available exemption in s708(8) / s708(11), and (c) after BlockID.au's internal legal review has been passed and the offer promoted to \`live\` status. BlockID.au does not act as an intermediary, dealer, or advisor for securities transactions and does not hold an Australian Financial Services Licence. Both seller and prospective buyer must independently satisfy any wholesale-investor requirements and obtain their own legal, tax, and financial advice.`;

const ELIGIBILITY_GATES: Array<{ label: string; requirement: string; why: string }> = [
  {
    label: "SVI ≥ 80",
    requirement: "Latest analysis SVI total ≥ 80",
    why: "Ensures the underlying company has passed a high evidence bar before it can appear to sophisticated buyers.",
  },
  {
    label: "Governance ≥ 60",
    requirement: "Latest analysis governance_score ≥ 60",
    why: "Cap table, board, and shareholder-agreement hygiene must be in place before secondary sales are surfaced.",
  },
  {
    label: "Sophisticated only",
    requirement: "Buyers must self-certify under s708(8) / s708(11)",
    why: "Retail buyers are not eligible for secondary parcels sold through this channel.",
  },
];

export default async function SecondaryOfferPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/secondary-offer");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Secondary Offer — Founder Intake
            </h1>
            <span className="inline-flex items-center rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
              Beta · Draft-only
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Declare an intent to sell an existing secondary parcel to
            verified sophisticated investors. Submissions start as{" "}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[11px]">
              draft
            </code>{" "}
            — nothing is listed publicly until legal review promotes the
            offer to <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[11px]">live</code>.
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
            {DISCLAIMER_BODY}
          </p>
          <p className="mt-3 text-xs font-medium text-amber-900/80 dark:text-amber-100/80">
            Not financial advice. Seek independent counsel. This is not an
            offer of securities.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Eligibility gates
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Enforced server-side by <code>/api/secondary-offer</code>. Any
            submission from a company that fails a gate is rejected with a
            403 explaining the score shortfall.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 pr-4">Gate</th>
                  <th className="py-2 pr-4">Requirement</th>
                  <th className="py-2 pr-4">Why</th>
                </tr>
              </thead>
              <tbody>
                {ELIGIBILITY_GATES.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-slate-100 dark:border-slate-900 last:border-0 align-top"
                  >
                    <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-200">
                      {row.label}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                      {row.requirement}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {row.why}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <SecondaryOfferIntakeForm />

        <NotFinancialAdvice kind="equity_offer_disclaimer" compact />
      </div>
    </WorkspaceLayout>
  );
}
