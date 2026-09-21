// G21 P3-C — "Which claim does this make more trustworthy?" on every
// connector card, plus the freshness badge and the "Not offered" list.
//
// Server-safe (no hooks, no fetch): the Integrations page composes these
// around the existing cards so the evidence value is stated whether the
// connector is connected, not yet connected, hidden behind an unprovisioned
// OAuth app, or a Priority-2/3 integration that is listed but not offered.
// Data comes from lib/connectors/evidence-value.ts; freshness from
// lib/evidence/freshness.ts. Colour never carries the meaning alone — every
// badge and chip has its text.

import Link from "next/link";
import { CheckCircle2, Clock3, AlertTriangle, CircleDashed, MessageSquare } from "lucide-react";
import {
  DIMENSION_LABEL,
  EVIDENCE_LEVEL_LABEL,
  connectorEvidenceValue,
  type ConnectorEvidenceValue,
} from "@/lib/connectors/evidence-value";
import { freshnessLine, type ConnectorFreshness } from "@/lib/evidence/freshness";
import { NOT_OFFERED_LABEL, contactHrefForFeature } from "@/components/workspace/not-offered-card";

const BADGE: Record<ConnectorFreshness["state"], { className: string; icon: typeof CheckCircle2 }> = {
  fresh: { className: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", icon: CheckCircle2 },
  ageing: { className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200", icon: Clock3 },
  stale: { className: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200", icon: AlertTriangle },
  never: { className: "border-line-subtle bg-surface-sunken text-secondary", icon: CircleDashed },
};

/** The freshness badge for a connected source — text + icon, never colour alone. */
export function FreshnessBadge({ freshness }: { freshness: ConnectorFreshness }) {
  const b = BADGE[freshness.state];
  const Icon = b.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${b.className}`}
      data-freshness={freshness.state}
      data-freshness-provider={freshness.provider}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {freshnessLine(freshness)}
    </span>
  );
}

export function DimensionChips({ dimensions }: { dimensions: ConnectorEvidenceValue["dimensions"] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Dimensions this source strengthens">
      {dimensions.map((d) => (
        <li key={d} className="rounded-full border border-line-subtle bg-surface px-2 py-0.5 text-[11px] font-medium text-secondary" data-dimension={d}>
          {DIMENSION_LABEL[d]}
        </li>
      ))}
    </ul>
  );
}

/**
 * The strip under a connector card: dimension chips · evidence level · the
 * one sentence · (connected) freshness badge.
 */
export function ConnectorEvidenceStrip({ id, freshness }: { id: string; freshness?: ConnectorFreshness | null }) {
  const v = connectorEvidenceValue(id);
  if (!v) return null;
  return (
    <div className="mt-2 rounded-lg border border-line-subtle bg-surface-sunken px-4 py-3" data-evidence-value={v.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">Strengthens</span>
        <DimensionChips dimensions={v.dimensions} />
        <span className="rounded-full border border-line-subtle px-2 py-0.5 text-[11px] font-medium text-secondary" data-evidence-level={v.level}>
          {EVIDENCE_LEVEL_LABEL[v.level]}
        </span>
        {freshness ? <FreshnessBadge freshness={freshness} /> : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-secondary" data-evidence-sentence>
        {v.sentence}
      </p>
    </div>
  );
}

export interface NotOfferedConnectorItem {
  value: ConnectorEvidenceValue;
  /** `HIDDEN_FEATURES` key (or the registry id) — `?feature=` on the contact link. */
  featureKey: string;
  /** Why it is not offered on this deployment (the hidden-feature reason, or the registry sentence). */
  reason: string;
}

/** The "Not offered" list — one compact row per connector, each with the claim it would strengthen. */
export function NotOfferedConnectorsList({ items }: { items: NotOfferedConnectorItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="not-offered-connectors-heading" className="space-y-3" data-testid="not-offered-connectors">
      <div>
        <h2 id="not-offered-connectors-heading" className="text-base font-semibold text-primary">
          Not offered on this deployment
        </h2>
        <p className="mt-1 text-xs text-muted">
          Listed so you know which claim each one would make more trustworthy. Nothing here is promised; ask and we will tell you what it would take.
        </p>
      </div>
      <ul className="divide-y divide-line-subtle rounded-lg border border-line-subtle bg-surface">
        {items.map((it) => (
          <li key={it.value.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between" data-not-offered={it.value.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-primary">{it.value.name}</span>
                <span className="rounded-full border border-line-subtle px-2 py-0.5 text-[11px] font-medium text-secondary">{NOT_OFFERED_LABEL}</span>
                <span className="rounded-full border border-line-subtle px-2 py-0.5 text-[11px] font-medium text-secondary" data-evidence-level={it.value.level}>
                  would reach {EVIDENCE_LEVEL_LABEL[it.value.level]}
                </span>
              </div>
              <div className="mt-1.5">
                <DimensionChips dimensions={it.value.dimensions} />
              </div>
              <p className="mt-1.5 text-sm text-secondary" data-evidence-sentence>
                {it.value.sentence}
              </p>
              {it.reason !== it.value.sentence ? <p className="mt-1 text-xs text-muted">{it.reason}</p> : null}
            </div>
            <Link
              href={contactHrefForFeature(it.featureKey)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-action/40"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Talk to us
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
