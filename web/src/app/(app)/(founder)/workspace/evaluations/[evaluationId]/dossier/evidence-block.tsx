// Block 3 — Evidence & data-room access (G13-W5-D3, S-D3; BA spec §A.3
// block 3, §A.5 E3.4, §C.1). Server component; the request-upgrade CTA is
// the small client button below.
//
//   attributed_only  counts per dimension only (masked server-side in the
//                    loader) + "what the next tier unlocks" + CTA "Invite
//                    founder to share reports" (the existing claim flow).
//   reports_shared   the full item list grouped by dimension — type, label,
//                    source kind on the EVIDENCE_BONUS ladder, freshness —
//                    connector freshness, public URLs; CTA "Request
//                    data-room access" (notifies the claimed founder).
//   full_mentor      everything + document links + the data-room index link.
//
// The allow-list per tier is `DOSSIER_FIELD_ALLOW_LIST` (lib/mentor/
// access-tiers.ts) and is printed as the "what you see / locked" legend so
// the evaluator never wonders why a column is empty. Supersedes the S-D1
// placeholder in placeholder-blocks.tsx.

import Link from "next/link";
import { DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { DOSSIER_FIELD_ALLOW_LIST, DOSSIER_FIELD_LABELS, dossierFieldsUnlockedBy, tierLabel } from "@/lib/mentor/access-tiers";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import type { DossierEvidenceItem, DossierView } from "@/lib/evaluations/dossier";
import { DossierBlock as Block } from "./block";
import { RequestAccessButton } from "./request-access-button";

/** EVIDENCE_BONUS ladder (lib/svi-analysis.ts) → the label an evaluator reads. */
export const SOURCE_KIND_LABEL: Record<string, { label: string; tone: string }> = {
  self_declared: { label: "Self-declared", tone: "bg-surface-100 text-ink-600" },
  public_url: { label: "Public URL", tone: "bg-blue-50 text-blue-800" },
  document_uploaded: { label: "Document uploaded", tone: "bg-violet-50 text-violet-800" },
  connected_source: { label: "Connected source", tone: "bg-emerald-50 text-emerald-800" },
  transaction_data: { label: "Transaction data", tone: "bg-emerald-50 text-emerald-800" },
  third_party_verified: { label: "Third-party verified", tone: "bg-emerald-100 text-emerald-900" },
};

export function freshnessLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "undated";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "undated";
  const days = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
  if (days === 0) return "today";
  if (days < 30) return `${days} d ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} y ago`;
}

export function groupByDimension(items: DossierEvidenceItem[]): Array<{ dim: DimKey; items: DossierEvidenceItem[] }> {
  return DIM_ORDER.map((dim) => ({ dim, items: items.filter((i) => i.dimension === dim) })).filter((g) => g.items.length > 0);
}

