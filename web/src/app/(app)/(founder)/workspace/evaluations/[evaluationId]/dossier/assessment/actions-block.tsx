// Block 6 — Actions & audit trail (G13-W4-D2, S-D2; BA spec §A.3 block 6,
// §C.2). Server component, no client JS.
//
//   assessor → the actions that exist today (re-score A$1 · full Trusted
//              Business Report A$3 · full report link when one was run) and
//              the audit-trail summary for THIS seat's assessment: what was
//              written (`assessment.saved` / `assessment.submitted`), whether
//              it is shared (`assessment.shared`) and how to revoke
//              (`assessment.share_revoked`) — every event is an HMAC-chained
//              `audit_events` row with ids only, never note bodies.
//   founder  → what is logged about them (their dossier views) and what
//              they can never see (§C.1).
//
// Watchlist / portfolio / intro / batch / IC memo remain S-D3 and are named
// as such rather than rendered as dead buttons.

import Link from "next/link";
import type { DossierView } from "@/lib/evaluations/dossier";

const AUDIT_ACTIONS = [
  { action: "dossier.viewed", when: "every time this page or its API is opened (100 % sampled)" },
  { action: "assessment.saved", when: "each draft save (autosave included) — field names that changed, never the text" },
  { action: "assessment.submitted", when: "each submit — decision, conviction, version" },
  { action: "assessment.shared", when: "each share — the ticked sections" },
  { action: "assessment.share_revoked", when: "each revoke — the versions that stopped being visible" },
] as const;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function ActionsBlock({ view }: { view: DossierView }) {
  const founder = view.viewer.role === "founder";
  const mine = view.assessment.mine;
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
              <li>Answering their questions in-app lands in a later sprint — reply by email for now.</li>
            </ul>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-5" data-testid="actions-assessor">
              <li>
                Re-score (A$1) and the full Trusted Business Report (A$3) — from the row on{" "}
                <Link href="/workspace/evaluations" className="text-brand-700 hover:underline">
                  Startups I&apos;m evaluating
                </Link>
                .
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
              <li className="text-ink-500">Add to watchlist · request intro · add to batch · export IC memo — S-D3.</li>
            </ul>
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
              <ul className="mt-2 space-y-1 text-xs" data-testid="audit-actions">
                {AUDIT_ACTIONS.map((a) => (
                  <li key={a.action}>
                    <code className="rounded bg-surface-100 px-1 py-0.5 text-[11px] text-ink-800">{a.action}</code> <span className="text-ink-600">— {a.when}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">
                Export your own log from{" "}
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
