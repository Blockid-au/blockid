// Block 6 — Actions & audit trail (G13-W4-D2 S-D2 · completed G13-W5-D3
// S-D3; BA spec §A.3 block 6, §A.5 E3.6, §C.2). Server component; the
// action bar (`../dossier-actions.tsx`) is the one client island.
//
//   assessor → Re-score A$1 / full Trusted Business Report A$3 (existing
//              dialogs on the evaluations row — nothing charged from here),
//              add to watchlist (writes `watchlist.project_id`), mark as
//              invested (`investor_portfolio`), request intro (Scout mailto ·
//              Firm/Program → the founder's `investor_contacts`), add to
//              batch (Program), export IC memo / one-pager (`ic_reports`),
//              share / revoke (block 4 footer) — and the audit trail: the
//              viewer's own HMAC-chained `audit_events` rows on this
//              evaluation, ids and actions only, never note bodies.
//   founder  → what is logged about them and what they can never see (§C.1).

import Link from "next/link";
import type { DossierView } from "@/lib/evaluations/dossier";
import { clampIcKind } from "@/lib/evaluations/ic-reports";
import { DossierActions } from "../dossier-actions";
import { formatAud } from "@/lib/plans-v2";
import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";
import { TRUST_REPORT_RESCORE_CREDITS } from "@/lib/credits-public";

const AUDIT_ACTION_LABEL: Record<string, string> = {
  "dossier.viewed": "Opened the dossier",
  "assessment.saved": "Saved a draft",
  "assessment.submitted": "Submitted an assessment",
  "assessment.shared": "Shared with the founder",
  "assessment.share_revoked": "Revoked the share",
  "assessment.bulk_set": "Bulk decision (cohort)",
  "ic_report.exported": "Exported IC memo",
  "dossier.watchlisted": "Added to watchlist",
  "portfolio.marked_invested": "Marked as invested",
  "intro.requested": "Requested an intro",
  "consent.requested": "Requested access",
};

export function fmtAuditTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function ActionsBlock({ view, plan, batchAllowed = false }: { view: DossierView; plan?: string | null; batchAllowed?: boolean }) {
  const founder = view.viewer.role === "founder";
  const mine = view.assessment.mine;
  // Scout → one-pager; Firm / Program → memo (the route clamps again server-side).
  const icKind = clampIcKind(plan, undefined);
  return (
    <section aria-labelledby="dossier-block-6" className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6" data-testid="dossier-block-6">
      <h2 id="dossier-block-6" className="text-lg font-semibold text-ink-900">
        6 · Actions & audit trail
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 text-sm text-ink-600 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Actions</h3>
          {founder ? (
            <ul className="mt-1 list-disc space-y-1 pl-5" data-testid="actions-founder">
              <li>
                Change what your evaluator can see on{" "}
                <Link href="/workspace/investors/access" className="text-brand-700 hover:underline">
                  Investor access
                </Link>{" "}
                (consent tier).
              </li>
              <li>
                Intro requests from evaluators land in your{" "}
                <Link href="/workspace/investors/pipeline" className="text-brand-700 hover:underline">
                  investor pipeline
                </Link>
                .
              </li>
            </ul>
          ) : (
            <div className="mt-2 space-y-3" data-testid="actions-assessor">
              <DossierActions evaluationId={view.header.evaluationId} founderClaimed={view.header.founderClaimed} founderEmailOnFile={view.header.ownerKind !== "evaluator"} icKind={icKind} batchAllowed={batchAllowed} />
              <ul className="list-disc space-y-1 pl-5 text-xs">
                <li>
                  Re-score ({formatAud(TRUST_REPORT_RESCORE_CREDITS)}) and the full Trusted Business Report ({trustReportPriceLabel()}) — from the row on{" "}
                  <Link href="/workspace/evaluations" className="text-brand-700 hover:underline">
                    Startups I&apos;m evaluating
                  </Link>{" "}
                  (cost shown before anything is charged).
                </li>
                {view.report.links.fullReport ? (
                  <li>
                    <a href={view.report.links.fullReport} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                      Open the latest full report
                    </a>
                    {view.report.links.pdf ? (
                      <>
                        {" · "}
                        <a href={view.report.links.pdf} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                          PDF
                        </a>
                      </>
                    ) : null}
                  </li>
                ) : null}
                <li>Share / revoke your assessment — block 4 footer.</li>
                <li>
                  Seats and the consensus table —{" "}
                  <Link href="/workspace/investor/team" className="text-brand-700 hover:underline">
                    manage your organisation
                  </Link>
                  .
                </li>
              </ul>
            </div>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Audit trail</h3>
          {founder ? (
            <p className="mt-1" data-testid="audit-founder">
              Your views of this preview are logged as <code>dossier.viewed</code>. Your evaluator&apos;s assessment events are theirs; you only ever receive the sections they shared.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink-500" data-testid="audit-status">
                {mine
                  ? `Current: v${mine.version} ${mine.status}${mine.submittedAt ? ` · submitted ${fmt(mine.submittedAt)}` : ""}${mine.sharedWithFounderAt ? ` · shared ${fmt(mine.sharedWithFounderAt)} (${mine.sharedFields.join(", ")})` : " · not shared"}`
                  : "No assessment written yet."}
              </p>
              {view.auditTrail.length === 0 ? (
                <p className="mt-2 text-xs text-ink-500" data-testid="audit-trail-empty">
                  No events yet on this evaluation — this view is being recorded now.
                </p>
              ) : (
                <ol className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs" data-testid="audit-trail">
                  {view.auditTrail.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-2" data-action={e.action}>
                      <span className="tabular-nums text-ink-400">{fmtAuditTs(e.ts)}</span>
                      <span className="text-ink-800">{AUDIT_ACTION_LABEL[e.action] ?? e.action}</span>
                      {e.summary ? <span className="text-ink-500">· {e.summary}</span> : null}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-2 text-xs text-ink-500">
                Every row is an HMAC-chained <code>audit_events</code> entry with ids only. Export your full log from{" "}
                <Link href="/workspace/settings/audit" className="text-brand-700 hover:underline">
                  Settings → Audit log
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
