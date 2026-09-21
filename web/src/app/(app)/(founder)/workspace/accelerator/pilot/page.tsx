// /workspace/accelerator/pilot — the pilot delivery kit (G21 P2-C, 2026-09-20).
//
// Visible in full when the caller has a live paid Cohort Validation Pilot
// (`pilot_orders`, G21 P0-C) — or, for an admin, as a read-only preview of
// the kit. Everyone else gets the short "Book a pilot" card → /pilot.
//
//   1. Checklist  Setup → Intake → Assessment → Workshop → Report, ticks
//                 derived from the data (intake links, applications, scored
//                 items, decisions, the captured metrics) — never a stored flag.
//   2. Metrics    the success-metric capture form (PILOT_SUCCESS_METRICS →
//                 lib/pilots/metrics.ts) saved on pilot_orders.metrics, with
//                 the case-study consent checkbox (published only with it).
//   3. Consent    what applicants see — APPLICANT_CONSENT_TEXT
//                 (lib/pilots/consent.ts), the default for intake templates.
//   4. Convert    (G23-B) "Convert to Cohort 25 / Cohort 100 (annual)" —
//                 the offer is computed here (`conversionOffer`, env NAME
//                 only), the card posts convert_from_pilot to the checkout
//                 or links /contact?topic=pilot when the coupon is unset.
//
// Server component; the h1 sits outside every gate.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { findActivePilotOrder, findLatestPilotOrder } from "@/lib/pilots/paid-orders";
import { PILOT_SKUS, formatPilotPriceLong, isPilotSkuId } from "@/lib/pricing/pilot-skus";
import { conversionOfferView } from "@/lib/pilots/conversion";
import { PilotConvertCard } from "./pilot-convert-card";
import { checklistFromMetrics, readPilotMetrics } from "@/lib/pilots/metrics";
import { APPLICANT_CONSENT_LABEL, APPLICANT_CONSENT_POINTS, APPLICANT_CONSENT_TEXT } from "@/lib/pilots/consent";
import { loadIntakeSummary, loadProgramJourney } from "@/lib/evaluations/program-journey-data";
import { PilotMetricsForm } from "./pilot-metrics-form";

export const metadata: Metadata = {
  title: "Pilot delivery kit · BlockID Cohort",
  description: "Checklist, success metrics and the applicant consent screen for your Cohort Validation Pilot.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
}

export default async function PilotKitPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const searchParams = props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/accelerator/pilot");
  const [isSandbox, order, sp] = await Promise.all([getCurrentProjectIsSandbox(), findActivePilotOrder(user.id), searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({})]);
  const admin = user.role === "admin";
  const showKit = Boolean(order) || admin;
  // G23-B — the conversion card outlives the entitlement by the credit
  // window, so an ended pilot still reads its newest paid order.
  const convertSource = order ?? (admin ? null : await findLatestPilotOrder(user.id));
  const convert = convertSource ? conversionOfferView(convertSource) : null;
  const justConverted = sp?.converted === "1";

  let kit: { checklist: ReturnType<typeof checklistFromMetrics>; metrics: ReturnType<typeof readPilotMetrics>; scored: number; decided: number } | null = null;
  if (showKit) {
    const intake = await loadIntakeSummary(user.id);
    const { view } = await loadProgramJourney(user, { intake });
    const metrics = readPilotMetrics(order?.metrics ?? {});
    const decided = view.sponsor.decisions.pass + view.sponsor.decisions.track + view.sponsor.decisions.proceed;
    kit = {
      metrics,
      scored: view.assessment.scored,
      decided,
      checklist: checklistFromMetrics(metrics, { orderPaid: Boolean(order), intakeLinks: intake.links, submissions: intake.submissions, scored: view.assessment.scored, decided }, view.sponsor.snapshots > 0 && view.stages.find((s) => s.key === "sponsor")?.state === "done"),
    };
  }

  const cap = order?.applicants_cap ?? (isPilotSkuId(order?.sku) ? PILOT_SKUS[order.sku].applicantsCap : null);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <header>
          <nav className="text-sm text-tertiary" aria-label="Breadcrumb">
            <Link href="/workspace/accelerator" className="hover:text-primary">
              BlockID Cohort
            </Link>
            <span className="mx-2">/</span>
            <span className="text-secondary">Pilot delivery kit</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-primary">Pilot delivery kit</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            {order
              ? `Cohort Validation Pilot active — up to ${cap} applicants · until ${fmtDate(order.entitlement_until)} · ${isPilotSkuId(order.sku) ? formatPilotPriceLong(order.sku) : ""}`
              : admin
                ? "Admin preview — no live pilot order on this account; the checklist reads your own workspace and the form is read-only."
                : "Setup → Intake → Assessment → Workshop → Report, with the success metrics we measure together."}
          </p>
        </header>

        {!showKit ? (
          <section className="rounded-2xl border border-line-subtle bg-surface p-6" data-testid="pilot-book-card">
            <h2 className="text-lg font-semibold text-primary">Book a pilot</h2>
            <p className="mt-2 max-w-2xl text-sm text-secondary">
              The BlockID Cohort Validation Pilot takes one real intake or your existing cohort end to end — intake, assessment on one rubric, evidence confidence, the cohort table, top gaps, the Cohort Report and a feedback workshop. This kit switches on the moment the pilot is paid.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/pilot" className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover">
                See the pilot
              </Link>
              <Link href="/workspace/accelerator" className="inline-flex min-h-11 items-center rounded-lg border border-line-subtle bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover">
                Back to the program journey
              </Link>
            </div>
          </section>
        ) : null}

        {!showKit && convert ? <PilotConvertCard offer={convert} /> : null}

        {justConverted ? (
          <p role="status" className="rounded-xl border border-bull/30 bg-bull/5 px-4 py-3 text-sm text-primary" data-testid="pilot-converted-banner">
            Thanks — your Cohort plan is starting. The pilot credit is on the first invoice; the card below updates once Stripe confirms the subscription.
          </p>
        ) : null}

        {kit ? (
          <>
            <section aria-labelledby="pilot-checklist-h" data-testid="pilot-checklist">
              <h2 id="pilot-checklist-h" className="text-lg font-semibold text-primary">
                Delivery checklist
              </h2>
              <ol className="mt-3 grid gap-3 md:grid-cols-5">
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
                    <Link href={item.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-action hover:underline">
                      Open
                    </Link>
                  </li>
                ))}
              </ol>
            </section>

            {convert ? <PilotConvertCard offer={convert} /> : null}

            <section id="pilot-metrics" aria-labelledby="pilot-metrics-h" className="space-y-3">
              <div>
                <h2 id="pilot-metrics-h" className="text-lg font-semibold text-primary">
                  Success metrics
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-secondary">Agreed on the setup call, read on the final report. A failing signal is a finding we log, not a reason to discount. {kit.scored} scored · {kit.decided} decided so far.</p>
              </div>
              {order ? <PilotMetricsForm orderId={order.id} initial={kit.metrics} editable /> : <PilotMetricsForm orderId="preview" initial={kit.metrics} editable={false} />}
            </section>

            <section aria-labelledby="pilot-consent-h" className="rounded-2xl border border-line-subtle bg-surface p-6" data-testid="pilot-consent-screen">
              <h2 id="pilot-consent-h" className="text-lg font-semibold text-primary">
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