export function EvidenceBlock({ view }: { view: DossierView }) {
  const e = view.evidence;
  const founder = view.viewer.role === "founder";
  const unlock = dossierFieldsUnlockedBy(e.tier);
  const have = DOSSIER_FIELD_ALLOW_LIST[e.tier];
  const groups = e.items ? groupByDimension(e.items) : [];
  return (
    <Block n={3} title="Evidence & data-room access" testId="dossier-block-3">
      <p>
        Consent tier <strong data-testid="evidence-tier">{tierLabel(e.tier)}</strong>
        {founder ? " — this is what your evaluator sees at the tier you granted." : e.tier === "attributed_only" ? " — counts only until the founder shares reports." : e.tier === "reports_shared" ? " — every evidence item with its source kind and freshness; data-room files need the founder's full-mentor grant." : " — every item, document links and the data-room index."}
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4" data-testid="evidence-counts">
        {DIM_ORDER.map((d) => (
          <li key={d} className="flex justify-between rounded-lg bg-surface-50 px-2.5 py-1.5">
            <span className="font-medium text-ink-800">{DIMENSION_OWNERS[d].shortLabel}</span>
            <span className="tabular-nums text-ink-600">{e.countsByDimension[d]}</span>
          </li>
        ))}
      </ul>

      {e.connectedProviders.length > 0 ? (
        <p className="mt-3 text-xs text-ink-600" data-testid="evidence-connectors">
          Connected sources: {e.connectedProviders.join(", ")} — connector freshness is read from the latest snapshot.
        </p>
      ) : null}

      {e.items ? (
        e.items.length === 0 ? (
          <p className="mt-3 text-xs text-ink-500" data-testid="evidence-items-empty">
            No evidence rows yet — every criterion is self-declared until the founder adds documents or connects a source.
          </p>
        ) : (
          <div className="mt-4 space-y-3" data-testid="evidence-items">
            {groups.map((g) => (
              <div key={g.dim}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {DIMENSION_OWNERS[g.dim].shortLabel} · {g.items.length}
                </h3>
                <ul className="mt-1 divide-y divide-surface-100 rounded-lg border border-surface-200">
                  {g.items.slice(0, 12).map((it, i) => {
                    const kind = SOURCE_KIND_LABEL[it.confidence] ?? SOURCE_KIND_LABEL.self_declared;
                    return (
                      <li key={`${g.dim}-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs" data-testid="evidence-item" data-source-kind={it.confidence}>
                        <span className={`rounded px-1.5 py-0.5 font-medium ${kind.tone}`}>{kind.label}</span>
                        <span className="text-ink-800">{it.label || it.type}</span>
                        <span className="text-ink-400">{it.type}</span>
                        <span className="ml-auto text-ink-500">{freshnessLabel(it.createdAt)}</span>
                        {it.url ? (
                          <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                            open
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                  {g.items.length > 12 ? <li className="px-3 py-1.5 text-xs text-ink-500">+{g.items.length - 12} more in the full report</li> : null}
                </ul>
              </div>
            ))}
          </div>
        )
      ) : (
        <p className="mt-3 text-xs text-ink-500" data-testid="evidence-masked-note">
          Items are masked at this tier — the founder has not shared reports with this evaluator yet.
        </p>
      )}

      {e.dataroomAvailable ? (
        <p className="mt-3 text-xs" data-testid="evidence-dataroom">
          <Link href={`/workspace/documents/data-room?project=${encodeURIComponent(view.header.projectSlug)}`} className="text-brand-700 hover:underline">
            Open the data-room index
          </Link>{" "}
          <span className="text-ink-500">· cap-table summary and exit-readiness are in the full report.</span>
        </p>
      ) : null}

      <details className="mt-4 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs" data-testid="evidence-legend">
        <summary className="cursor-pointer font-medium text-ink-800">What this tier shows ({have.length} of {Object.keys(DOSSIER_FIELD_LABELS).length} fields)</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {(Object.keys(DOSSIER_FIELD_LABELS) as Array<keyof typeof DOSSIER_FIELD_LABELS>).map((f) => {
            const on = (have as readonly string[]).includes(f);
            return (
              <li key={f} className={on ? "text-ink-800" : "text-ink-400 line-through"} data-field={f} data-visible={on ? "1" : "0"}>
                {on ? "✓" : "–"} {DOSSIER_FIELD_LABELS[f]}
              </li>
            );
          })}
        </ul>
      </details>

      {!founder && unlock.next ? (
        <div className="mt-4 rounded-xl border border-line-subtle border-l-4 border-l-brand-navy bg-surface-sunken px-4 py-3" data-testid="evidence-upgrade-cta">
          <p className="text-sm font-medium text-ink-900">
            {unlock.next === "reports_shared" ? "Invite the founder to share reports" : "Request data-room access"}
          </p>
          <p className="mt-1 text-xs text-ink-600">
            {tierLabel(unlock.next)} unlocks: {unlock.fields.map((f) => DOSSIER_FIELD_LABELS[f]).join(" · ")}.
          </p>
          <RequestAccessButton evaluationId={view.header.evaluationId} nextTier={unlock.next} founderClaimed={view.header.founderClaimed} />
        </div>
      ) : null}
      {founder ? (
        <p className="mt-4 text-xs text-ink-600">
          Change what this evaluator can see on{" "}
          <Link href="/workspace/investors/access" className="text-brand-700 hover:underline">
            Investor access
          </Link>
          .
        </p>
      ) : null}
      <p className="mt-3 rounded-lg bg-surface-50 px-3 py-2 text-xs text-ink-600">{DATA_PRINCIPLE_SENTENCE}</p>
    </Block>
  );
}
