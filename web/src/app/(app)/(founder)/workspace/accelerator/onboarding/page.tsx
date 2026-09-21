// /workspace/accelerator/onboarding — the Cohort onboarding kit (G25,
// 2026-09-21; was the pilot delivery kit at /workspace/accelerator/pilot,
// G21 P2-C — that path 301s here). The paid Cohort Validation Pilot and its
// conversion coupon were retired by the founder ("bỏ luôn coupon và
// pilot"): a program starts a Cohort plan (Cohort 25 / Cohort 100 annual,
// card-required trial) and runs its first cohort with this kit.
//
//   1. Checklist  Demo → Setup → Intake → Assessment → Workshop → Report,
//                 ticks derived from the data (the demo batch, intake links,
//                 applications, scored items, decisions, the captured
//                 metrics) — never a stored flag.
//   2. Metrics    the success-metric capture form (COHORT_SUCCESS_METRICS →
//                 lib/accelerator/onboarding-metrics.ts) saved per
//                 organisation on org_settings.onboarding_metrics (0438),
//                 with the case-study consent checkbox (published only
//                 with it). Owner edits; a seat / admin preview reads.
//   3. Consent    what applicants see — APPLICANT_CONSENT_TEXT
//                 (lib/accelerator/applicant-consent.ts), the default for
//                 intake templates.
//
// Without a Cohort-tier seat the page shows the h1 and one card that
// points at the sold ladder (/pricing?segment=programs) plus the demo
// cohort — no purchase, no conversion, nothing "pilot". Server component;
// the h1 sits outside every gate.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { checklistFromMetrics } from "@/lib/accelerator/onboarding-metrics";
import { readOnboardingMetricsForOrg } from "@/lib/accelerator/onboarding-store";
import { resolveOrgAdmin } from "@/lib/org/admin";
import { APPLICANT_CONSENT_LABEL, APPLICANT_CONSENT_POINTS, APPLICANT_CONSENT_TEXT } from "@/lib/accelerator/applicant-consent";
import { loadIntakeSummary, loadProgramJourney } from "@/lib/evaluations/program-journey-data";
import { OnboardingMetricsForm } from "./onboarding-metrics-form";
import { hasDemoBatch } from "@/lib/evaluations/demo-cohort";
import { loadDemoCohortLabels } from "@/lib/evaluations/demo-cohort-labels";
import { LoadDemoCohortButton } from "@/components/evaluations/DemoCohortActions";
import { getEntitlements } from "@/lib/entitlements";
import { canBatchScore } from "@/lib/evaluations/batch-shared";
import { getMessages } from "@/lib/i18n/t";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Cohort onboarding kit · BlockID Cohort",
  description: "Checklist, success metrics and the applicant consent screen for your first cohort on a Cohort plan.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The sold ladder for programs — the only place this page sends a buyer. */
const PROGRAMS_PRICING_HREF = "/pricing?segment=programs";

