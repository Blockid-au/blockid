// /workspace/accelerator/templates — intake template editor (G21 P2-A).
//
// A program's reusable question set + rubric weights + consent text
// (intake_templates, migration 0422) that /apply/<slug> renders when a link
// is created with it, and that a BlockID Cohort is created with. Server
// component inside WorkspaceLayout; the h1 sits outside any gate (G20 sweep
// lesson) — a founder-track user sees the locked card with the evaluator
// pricing link under it. Gate: `intake.manage` OR the evaluator persona,
// the same rule as the intake inbox (lib/intake/access.ts).

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { canManageIntake } from "@/lib/intake/access";
import { listTemplates } from "@/lib/intake/templates";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { TemplatesEditor } from "@/components/evaluations/TemplatesEditor";

export const metadata: Metadata = {
  title: "Intake templates | Workspace | BlockID",
  description: "Reusable intake question sets, rubric weights and consent text for your program rounds.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/accelerator/templates");

  const [isSandbox, allowed] = await Promise.all([getCurrentProjectIsSandbox(), canManageIntake(user)]);
  const templates = allowed ? await listTemplates(user.id) : [];

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="templates-page">
        <header>
          <nav className="text-sm text-ink-500" aria-label="Breadcrumb">
            <Link href="/workspace/accelerator/applications" className="hover:text-ink-700">
              Intake inbox
            </Link>
            <span className="mx-2">/</span>
            <span className="text-ink-700">Templates</span>
          </nav>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Intake templates</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            The questions founders answer, the rubric weights your cohort table ranks by, and the consent text they see — reusable across every round. The SVI itself is never weighted.
          </p>
        </header>

        {allowed ? (
          <TemplatesEditor initialTemplates={templates} dataPrincipleSentence={DATA_PRINCIPLE_SENTENCE} />
        ) : (
          <div className="rounded-2xl border border-surface-200 bg-surface px-6 py-10 text-center" data-testid="templates-locked">
            <p className="text-sm text-ink-700">Intake templates come with the evaluator plans that include intake links (Firm, Program, Fund and every Programs rung).</p>
            <Link href="/pricing?segment=evaluator" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-elev-1">
              See evaluator plans
            </Link>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
