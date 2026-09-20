// Evidence checklist — G21 P1-C. Server-renderable; one card per SVI
// dimension: what is claimed, what is missing (top items from the
// catalogue), what raises confidence (the next rung + the plain cap rule),
// one CTA to that dimension's evidence page. Data comes from the pure
// `buildEvidenceChecklist` (lib/svi/evidence-checklist.ts) so the founder
// landing and the Evidence hub render the same rows.

import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import type { EvidenceChecklistRow } from "@/lib/svi/evidence-checklist";

export interface EvidenceChecklistProps {
  rows: EvidenceChecklistRow[];
  /** Members without write access see the rows but no CTA. */
  canEdit?: boolean;
  /** How many missing items to list per dimension. */
  missingLimit?: number;
  /** Section heading level — the landing already has its h1; the hub too. */
  heading?: "h2" | "h3";
  className?: string;
}

export function EvidenceChecklist({ rows, canEdit = true, missingLimit = 3, heading = "h2", className }: EvidenceChecklistProps) {
  const H = heading;
  const claimed = rows.reduce((a, r) => a + r.claimed, 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  return (
    <section aria-labelledby="evidence-checklist-heading" className={className} data-testid="evidence-checklist" data-evidence-claimed={claimed} data-evidence-total={total}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-action" aria-hidden="true">
            <ClipboardCheck strokeWidth={1.75} className="h-4 w-4" />
          </span>
          <H id="evidence-checklist-heading" className="text-sm font-semibold text-primary">
            Evidence checklist
          </H>
        </div>
        <p className="text-xs text-secondary tabular-nums">
          {claimed} of {total} catalogue items on file across eight dimensions
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="list">
        {rows.map((r) => (
          <li key={r.dimension} className="flex min-w-0 flex-col rounded-xl border border-line-subtle bg-surface p-4" data-evidence-dimension={r.dimension} data-evidence-claimed={r.claimed}>
            <h3 className="text-sm font-semibold text-primary">{r.title}</h3>
            <p className="mt-1 text-xs text-secondary">{r.summary}</p>

            {r.missing.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">Missing</p>
                <ul className="mt-1 space-y-0.5 text-xs text-secondary">
                  {r.missing.slice(0, missingLimit).map((m) => (
                    <li key={m.code} className="flex justify-between gap-2">
                      <span className="truncate">{m.label}</span>
                      <span className="shrink-0 tabular-nums text-tertiary">+{m.estimatedSviImpact}</span>
                    </li>
                  ))}
                  {r.missing.length > missingLimit ? <li className="text-tertiary">+{r.missing.length - missingLimit} more</li> : null}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-xs text-secondary">Every catalogue item is on file.</p>
            )}

            {r.raise ? (
              <div className="mt-3 rounded-lg bg-surface-sunken p-2.5" data-evidence-raise={r.raise.level}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">Raises confidence to {r.raise.label}</p>
                <p className="mt-0.5 text-xs text-primary">{r.raise.action}</p>
                <p className="mt-1 text-[11px] leading-snug text-tertiary">
                  <span className="font-medium">{r.raise.who}:</span> {r.raise.rule}
                </p>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-surface-sunken p-2.5 text-xs text-secondary" data-evidence-raise="none">
                Third-party verified — the top rung. Keep it current.
              </p>
            )}

            {canEdit ? (
              <Link href={r.cta.href} className="mt-3 inline-flex min-h-9 items-center gap-1 self-start text-xs font-semibold text-action hover:underline" data-testid={`evidence-checklist-cta-${r.dimension}`}>
                {r.cta.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
