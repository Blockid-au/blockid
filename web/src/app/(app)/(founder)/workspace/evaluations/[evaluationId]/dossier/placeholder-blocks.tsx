// Investor Dossier — blocks 2–6 as labelled placeholders (S-D1 scope: BA
// spec §A.2 says each block is a server component; S-D1 ships block 1 in
// full and the rest as honest placeholders that link to the existing
// surface where one exists). Server components, no client JS.
//
//   2 Valuation           → S-R3 persists the 5-method VcValuationReport;
//                           link to the full report meanwhile.
//   3 Evidence & access   → counts by dimension (every tier) + the tier
//                           note; the item list + request-access CTA is S-D3.
//   4 Evaluator assessment→ decision / version / history summary for the
//                           assessor; "private" for the founder; the form is
//                           S-D2. Never renders an assessment field to the
//                           founder (§C.1).
//   5 Progress radar      → S-D3 (single-evaluation selector); link to the
//                           evaluations list where the weekly Δ lives today.
//   6 Actions & audit     → S-D3; re-score / full report already live on the
//                           evaluations list.

import Link from "next/link";
import { DIM_ORDER, DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import { tierLabel } from "@/lib/mentor/access-tiers";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import type { DossierView } from "@/lib/evaluations/dossier";
import { fmtDate } from "./dossier-header";

function Block({ n, title, testId, children }: { n: number; title: string; testId: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`dossier-block-${n}`} className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6" data-testid={testId}>
      <h2 id={`dossier-block-${n}`} className="text-lg font-semibold text-ink-900">
        {n} · {title}
      </h2>
      <div className="mt-3 text-sm text-ink-600">{children}</div>
    </section>
  );
}

export function ValuationBlock({ view }: { view: DossierView }) {
  return (
    <Block n={2} title="Valuation" testId="dossier-block-2">
      <p>
        Five-method range (revenue multiple · Berkus · DCF proxy · comparables · risk-factor summation) with the consensus band and the founder&apos;s ask lands here once the pipeline persists it at snapshot time (S-R3).
      </p>
      {view.report.links.fullReport ? (
        <p className="mt-2">
          <a href={view.report.links.fullReport} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
            See the valuation chapter in the full Trusted Business Report →
          </a>
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-500">Run the Trusted Business Report to get a valuation range.</p>
      )}
    </Block>
  );
}

export function EvidenceBlock({ view }: { view: DossierView }) {
  const e = view.evidence;
  return (
    <Block n={3} title="Evidence & data-room access" testId="dossier-block-3">
      <p>
        Consent tier <strong>{tierLabel(e.tier)}</strong>:{" "}
        {e.tier === "attributed_only"
          ? "evidence counts per dimension only — invite the founder to share reports to see the items."
          : e.tier === "reports_shared"
            ? "evidence items with source and freshness; data-room files need the founder's full-mentor grant."
            : "every evidence item, connected-source freshness and the data-room index."}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4" data-testid="evidence-counts">
        {DIM_ORDER.map((d) => (
          <li key={d} className="flex justify-between rounded-lg bg-surface-50 px-2.5 py-1.5">
            <span className="font-medium text-ink-800">{DIMENSION_OWNERS[d].shortLabel}</span>
            <span className="tabular-nums text-ink-600">{e.countsByDimension[d]}</span>
          </li>
        ))}
      </ul>
      {e.items ? (
        <p className="mt-3 text-xs text-ink-500" data-testid="evidence-items-note">
          {e.items.length} item{e.items.length === 1 ? "" : "s"} visible at this tier
          {e.connectedProviders.length ? ` · connected: ${e.connectedProviders.join(", ")}` : ""}. The full list with source kind and freshness ships in S-D3.
        </p>
      ) : (
        <p className="mt-3 text-xs text-ink-500" data-testid="evidence-masked-note">
          Items are masked at this tier. {e.requestUpgrade ? `Request ${tierLabel(e.requestUpgrade)} access from the founder (S-D3).` : ""}
        </p>
      )}
      <p className="mt-3 rounded-lg bg-surface-50 px-3 py-2 text-xs text-ink-600">{DATA_PRINCIPLE_SENTENCE}</p>
    </Block>
  );
}

export function AssessmentBlock({ view }: { view: DossierView }) {
  const a = view.assessment;
  const founder = view.viewer.role === "founder";
  return (
    <Block n={4} title="Evaluator assessment" testId="dossier-block-4">
      {founder ? (
        <p data-testid="assessment-private">
          Your evaluator&apos;s assessment is private. If they choose to share it, only the sections they tick (dimension ratings, risks, questions for you, shared notes) appear here.
          {a.sharedWithFounder ? ` Shared on ${fmtDate(a.sharedWithFounder.sharedWithFounderAt)} — ${a.sharedWithFounder.sharedFields.length} section(s).` : ""}
        </p>
      ) : !a.available ? (
        <p data-testid="assessment-unavailable">Assessment not available yet — the assessments table (migration 0392) has not been applied on this environment.</p>
      ) : a.mine ? (
        <div data-testid="assessment-mine">
          <p>
            Your current view: <strong className="uppercase">{a.mine.decision ?? "no decision"}</strong> · conviction {a.mine.conviction ?? "—"}/5 · v{a.mine.version} ({a.mine.status})
            {a.mine.submittedAt ? ` · submitted ${fmtDate(a.mine.submittedAt)}` : ""}
          </p>
          {a.history.length > 1 ? <p className="mt-1 text-xs text-ink-500">{a.history.length} versions — the diff timeline lands in S-D2.</p> : null}
        </div>
      ) : (
        <p data-testid="assessment-empty">No assessment yet. The AI-vs-me form (per-dimension rating, risks, questions, PASS / TRACK / PROCEED) lands in S-D2.</p>
      )}
    </Block>
  );
}

export function ProgressBlock() {
  return (
    <Block n={5} title="Progress radar" testId="dossier-block-5">
      <p>
        Weekly Δ, movers per dimension and deadlines for this startup alone land in S-D3. Today the weekly view lives on{" "}
        <Link href="/workspace/evaluations" className="text-brand-700 hover:underline">
          Startups I&apos;m evaluating
        </Link>
        .
      </p>
    </Block>
  );
}

export function ActionsBlock({ view }: { view: DossierView }) {
  return (
    <Block n={6} title="Actions & audit trail" testId="dossier-block-6">
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Re-score (A$1) and the full Trusted Business Report (A$3) — from the row on{" "}
          <Link href="/workspace/evaluations" className="text-brand-700 hover:underline">
            Startups I&apos;m evaluating
          </Link>
          .
        </li>
        <li>Add to watchlist · request intro · add to batch · export IC memo — S-D3.</li>
        <li className="text-xs text-ink-500">Every dossier view is written to the audit trail ({view.viewer.role}).</li>
      </ul>
    </Block>
  );
}
