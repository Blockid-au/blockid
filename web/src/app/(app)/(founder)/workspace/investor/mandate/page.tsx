// /workspace/investor/mandate — the 7-section investor mandate editor
// (G13-W3-T2, BA spec §B.7 / §B.10 T3). Replaces the renamed preferences
// stub. Server component: loads the caller's mandates (0393), the form
// prefill (primary mandate → one-release read-through of investor_prefs →
// empty), the plan limit and the persona; the client form does the rest.
//
// Evaluator personas get the full form. A founder who lands here (URL
// only — the hub tab is evaluator-scoped) sees the explanatory copy and
// no form: mandates are an investor surface.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getInvestorVisibility } from "@/lib/investor-portal";
import { canEditWeights, listMandates, mandateDraftFor, mandateLimitFor } from "@/lib/investors/mandates";
import { MandateForm } from "./mandate-form";

export const metadata: Metadata = {
  title: "Mandate — Workspace — BlockID",
  description:
    "Set your investment mandate — sectors, business models, stage, cheque size, geography, traction floors and tags — so deal-flow and “Investors who match” rank against it.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InvestorMandatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor/mandate");

  const [isSandbox, visibility] = await Promise.all([getCurrentProjectIsSandbox(), getInvestorVisibility(user.id)]);

  const evaluator = visibility.evaluator;
  const [list, draft, limit] = evaluator
    ? await Promise.all([listMandates(user.id), mandateDraftFor(user.id, visibility.discoverable), mandateLimitFor(user.plan)])
    : [null, null, null];

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6" data-investor-mandate data-mandates={list?.mandates.length ?? 0}>
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/investor" className="hover:text-brand-600">
            Investor
          </Link>{" "}
          / <span className="text-ink-700">Mandate</span>
        </nav>

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Your mandate</h1>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Your mandate tells BlockID what to surface. Seven sections — identity, appetite, stage &amp; cheque, geography,
            traction floors, tags &amp; ESG and (Program) weights — feed one fit score: deal-flow ranks every consented startup
            against it nightly, and founders whose startup fits see you under “Investors who match”. Leave a section empty to
            mean “any”.
          </p>
        </header>

        {evaluator && list && draft ? (
          <>
            {list.mandates.length > 1 ? (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4" aria-label="Your mandates" data-mandate-list>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Your mandates</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {list.mandates.map((m) => (
                    <li key={m.id} className="rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs text-ink-800" data-mandate-chip={m.id}>
                      {m.label}
                      {m.is_default ? " · default" : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink-500">
                  Editing the default mandate below. Deal-flow can switch between mandates with the mandate picker.
                </p>
              </section>
            ) : null}
            <MandateForm
              draft={draft.draft}
              draftSource={draft.source}
              canEditWeights={canEditWeights(user.plan)}
              limit={limit === Number.MAX_SAFE_INTEGER ? null : limit}
              mandateCount={list.mandates.length}
              migrated={list.migrated}
            />
          </>
        ) : (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3" data-mandate-founder-copy>
            <h2 className="text-lg font-semibold text-ink-900">Fields covered</h2>
            <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
              <li>Sectors and business models to include or exclude.</li>
              <li>Stage focus, cheque band, lead / follow and ownership target.</li>
              <li>Geography: Australian states, ANZ, APAC or global.</li>
              <li>Traction floors: revenue, growth and a minimum SVI.</li>
              <li>Tags (ESIC, R&amp;DTI, university spin-out …) and ESG constraints.</li>
            </ul>
            <p className="text-sm text-ink-600">
              Mandates are an investor surface. Founders see the result on{" "}
              <Link href="/workspace/investors" className="font-semibold text-brand-600 hover:text-brand-700">
                Investors who match
              </Link>
              .
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Where it shows up</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/workspace/investor/dealflow"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Deal flow
            </Link>
            <Link
              href="/workspace/settings/notifications"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Digest cadence
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
