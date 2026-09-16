// Investor Dossier — block 3 as a labelled placeholder (S-D1 scope: BA spec
// §A.2 says each block is a server component; S-D1 shipped block 1 in full
// and the rest as honest placeholders). Blocks 2 (valuation-block.tsx) and 5
// (progress-block.tsx) are real since S-R4; blocks 4 and 6 live in
// ./assessment/* since S-D2. Server component, no client JS.
//
//   3 Evidence & access   → counts by dimension (every tier) + the tier
//                           note; the item list + request-access CTA is S-D3.

import { DIM_ORDER, DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import { tierLabel } from "@/lib/mentor/access-tiers";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import type { DossierView } from "@/lib/evaluations/dossier";
import { DossierBlock as Block } from "./block";

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