export default async function CohortOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/accelerator/onboarding");
  const [isSandbox, demoLabels, demoRun, flags, orgAdmin] = await Promise.all([
    getCurrentProjectIsSandbox(),
    loadDemoCohortLabels(),
    hasDemoBatch(user.id),
    getEntitlements(user.plan ?? "", user.id).catch(() => [] as string[]),
    resolveOrgAdmin({ id: user.id, plan: user.plan ?? null }).catch(() => ({ status: "no_org" as const, org: null, seats: [] as string[], isOwner: false })),
  ]);
  // G24-C: the checklist's demo pre-step copy from the catalogue (EN under VI).
  const demoStepCopy = await (async () => {
    try {
      const store = await cookies();
      const locale = store.get("blockid_lang")?.value === "vi" ? "vi" : "en";
      const [en, local] = await Promise.all([getMessages("en"), getMessages(locale)]);
      return { demoLabel: local["demoCohort.checklist.label"] ?? en["demoCohort.checklist.label"], demoDetail: local["demoCohort.checklist.detail"] ?? en["demoCohort.checklist.detail"] };
    } catch {
      return {};
    }
  })();
  // A Cohort-tier seat (trial or paid) is what unlocks batch scoring.
  const seatActive = canBatchScore(flags);
  const admin = user.role === "admin";
  const showKit = seatActive || admin;

  let kit: { checklist: ReturnType<typeof checklistFromMetrics>; scored: number; decided: number; metrics: Awaited<ReturnType<typeof readOnboardingMetricsForOrg>> | null } | null = null;
  if (showKit) {
    const [intake, stored] = await Promise.all([loadIntakeSummary(user.id), orgAdmin.org ? readOnboardingMetricsForOrg(orgAdmin.org.id) : Promise.resolve(null)]);
    const { view } = await loadProgramJourney(user, { intake });
    const metrics = stored?.metrics ?? {};
    const decided = view.sponsor.decisions.pass + view.sponsor.decisions.track + view.sponsor.decisions.proceed;
    kit = {
      metrics: stored,
      scored: view.assessment.scored,
      decided,
      checklist: checklistFromMetrics(metrics, { seatActive, intakeLinks: intake.links, submissions: intake.submissions, scored: view.assessment.scored, decided, demoRun }, view.sponsor.snapshots > 0 && view.stages.find((s) => s.key === "sponsor")?.state === "done", demoStepCopy),
    };
  }

  const canEdit = Boolean(seatActive && orgAdmin.org && orgAdmin.isOwner && kit?.metrics?.available);
  const readOnlyNote = !orgAdmin.org
    ? "Read-only — no organisation on this account yet."
    : !orgAdmin.isOwner
      ? "Read-only — only the organisation owner records these metrics."
      : kit?.metrics && !kit.metrics.available
        ? "Read-only — metrics storage is not enabled on this deployment yet."
        : "Read-only preview.";

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <header>
          <nav className="text-sm text-tertiary" aria-label="Breadcrumb">
            <Link href="/workspace/accelerator" className="hover:text-primary">
              BlockID Cohort
            </Link>
            <span className="mx-2">/</span>
            <span className="text-secondary">Cohort onboarding kit</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-primary">Cohort onboarding kit</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            {seatActive
              ? "Demo → Setup → Intake → Assessment → Workshop → Report, with the success metrics we measure together in your first cohort."
              : admin
                ? "Admin preview — no Cohort seat on this account; the checklist reads your own workspace and the form is read-only."
                : "Demo → Setup → Intake → Assessment → Workshop → Report, with the success metrics we measure together in your first cohort."}
          </p>
        </header>

        {!showKit ? (
          <section className="rounded-2xl border border-line-subtle bg-surface p-6" data-testid="onboarding-start-card">
            <h2 className="text-lg font-semibold text-primary">Start a cohort</h2>
            <p className="mt-2 max-w-2xl text-sm text-secondary">
              A Cohort plan takes one real intake or your existing cohort end to end — intake, assessment on one rubric, evidence confidence, the cohort table, top gaps, the Cohort Report and a feedback workshop. This kit switches on with your Cohort seat; the plan starts with a card-required trial and the price is shown before you pay.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={PROGRAMS_PRICING_HREF} className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover">
                See the Cohort plans
              </Link>
              <Link href="/workspace/accelerator" className="inline-flex min-h-11 items-center rounded-lg border border-line-subtle bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover">
                Back to the program journey
              </Link>
            </div>
            {/* G24-C: try the workflow first — Import CSV beside Load a demo cohort (evaluator seats only). */}
            {canBatchScore(flags) ? (
              <div className="mt-4 flex flex-wrap items-start gap-2" data-testid="onboarding-demo-actions">
                <Link href="/workspace/evaluations/cohort" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-subtle bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover">
                  {demoLabels.importCsv}
                </Link>
                <LoadDemoCohortButton labels={demoLabels} />
              </div>
            ) : null}
          </section>
        ) : null}

        {kit ? (
          <>
            <section aria-labelledby="onboarding-checklist-h" data-testid="onboarding-checklist">
              <h2 id="onboarding-checklist-h" className="text-lg font-semibold text-primary">
                Onboarding checklist
              </h2>
              <ol className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {kit.checklist.map((item, i) => (
                  <li key={item.key} className="rounded-2xl border border-line-subtle bg-surface p-4" data-step={item.key} data-done={item.done ? "1" : "0"}>
                    <div className="flex items-center gap-2">
                      {item.done ? <CheckCircle2 className="h-5 w-5 text-bull" aria-hidden="true" /> : <Circle className="h-5 w-5 text-tertiary" aria-hidden="true" />}
                      <span className="text-sm font-semibold text-primary">
                        {i + 1}. {item.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-secondary">{item.detail}</p>
                    <p className="mt-1 text-xs font-medium text-secondary">{item.done ? "Done" : "Not yet"}</p>
                    {item.key === "demo" && !item.done && seatActive ? (
                      <div className="mt-2 flex flex-wrap items-start gap-2" data-testid="onboarding-checklist-demo-actions">
                        <Link href="/workspace/evaluations/cohort" className="inline-flex min-h-11 items-center text-sm font-semibold text-action hover:underline">
                          {demoLabels.importCsv}
                        </Link>
                        <LoadDemoCohortButton labels={demoLabels} />
                      </div>
                    ) : (
                      <Link href={item.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-action hover:underline">
                        Open
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <section id="onboarding-metrics" aria-labelledby="onboarding-metrics-h" className="space-y-3">
              <div>
                <h2 id="onboarding-metrics-h" className="text-lg font-semibold text-primary">
                  Success metrics
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-secondary">Agreed on the setup call, read on the first Cohort Report. A failing signal is a finding we log, not a reason to discount. {kit.scored} scored · {kit.decided} decided so far.</p>
              </div>
              <OnboardingMetricsForm initial={kit.metrics?.metrics ?? {}} editable={canEdit} readOnlyNote={readOnlyNote} />
            </section>

            <section aria-labelledby="onboarding-consent-h" className="rounded-2xl border border-line-subtle bg-surface p-6" data-testid="applicant-consent-screen">
              <h2 id="onboarding-consent-h" className="text-lg font-semibold text-primary">
                What applicants see
              </h2>
              <p className="mt-1 text-sm text-secondary">The consent paragraph on your intake form. It is the default text of every intake template; founders tick it before they submit.</p>
              <blockquote className="mt-3 rounded-xl bg-surface-sunken p-4 text-sm text-primary" data-testid="applicant-consent-text">
                {APPLICANT_CONSENT_TEXT}
              </blockquote>
              <p className="mt-2 text-xs text-secondary">Checkbox label: “{APPLICANT_CONSENT_LABEL}”</p>
              <ul className="mt-3 space-y-1 text-sm text-secondary">
                {APPLICANT_CONSENT_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-bull" aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </WorkspaceLayout>
  );
}
