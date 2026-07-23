"use client";

// Client cell for the "Stage" column on the reseller customers table.
//
// Renders the canonical VC-journey stage label using the same shared
// `useLocale()` cookie that the rest of the reseller console honours, so
// EN/VI stays consistent across the row. Data is derived server-side from
// the customer's latest SVI score by `deriveCanonicalStage()` — this cell
// only picks the localised label.
//
// See docs/plans/real-world-workflow-parity-audit-2026-07-23.md §3+§6 gap #3.

import { CANONICAL_STAGE_LABELS, type StageKey } from "@/lib/journey-vocabulary";
import { useLocale } from "@/lib/use-locale";

interface Props {
  stage: StageKey;
}

export function StageCell({ stage }: Props) {
  const [locale] = useLocale();
  const labels = CANONICAL_STAGE_LABELS[stage];
  const primary = locale === "vi" ? labels.label_vi : labels.label_en;
  const secondary = locale === "vi" ? labels.label_en : labels.label_vi;
  return (
    <span
      className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800"
      title={secondary}
    >
      {primary}
    </span>
  );
}
