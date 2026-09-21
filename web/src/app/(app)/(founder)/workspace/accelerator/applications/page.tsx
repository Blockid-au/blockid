// /workspace/accelerator/applications — Intake inbox (G14 S35).
//
// Replaces the S31-B "not available yet" card. The evaluator creates
// intake links (/apply/<slug>), founders apply with a deck, every
// application lands here scored: SVI (latest snapshot), coverage heat
// (8 dims strong / partial / missing), status, dossier link, "Score now"
// (the same preview-then-confirm ReportDialog the evaluations page uses —
// 1 report from the plan quota or credits) and a CSV export. Also linked
// from /workspace/investor/dealflow ("Intake inbox").
//
// Gate: `intake.manage` OR the evaluator persona (lib/intake/access.ts).
// Founder-track users see the locked card with the evaluator pricing link.
// Readers tolerate a missing 0405 table (empty state).

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { canManageIntake } from "@/lib/intake/access";
import { listInboxRows, listMyIntakes } from "@/lib/intake/program-intakes";
import { listTemplates } from "@/lib/intake/templates";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";
import { IntakeInboxClient } from "./intake-inbox-client";

export const metadata: Metadata = {
  title: "Intake inbox | Workspace | BlockID",
  description: "Program intake links and every scored application they received.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/accelerator/applications");

  const [isSandbox, allowed] = await Promise.all([getCurrentProjectIsSandbox(), canManageIntake(user)]);
  const [intakes, rows, templates] = allowed ? await Promise.all([listMyIntakes(user.id), listInboxRows(user.id), listTemplates(user.id)]) : [[], [], []];

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="intake-inbox-page">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <nav className="text-sm text-ink-500" aria-label="Breadcrumb">
              <Link href="/workspace/evaluations" className="hover:text-ink-700">
                Startups I&apos;m evaluating
              </Link>
              <span className="mx-2">/</span>
              <span className="text-ink-700">Intake inbox</span>
            </nav>
            <h1 className="mt-1 text-2xl font-semibold text-ink-900">Intake inbox</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-600">
              Share one link per program round. Every founder who applies lands here with their deck classified on the 8 SVI dimensions — score the ones you want to see in full.
            </p>
          </div>
        </header>

        {allowed ? (
          <IntakeInboxClient initialIntakes={intakes} initialRows={rows} templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
        ) : (
          <section className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-14 text-center" data-testid="intake-locked">
            <h2 className="text-lg font-semibold text-ink-900">Intake links are an evaluator feature</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
              Firm, Program, Fund and every Programs plan from the Intake link up can publish an application link and receive a scored inbox.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/pricing?segment=evaluator" className="inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-elev-1">
                See evaluator plans
              </Link>
              <Link href="/workspace/evaluations" className="inline-flex min-h-11 items-center rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                Startups I&apos;m evaluating
              </Link>
            </div>
          </section>
        )}

        <EvaluatorReportDisclaimer variant="compact" />
      </div>
    </WorkspaceLayout>
  );
}
